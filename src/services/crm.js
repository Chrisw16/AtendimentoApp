/**
 * crm.js — PostgreSQL
 */
import { query } from "./db.js";

async function getCfg(chave) {
  const r = await query(`SELECT valor FROM crm_config WHERE chave=$1`, [chave]);
  return r.rows[0]?.valor ?? null;
}
async function setCfg(chave, valor) {
  await query(
    `INSERT INTO crm_config(chave,valor,atualizado) VALUES($1,$2::jsonb,NOW())
     ON CONFLICT(chave) DO UPDATE SET valor=$2::jsonb, atualizado=NOW()`,
    [chave, JSON.stringify(valor)]
  );
}

// ── RESPOSTAS RÁPIDAS ─────────────────────────────────────────────────────────
export async function listarRespostasRapidas() {
  return (await getCfg("respostas_rapidas")) || [];
}
export async function salvarRespostaRapida({ id, atalho, texto }) {
  const list = await listarRespostasRapidas();
  if (id) {
    const idx = list.findIndex(r => r.id === id);
    if (idx >= 0) list[idx] = { id, atalho, texto };
    else list.push({ id, atalho, texto });
  } else {
    list.push({ id: Date.now().toString(36), atalho, texto });
  }
  await setCfg("respostas_rapidas", list);
  return list;
}
export async function removerRespostaRapida(id) {
  const list = (await listarRespostasRapidas()).filter(r => r.id !== id);
  await setCfg("respostas_rapidas", list);
}
export async function expandirAtalho(texto) {
  const list = await listarRespostasRapidas();
  const atalho = texto.trim().toLowerCase();
  return list.find(r => r.atalho.toLowerCase() === atalho)?.texto || null;
}

// ── HORÁRIOS ──────────────────────────────────────────────────────────────────
export async function getHorarios()     { return (await getCfg("horarios")) || {}; }
export async function salvarHorarios(h) { const cur = await getHorarios(); await setCfg("horarios", { ...cur, ...h }); }

export async function dentroDoHorario() {
  const cfg = await getHorarios();
  if (!cfg?.ativo) return true;
  const { minutosAgora: mAgora, diaSemana: dSemana } = await import("./horario.js");
  const diaSemana = dSemana();
  const horaAtual = mAgora();
  for (const f of (cfg.faixas || [])) {
    const diasMap = { "seg-sex":[1,2,3,4,5], "sabado":[6], "domingo":[0], "todos":[0,1,2,3,4,5,6] };
    const dias = diasMap[f.dia] || [];
    if (!dias.includes(diaSemana)) continue;
    const [ih, im] = f.inicio.split(":").map(Number);
    const [fh, fm] = f.fim.split(":").map(Number);
    if (horaAtual >= ih*60+im && horaAtual <= fh*60+fm) return true;
  }
  return false;
}

// ── SAUDAÇÕES ─────────────────────────────────────────────────────────────────
export async function getSaudacoes()       { return (await getCfg("saudacoes")) || {}; }
export async function getSaudacao(canal)   { const s = await getSaudacoes(); return s[canal] || s.whatsapp || "Olá!"; }
export async function salvarSaudacoes(s)   { const cur = await getSaudacoes(); await setCfg("saudacoes", { ...cur, ...s }); }

// ── SLA ───────────────────────────────────────────────────────────────────────
export async function getSla()      { return (await getCfg("sla")) || {}; }
export async function salvarSla(s)  { const cur = await getSla(); await setCfg("sla", { ...cur, ...s }); }

// ── PESQUISA ──────────────────────────────────────────────────────────────────
export async function getPesquisa()     { return (await getCfg("pesquisa")) || {}; }
export async function salvarPesquisa(p) { const cur = await getPesquisa(); await setCfg("pesquisa", { ...cur, ...p }); }

export async function registrarResposta({ telefone, nota, canal, protocolo }) {
  await query(
    `INSERT INTO pesquisa_satisfacao(telefone,nota,canal,protocolo) VALUES($1,$2,$3,$4)`,
    [telefone, parseInt(nota), canal, protocolo]
  );
}
export async function getEstatisticasPesquisa() {
  const total = await query(`SELECT COUNT(*) FROM pesquisa_satisfacao`);
  const media = await query(`SELECT ROUND(AVG(nota)::numeric,1) AS media FROM pesquisa_satisfacao`);
  const dist  = await query(`SELECT nota, COUNT(*) AS cnt FROM pesquisa_satisfacao GROUP BY nota ORDER BY nota`);
  const distribuicao = { 1:0, 2:0, 3:0, 4:0, 5:0 };
  dist.rows.forEach(r => { distribuicao[r.nota] = parseInt(r.cnt); });
  const ultimas = await query(`SELECT * FROM pesquisa_satisfacao ORDER BY criado_em DESC LIMIT 20`);
  return {
    total: parseInt(total.rows[0].count),
    media: parseFloat(media.rows[0].media) || 0,
    distribuicao,
    ultimas: ultimas.rows,
  };
}
