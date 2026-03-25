/**
 * agente-monitor.js — Ponto Eletrônico + Monitoramento v5.0
 * IP tracking, geolocation (ipapi.co), work schedule, timeline, alerts
 */

const geoCache = new Map();

async function geolocateIP(ip) {
  if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.')) return { cidade: 'Rede local', estado: '', pais: '' };
  const cleanIp = ip.replace('::ffff:', '');
  if (geoCache.has(cleanIp)) return geoCache.get(cleanIp);
  try {
    const r = await fetch(`https://ipapi.co/${cleanIp}/json/`, { signal: AbortSignal.timeout(3000) });
    const d = await r.json();
    const geo = { cidade: d.city || '', estado: d.region || '', pais: d.country_name || '', isp: d.org || '' };
    geoCache.set(cleanIp, geo);
    setTimeout(() => geoCache.delete(cleanIp), 86400000);
    return geo;
  } catch { return { cidade: '?', estado: '', pais: '' }; }
}

function parseUA(ua) {
  if (!ua) return 'Desconhecido';
  const browser = ua.match(/(Chrome|Firefox|Safari|Edge|Opera|OPR)\/([\d.]+)/);
  const os = ua.match(/(Windows|Mac OS X|Linux|Android|iOS|iPhone)/i);
  return `${browser ? (browser[1] === 'OPR' ? 'Opera' : browser[1]) : '?'} / ${os ? os[1] : '?'}`;
}

export async function migrateMonitor() {
  const { query } = await import("./db.js");
  await query(`CREATE TABLE IF NOT EXISTS agente_sessoes (id SERIAL PRIMARY KEY, agente_id TEXT NOT NULL, agente_nome TEXT, tipo TEXT NOT NULL, motivo TEXT, ip TEXT, user_agent TEXT, cidade TEXT, criado_em TIMESTAMPTZ DEFAULT NOW())`);
  await query(`CREATE INDEX IF NOT EXISTS idx_agente_sessoes_agente ON agente_sessoes(agente_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_agente_sessoes_criado ON agente_sessoes(criado_em)`);
  for (const col of ['ultimo_login TIMESTAMPTZ','ultimo_logout TIMESTAMPTZ','ultimo_heartbeat TIMESTAMPTZ',"status_atual TEXT DEFAULT 'offline'",'pausa_atual TEXT','ultimo_ip TEXT','ultima_cidade TEXT','ultimo_dispositivo TEXT',"horario_trabalho JSONB DEFAULT '{}'::jsonb",'totp_secret TEXT','totp_secret_pending TEXT','totp_ativo BOOLEAN DEFAULT false']) {
    await query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS ${col}`).catch(()=>{});
  }
  await query(`ALTER TABLE agente_sessoes ADD COLUMN IF NOT EXISTS cidade TEXT`).catch(()=>{});
  console.log("✅ Migração agente-monitor v5 concluída");
}

export async function registrarEvento(agenteId, tipo, extras = {}) {
  const { query } = await import("./db.js");
  const ip = extras.ip || null;
  const ua = extras.userAgent || null;
  let cidade = null;
  if (ip && (tipo === 'login' || tipo === 'heartbeat')) {
    try { const geo = await geolocateIP(ip); cidade = geo.cidade ? `${geo.cidade}${geo.estado ? '/' + geo.estado : ''}` : null; } catch {}
  }
  await query(`INSERT INTO agente_sessoes (agente_id, agente_nome, tipo, motivo, ip, user_agent, cidade) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [agenteId, extras.nome||null, tipo, extras.motivo||null, ip, ua, cidade]);
  const device = parseUA(ua);
  if (tipo === "login") await query(`UPDATE agentes SET online=true, ultimo_login=NOW(), ultimo_heartbeat=NOW(), status_atual='online', pausa_atual=NULL, ultimo_ip=$2, ultima_cidade=$3, ultimo_dispositivo=$4 WHERE id=$1`, [agenteId, ip, cidade, device]);
  else if (tipo === "logout") await query(`UPDATE agentes SET online=false, ultimo_logout=NOW(), status_atual='offline', pausa_atual=NULL WHERE id=$1`, [agenteId]);
  else if (tipo === "heartbeat") await query(`UPDATE agentes SET ultimo_heartbeat=NOW(), ultimo_ip=$2, ultima_cidade=$3, ultimo_dispositivo=$4, status_atual=CASE WHEN pausa_atual IS NOT NULL THEN 'pausa' ELSE 'online' END WHERE id=$1`, [agenteId, ip, cidade, device]);
  else if (tipo === "pausa_inicio") await query(`UPDATE agentes SET status_atual='pausa', pausa_atual=$2 WHERE id=$1`, [agenteId, extras.motivo||'pausa']);
  else if (tipo === "pausa_fim") await query(`UPDATE agentes SET status_atual='online', pausa_atual=NULL WHERE id=$1`, [agenteId]);
}

