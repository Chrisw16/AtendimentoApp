/**
 * chatInterno.js — PostgreSQL + SSE broadcast
 * Todas as conversas de todos os canais aparecem aqui
 * Status: "ia" (IA respondendo), "aguardando" (sem resposta), "ativa" (com agente), "encerrada"
 */
import { query, kvGet, kvSet } from "./db.js";

// Tabela de mídias temporárias (imagens/docs do WhatsApp — TTL 7 dias)
query(`CREATE TABLE IF NOT EXISTS chat_midias (
  id TEXT PRIMARY KEY,
  mime TEXT,
  dados TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
)`).catch(()=>{});
query(`CREATE INDEX IF NOT EXISTS idx_midias_criado ON chat_midias(criado_em)`).catch(()=>{});

export async function salvarMidia(base64, mime) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  await query(`INSERT INTO chat_midias(id,mime,dados) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING`, [id, mime, base64]);
  query(`DELETE FROM chat_midias WHERE criado_em < NOW() - INTERVAL '7 days'`).catch(()=>{});
  return id;
}

export async function getMidia(id) {
  const r = await query(`SELECT mime, dados FROM chat_midias WHERE id=$1`, [id]);
  return r.rows[0] || null;
}
import { logger } from "./logger.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";

// ── SSE CLIENTS ───────────────────────────────────────────────────────────────
const agentSseMap = new Map();

export function addAgentSse(agenteId, res) {
  if (!agentSseMap.has(agenteId)) agentSseMap.set(agenteId, new Set());
  agentSseMap.get(agenteId).add(res);
}
export function removeAgentSse(agenteId, res) {
  agentSseMap.get(agenteId)?.delete(res);
}
export function broadcast(evento, dados) {
  const msg = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
  agentSseMap.forEach(set => set.forEach(res => { try { res.write(msg); } catch {} }));
}

// ── MODO BOT/HUMANO (global) ──────────────────────────────────────────────────
export async function getModo() { return (await kvGet("modo")) || "bot"; }
export async function setModo(modo) {
  await kvSet("modo", modo);
  broadcast("modo_alterado", { modo });
}

// ── CONVERSAS ─────────────────────────────────────────────────────────────────
export async function getConversas(filtro) {
  let sql  = `SELECT * FROM conversas`;
  const params = [];
  if (filtro && filtro !== "todas") {
    sql += ` WHERE status=$1`;
    params.push(filtro);
  } else {
    // Por padrão exclui encerradas para não poluir a lista
    sql += ` WHERE status != 'encerrada'`;
  }
  sql += ` ORDER BY ultima_msg DESC LIMIT 200`;
  const r = await query(sql, params);
  return r.rows.map(row => ({ ...row, mensagens: row.mensagens || [] }));
}

export async function getConversa(id) {
  const r = await query(`SELECT * FROM conversas WHERE id=$1`, [id]);
  if (!r.rows[0]) return null;
  return { ...r.rows[0], mensagens: r.rows[0].mensagens || [] };
}

// Registra/atualiza qualquer mensagem recebida (de qualquer canal)

/** Gera novo convId para cliente que retornou após conversa encerrada.
 *  Mantém histórico da conversa anterior, mas cria entrada nova.
 *  Formato: whatsapp_558487..._20260315143022 */
export async function resolverConvId(baseConvId, telefone, canal) {
  const existing = await getConversa(baseConvId);
  // Se não existe ou está ativa — usa o ID normal
  if (!existing || existing.status !== "encerrada") return baseConvId;

  // Busca se já existe uma sessão nova aberta para este telefone (encerrada → nova)
  // Evita criar múltiplos IDs se o cliente mandar várias msgs rapidamente
  const r = await query(
    `SELECT id FROM conversas WHERE telefone=$1 AND canal=$2 AND status != 'encerrada' ORDER BY criado_em DESC LIMIT 1`,
    [telefone, canal]
  ).catch(() => ({ rows: [] }));
  if (r.rows.length > 0) return r.rows[0].id;

  // Conversa encerrada sem nova sessão — cria novo ID com timestamp
  const ts = new Date().toISOString().replace(/[-:T.Z]/g,"").slice(0,14);
  const novoId = `${baseConvId}_${ts}`;
  logger.info('Novo protocolo para ' + telefone + ': ' + novoId);
  return novoId;
}
export async function registrarMensagem({ convId, telefone, nome, conteudo, canal, accountId, statusInicial = "ia", sentimento }) {
  const existing = await getConversa(convId);
  // Ignora mensagens de reação que chegaram como texto
  if (!conteudo || conteudo === "[reaction]" || conteudo === null) return;
  const msg = { id: Date.now(), role: "cliente", content: conteudo, ts: Date.now() };

  // Detecção rápida de sentimento negativo por palavras-chave (sem IA, instantâneo)
  const msgLow = (conteudo || "").toLowerCase();
  const frustrado = ["absurdo","ridículo","péssimo","horrível","raiva","indignado","cancelar","processo","procon","nunca mais","mentira","enganou","lixo","merda","incompetente"].some(p => msgLow.includes(p));
  const sentimentoDetectado = sentimento || (frustrado ? "frustrado" : null);

  if (existing) {
    const mensagens = [...(existing.mensagens || []), msg];
    if (mensagens.length > 200) mensagens.splice(0, mensagens.length - 200);
    const naoLidas = existing.status === "ia" ? existing.nao_lidas || 0 : (existing.nao_lidas || 0) + 1;
    const extraFields = sentimentoDetectado ? `, sentimento='${sentimentoDetectado}'` : "";
    await query(
      `UPDATE conversas SET mensagens=$2::jsonb, ultima_msg=$3, nao_lidas=$4${extraFields}, atualizado=NOW() WHERE id=$1`,
      [convId, JSON.stringify(mensagens), Date.now(), naoLidas]
    );
  } else {
    await query(
      `INSERT INTO conversas(id,telefone,nome,canal,status,account_id,mensagens,ultima_msg,nao_lidas)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,0)`,
      [convId, telefone, nome, canal, statusInicial, accountId, JSON.stringify([msg]), Date.now()]
    );
  }
  // Detecta mensagem positiva para IA reagir com moderação (máx 1 por conversa)
  const isPosNova = /obrigad|valeu|resolveu|voltou|funcionou|ótimo|top|perfeito|show|excelente|ajudou|muito bom/i.test(conteudo || "");
  const jaReagiu = (existing?.mensagens || []).some(m => m.role === 'ia' && m.reacoes?.ia);
  const msgIdNovo = msg.id;
  broadcast("nova_mensagem", { convId, telefone, nome, conteudo, canal, status: existing?.status || statusInicial, sentimento: sentimentoDetectado, iaReagir: isPosNova && !jaReagiu ? msgIdNovo : null });

  // Alerta se frustração detectada
  if (frustrado) {
    broadcast("cliente_frustrado", { convId, telefone, nome, canal });
  }
}

// Compatibilidade com código antigo
export async function receberMensagemCliente({ convId, telefone, nome, conteudo, canal, accountId }) {
  return registrarMensagem({ convId, telefone, nome, conteudo, canal, accountId, statusInicial: "aguardando" });
}

// Atualiza status da conversa
export async function atualizarStatus(convId, status) {
  await query(`UPDATE conversas SET status=$2, atualizado=NOW() WHERE id=$1`, [convId, status]);
  broadcast("status_alterado", { convId, status });
}

// Registra resposta da IA numa conversa
// ─── FOTO DE PERFIL ──────────────────────────────────────────────────────────
export async function atualizarFotoPerfil(convId, fotoUrl) {
  await query(`UPDATE conversas SET foto_perfil=$2 WHERE id=$1`, [convId, fotoUrl]).catch(()=>{});
  broadcast("foto_perfil", { convId, fotoUrl });
}

// ─── TAGS ─────────────────────────────────────────────────────────────────────
export async function atualizarTags(convId, tags) {
  await query(`UPDATE conversas SET tags=$2::text[] WHERE id=$1`, [convId, tags]);
  broadcast("tags_atualizadas", { convId, tags });
}

// ─── PRIORIDADE ───────────────────────────────────────────────────────────────
export async function atualizarPrioridade(convId, prioridade) {
  await query(`UPDATE conversas SET prioridade=$2 WHERE id=$1`, [convId, prioridade]);
  broadcast("prioridade_atualizada", { convId, prioridade });
}

// ─── STATUS DE LEITURA ────────────────────────────────────────────────────────
export async function atualizarStatusMensagem(convId, msgId, status, timestamp = null) {
  const conv = await fetchConversa(convId);
  if (!conv) return;
  const agora = timestamp ? new Date(timestamp * 1000).toISOString() : new Date().toISOString();
  const mensagens = (conv.mensagens || []).map(m => {
    if (String(m.id) !== String(msgId)) return m;
    const statusTs = { ...(m.status_ts || {}) };
    statusTs[status] = agora;
    return { ...m, status, status_ts: statusTs };
  });
  await query(`UPDATE conversas SET mensagens=$2::jsonb WHERE id=$1`, [convId, JSON.stringify(mensagens)]);
  broadcast("status_mensagem", { convId, msgId, status, ts: agora });
}