export async function heartbeat(agenteId) { await registrarEvento(agenteId, "heartbeat"); }

export async function detectarIdle() {
  const { query } = await import("./db.js");
  const { estaEmIntervaloToleravel, estaDentroDoHorario } = await import("./agente-accountability.js");

  // Busca agentes candidatos a idle
  const r = await query(`
    SELECT id, nome, horario_trabalho
    FROM agentes
    WHERE online=true AND pausa_atual IS NULL
      AND ultimo_heartbeat < NOW()-INTERVAL '15 minutes'
      AND status_atual!='idle'
  `);

  const idled = [];
  for (const ag of r.rows) {
    // Se estiver no intervalo de almoço ou fora do horário → não marcar idle
    const ht = ag.horario_trabalho;
    if (ht && (estaEmIntervaloToleravel(ht) || !estaDentroDoHorario(ht))) continue;
    await query(`UPDATE agentes SET status_atual='idle' WHERE id=$1`, [ag.id]);
    idled.push({ id: ag.id, nome: ag.nome });
  }
  return idled;
}

export async function getStatusAgentes() {
  const { query } = await import("./db.js");
  const r = await query(`
    SELECT a.id, a.nome, a.avatar, a.login, a.ativo, a.online, a.status_atual, a.pausa_atual, a.whatsapp, a.categoria,
      a.ultimo_login, a.ultimo_logout, a.ultimo_heartbeat,
      a.ultimo_ip, a.ultima_cidade, a.ultimo_dispositivo, a.horario_trabalho,
      COALESCE((SELECT SUM(EXTRACT(EPOCH FROM COALESCE((SELECT MIN(s2.criado_em) FROM agente_sessoes s2 WHERE s2.agente_id=a.id AND s2.tipo='logout' AND s2.criado_em>s.criado_em AND s2.criado_em::date=CURRENT_DATE), CASE WHEN a.online THEN NOW() ELSE a.ultimo_logout END)-s.criado_em)/60) FROM agente_sessoes s WHERE s.agente_id=a.id AND s.tipo='login' AND s.criado_em::date=CURRENT_DATE),0)::int AS minutos_online_hoje,
      COALESCE((SELECT COUNT(*) FROM conversas c WHERE c.agente_id=a.id AND c.atualizado::date=CURRENT_DATE),0)::int AS atendimentos_hoje,
      COALESCE((SELECT COUNT(*) FROM conversas c WHERE c.agente_id=a.id AND c.atualizado>=NOW()-INTERVAL '7 days'),0)::int AS atendimentos_semana,
      COALESCE((SELECT COUNT(*) FROM conversas c WHERE c.agente_id=a.id AND c.atualizado>=NOW()-INTERVAL '30 days'),0)::int AS atendimentos_mes,
      COALESCE((SELECT ROUND(AVG(EXTRACT(EPOCH FROM (c.primeira_msg_agente_em - c.assumido_em)))) FROM conversas c WHERE c.agente_id=a.id AND c.assumido_em IS NOT NULL AND c.primeira_msg_agente_em IS NOT NULL AND c.criado_em::date=CURRENT_DATE),NULL)::int AS trp_medio_segs,
      (SELECT MAX(c.ultima_msg_agente_em) FROM conversas c WHERE c.agente_id=a.id) AS ultima_msg_agente_em,
      COALESCE((SELECT COUNT(*) FROM conversas c WHERE c.agente_id=a.id AND c.atualizado::date=CURRENT_DATE AND c.taxa_devolucao_ia > 0),0)::int AS conv_devolvidas_hoje,
      COALESCE((SELECT COUNT(*) FROM conversas c WHERE c.agente_id=a.id AND c.status='ativa'),0)::int AS conversas_ativas,
      (SELECT MIN(s.criado_em) FROM agente_sessoes s WHERE s.agente_id=a.id AND s.tipo='login' AND s.criado_em::date=CURRENT_DATE) AS primeiro_login_hoje,
      (SELECT COUNT(DISTINCT s.ip) FROM agente_sessoes s WHERE s.agente_id=a.id AND s.criado_em::date=CURRENT_DATE AND s.ip IS NOT NULL) AS ips_distintos_hoje
    FROM agentes a WHERE a.ativo=true
    ORDER BY a.online DESC, a.status_atual, a.nome
  `);
  return r.rows;
}