// ─── MENSAGEM EDITADA ─────────────────────────────────────────────────────────
export async function atualizarMensagemEditada(convId, msgId, novoTexto) {
  const conv = await fetchConversa(convId);
  if (!conv) return;
  const mensagens = (conv.mensagens || []).map(m =>
    String(m.id) === String(msgId)
      ? { ...m, content: novoTexto, editado: true, editado_em: new Date().toISOString() }
      : m
  );
  await query(`UPDATE conversas SET mensagens=$2::jsonb WHERE id=$1`, [convId, JSON.stringify(mensagens)]);
  broadcast("mensagem_editada", { convId, msgId, novoTexto });
}

// Adiciona/atualiza reação em uma mensagem
export async function adicionarReacao(convId, msgId, emoji, autor = "agente") {
  const conv = await fetchConversa(convId);
  if (!conv) return;
  const mensagens = (conv.mensagens || []).map(m => {
    if (String(m.id) === String(msgId)) {
      const reacoes = m.reacoes || {};
      if (reacoes[autor] === emoji) {
        // Clicou de novo no mesmo emoji → remove
        const { [autor]: _, ...resto } = reacoes;
        return { ...m, reacoes: resto };
      }
      return { ...m, reacoes: { ...reacoes, [autor]: emoji } };
    }
    return m;
  });
  await query(`UPDATE conversas SET mensagens=$2::jsonb WHERE id=$1`, [convId, JSON.stringify(mensagens)]);
  broadcast("reacao_mensagem", { convId, msgId, emoji, autor });
}

export async function registrarRespostaIA(convId, conteudo) {
  const conv = await getConversa(convId);
  if (!conv) return;
  const msg = { id: Date.now(), role: "ia", content: conteudo, ts: Date.now() };
  const mensagens = [...(conv.mensagens || []), msg];
  if (mensagens.length > 200) mensagens.splice(0, mensagens.length - 200);
  await query(
    `UPDATE conversas SET mensagens=$2::jsonb, status='ia', ultima_msg=$3, nao_lidas=0, atualizado=NOW() WHERE id=$1`,
    [convId, JSON.stringify(mensagens), Date.now()]
  );
  broadcast("resposta_ia", { convId, conteudo });
}

export async function enviarMensagemAgente({ convId, agenteId, agenteNome, conteudo }) {
  const conv = await getConversa(convId);
  if (!conv) return null;
  const msg = { id: Date.now(), role: "agente", agenteId, agenteNome, content: conteudo, ts: Date.now() };
  const mensagens = [...(conv.mensagens || []), msg];
  // Registra ultima_msg_agente_em sempre; primeira_msg_agente_em só se for a primeira
  await query(
    `UPDATE conversas SET
       mensagens=$2::jsonb,
       ultima_msg=$3,
       ultima_msg_agente_em=NOW(),
       primeira_msg_agente_em=COALESCE(primeira_msg_agente_em, NOW()),
       atualizado=NOW()
     WHERE id=$1`,
    [convId, JSON.stringify(mensagens), Date.now()]
  );
  broadcast("mensagem_agente", { convId, msg });
  return msg;
}

export async function assumirConversa(convId, agenteId) {
  await query(
    `UPDATE conversas SET status='ativa', agente_id=$2, nao_lidas=0, assumido_em=NOW(), atualizado=NOW() WHERE id=$1`,
    [convId, agenteId]
  );
  broadcast("conversa_assumida", { convId, agenteId });
}

export async function encerrarConversa(convId) {
  await query(`UPDATE conversas SET status='encerrada', atualizado=NOW() WHERE id=$1`, [convId]);
  broadcast("conversa_encerrada", { convId });
}

export async function adicionarNota(convId, agenteId, agenteNome, nota) {
  const conv = await getConversa(convId);
  if (!conv) return null;
  const msg = { id: Date.now(), role: "nota", agenteId, agenteNome, content: nota, ts: Date.now() };
  const mensagens = [...(conv.mensagens || []), msg];
  await query(`UPDATE conversas SET mensagens=$2::jsonb, atualizado=NOW() WHERE id=$1`, [convId, JSON.stringify(mensagens)]);
  broadcast("nota_interna", { convId, agenteNome, nota });
  return msg;
}