export async function getPontoDia(agenteId, data = null) {
  const { query } = await import("./db.js");
  const dia = data || new Date().toISOString().slice(0,10);
  const r = await query(`SELECT tipo, motivo, ip, cidade, user_agent, criado_em FROM agente_sessoes WHERE agente_id=$1 AND criado_em::date=$2::date AND tipo!='heartbeat' ORDER BY criado_em ASC`, [agenteId, dia]);
  const eventos = r.rows;
  let totalMin=0, totalPausa=0, loginTime=null, pausaTime=null;
  for (const ev of eventos) {
    const t = new Date(ev.criado_em).getTime();
    if (ev.tipo==='login') loginTime=t;
    if (ev.tipo==='logout' && loginTime) { totalMin+=(t-loginTime)/60000; loginTime=null; }
    if (ev.tipo==='pausa_inicio') pausaTime=t;
    if (ev.tipo==='pausa_fim' && pausaTime) { totalPausa+=(t-pausaTime)/60000; pausaTime=null; }
  }
  if (loginTime) totalMin+=(Date.now()-loginTime)/60000;
  if (pausaTime) totalPausa+=(Date.now()-pausaTime)/60000;
  return { eventos, horas_trabalhadas: Math.round((totalMin-totalPausa)*10)/10, horas_pausa: Math.round(totalPausa*10)/10, horas_total: Math.round(totalMin*10)/10, primeiro_login: eventos.find(e=>e.tipo==='login')?.criado_em||null, ultimo_logout: [...eventos].reverse().find(e=>e.tipo==='logout')?.criado_em||null, ips: [...new Set(eventos.filter(e=>e.ip).map(e=>e.ip))], cidades: [...new Set(eventos.filter(e=>e.cidade).map(e=>e.cidade))] };
}

export async function getAlertasPonto() {
  const { query } = await import("./db.js");
  const alertas = [];
  const agentes = await query(`SELECT id, nome, horario_trabalho FROM agentes WHERE ativo=true`);
  const now = new Date(), diaAtual = now.getDay(), horaAtual = now.getHours()*60+now.getMinutes();
  for (const ag of agentes.rows) {
    const diaConfig = (ag.horario_trabalho||{})[diaAtual];
    if (!diaConfig?.ativo) continue;
    const [hi,mi] = (diaConfig.inicio||'08:00').split(':').map(Number);
    if (horaAtual > hi*60+mi+15) {
      const login = await query(`SELECT criado_em FROM agente_sessoes WHERE agente_id=$1 AND tipo='login' AND criado_em::date=CURRENT_DATE LIMIT 1`, [ag.id]);
      if (!login.rows.length) alertas.push({tipo:'nao_logou',agente:ag.nome,agenteId:ag.id,esperado:diaConfig.inicio,msg:`${ag.nome} não logou hoje (esperado ${diaConfig.inicio})`});
      else { const lm=new Date(login.rows[0].criado_em); const atraso=lm.getHours()*60+lm.getMinutes()-(hi*60+mi); if(atraso>5) alertas.push({tipo:'atraso',agente:ag.nome,agenteId:ag.id,minutos:atraso,msg:`${ag.nome} atrasou ${atraso}min`}); }
    }
    const ips = await query(`SELECT COUNT(DISTINCT ip) as cnt FROM agente_sessoes WHERE agente_id=$1 AND criado_em::date=CURRENT_DATE AND ip IS NOT NULL`, [ag.id]);
    if (ips.rows[0]?.cnt>2) alertas.push({tipo:'troca_ip',agente:ag.nome,agenteId:ag.id,ips:ips.rows[0].cnt,msg:`${ag.nome} usou ${ips.rows[0].cnt} IPs diferentes`});
  }
  const idle = await query(`SELECT id, nome, ultimo_heartbeat FROM agentes WHERE status_atual='idle' AND online=true`);
  for (const ag of idle.rows) { const min=Math.round((Date.now()-new Date(ag.ultimo_heartbeat).getTime())/60000); alertas.push({tipo:'idle',agente:ag.nome,agenteId:ag.id,minutos:min,msg:`${ag.nome} inativo há ${min}min`}); }
  return alertas;
}