export async function adicionarMensagemAgente(convId, { role = "agente", content, agenteId, agenteNome }) {
  const conv = await getConversa(convId);
  if (!conv) return null;
  const msg = { id: Date.now(), role, agenteId, agenteNome, content, ts: Date.now() };
  const mensagens = [...(conv.mensagens || []), msg];
  await query(`UPDATE conversas SET mensagens=$2::jsonb, ultima_msg=$3, atualizado=NOW() WHERE id=$1`, [convId, JSON.stringify(mensagens), Date.now()]);
  broadcast("mensagem_agente", { convId, msg });
  return msg;
}

export async function transferirConversa(convId, paraAgenteId, deAgenteNome) {
  const conv = await getConversa(convId);
  if (!conv) return;
  const msg = { id: Date.now(), role: "nota", agenteId: "sistema", content: `🔄 Transferido por ${deAgenteNome}`, ts: Date.now() };
  const mensagens = [...(conv.mensagens || []), msg];
  await query(`UPDATE conversas SET agente_id=$2, mensagens=$3::jsonb, atualizado=NOW() WHERE id=$1`, [convId, paraAgenteId, JSON.stringify(mensagens)]);
  broadcast("conversa_transferida", { convId, paraAgenteId, deAgenteNome });
}

export async function getConversasForaDeSla(minutos) {
  const limit = Date.now() - minutos * 60000;
  const r = await query(
    `SELECT *, FLOOR((EXTRACT(EPOCH FROM NOW())*1000 - ultima_msg)/60000)::int AS minutos_aguardando
     FROM conversas WHERE status='aguardando' AND ultima_msg < $1`, [limit]
  );
  return r.rows;
}

// ── AGENTES ───────────────────────────────────────────────────────────────────
export async function listarAgentes() {
  const r = await query(`SELECT id,nome,login,avatar,ativo,online,criado_em,whatsapp,categoria FROM agentes ORDER BY nome`);
  return r.rows;
}
export async function criarAgente({ nome, login, senha, avatar, ativo = true, whatsapp = '', categoria = 'atendente' }) {
  if (!nome || !login || !senha) throw new Error("nome, login e senha são obrigatórios");
  const id   = crypto.randomUUID();
  const hash = await bcrypt.hash(senha, 10);
  await query(`INSERT INTO agentes(id,nome,login,senha_hash,avatar,ativo,whatsapp,categoria) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, nome, login, hash, avatar || "🧑", ativo, whatsapp, categoria]);
  return { id, nome, login, avatar, ativo, whatsapp, categoria };
}
export async function atualizarAgente(id, dados) {
  const fields = [], params = [id];
  if (dados.nome)       { params.push(dados.nome);      fields.push(`nome=$${params.length}`); }
  if (dados.avatar)     { params.push(dados.avatar);    fields.push(`avatar=$${params.length}`); }
  if (dados.login)      { params.push(dados.login);     fields.push(`login=$${params.length}`); }
  if (dados.ativo !== undefined) { params.push(dados.ativo); fields.push(`ativo=$${params.length}`); }
  if (dados.senha)      { const h = await bcrypt.hash(dados.senha, 10); params.push(h); fields.push(`senha_hash=$${params.length}`); }
  if (dados.whatsapp !== undefined && dados.whatsapp !== null) { params.push(dados.whatsapp); fields.push(`whatsapp=$${params.length}`); }
  if (dados.categoria)  { params.push(dados.categoria); fields.push(`categoria=$${params.length}`); }
  if (!fields.length) return;
  await query(`UPDATE agentes SET ${fields.join(",")} WHERE id=$1`, params);
}
export async function removerAgente(id) { await query(`DELETE FROM agentes WHERE id=$1`, [id]); }
export async function loginAgente(login, senha) {
  const r = await query(`SELECT * FROM agentes WHERE login=$1 AND ativo=true`, [login]);
  const ag = r.rows[0];
  if (!ag) return null;
  // Tenta bcrypt primeiro
  try {
    if (ag.senha_hash?.startsWith('$2')) {
      const ok = await bcrypt.compare(senha, ag.senha_hash);
      return ok ? ag : null;
    }
  } catch {}
  // Fallback SHA-256 (senhas antigas) + migra pra bcrypt
  const sha = crypto.createHash("sha256").update(senha).digest("hex");
  if (ag.senha_hash === sha) {
    // Migra pra bcrypt automaticamente
    const newHash = await bcrypt.hash(senha, 10);
    await query(`UPDATE agentes SET senha_hash=$2 WHERE id=$1`, [ag.id, newHash]).catch(() => {});
    return ag;
  }
  return null;
}
export async function setOnline(id, online) {
  await query(`UPDATE agentes SET online=$2 WHERE id=$1`, [id, online]);
  broadcast("agente_status", { id, online });
}