export async function salvarHorarioTrabalho(agenteId, horario) {
  const { query } = await import("./db.js");
  await query(`UPDATE agentes SET horario_trabalho=$2::jsonb WHERE id=$1`, [agenteId, JSON.stringify(horario)]);
}

export async function getHistoricoSessoes(data = null) {
  const { query } = await import("./db.js");
  const dia = data || new Date().toISOString().slice(0,10);
  const r = await query(`SELECT s.id, s.agente_id, s.agente_nome, s.tipo, s.motivo, s.ip, s.cidade, s.criado_em, a.avatar FROM agente_sessoes s LEFT JOIN agentes a ON a.id=s.agente_id WHERE s.criado_em::date=$1::date AND s.tipo!='heartbeat' ORDER BY s.criado_em DESC LIMIT 200`, [dia]);
  return r.rows;
}

export async function getResumoDia() {
  const { query } = await import("./db.js");
  const r = await query(`SELECT COUNT(DISTINCT CASE WHEN s.tipo='login' THEN s.agente_id END) AS agentes_logaram, COUNT(*) FILTER (WHERE s.tipo='login') AS total_logins, COUNT(*) FILTER (WHERE s.tipo='pausa_inicio') AS total_pausas FROM agente_sessoes s WHERE s.criado_em::date=CURRENT_DATE`);
  const conv = await query(`SELECT COUNT(*) AS total_atendimentos, COUNT(DISTINCT agente_id) AS agentes_atenderam FROM conversas WHERE atualizado::date=CURRENT_DATE AND agente_id IS NOT NULL`);
  return { ...r.rows[0], ...conv.rows[0] };
}

export async function getRanking(dias = 7) {
  const { query } = await import("./db.js");
  const r = await query(`SELECT a.id, a.nome, a.avatar, a.online, a.status_atual, COUNT(c.id) AS total_atendimentos, COUNT(c.id) FILTER (WHERE c.atualizado::date=CURRENT_DATE) AS atendimentos_hoje, ROUND(AVG(EXTRACT(EPOCH FROM (c.atualizado-c.criado_em))/60)::numeric,1) AS tempo_medio_min FROM agentes a LEFT JOIN conversas c ON c.agente_id=a.id AND c.atualizado>=NOW()-make_interval(days=>$1) WHERE a.ativo=true GROUP BY a.id,a.nome,a.avatar,a.online,a.status_atual ORDER BY total_atendimentos DESC`, [parseInt(dias)||7]);
  return r.rows;
}

export async function getRelatorioSemanal(agenteId = null) {
  const { query } = await import("./db.js");
  const params = []; let filtro = '';
  if (agenteId) { params.push(agenteId); filtro = `AND a.id=$${params.length}`; }
  const r = await query(`SELECT a.id, a.nome, COUNT(c.id) AS total_semana, COUNT(c.id) FILTER (WHERE c.atualizado::date=CURRENT_DATE) AS total_hoje, ROUND(AVG(EXTRACT(EPOCH FROM (c.atualizado-c.criado_em))/60)::numeric,1) AS tma_min FROM agentes a LEFT JOIN conversas c ON c.agente_id=a.id AND c.atualizado>=NOW()-INTERVAL '7 days' WHERE a.ativo=true ${filtro} GROUP BY a.id,a.nome ORDER BY total_semana DESC`, params);
  return r.rows;
}
