/**
 * supervisoraIA.js — Supervisora de Atendimento com IA
 *
 * Responsabilidades:
 * 1. Análise de sentimento em tempo real (por palavras-chave, sem IA — instantâneo)
 * 2. Análise profunda de sentimento via Claude Haiku (assíncrono, ao encerrar)
 * 3. Detectar demora de agente (sem resposta > N minutos)
 * 4. Detectar estresse/frustração crescente do cliente
 * 5. Gerar sugestão de resposta para o agente (via SSE)
 * 6. Resumo automático da conversa ao encerrar
 */

import { getDb }     from '../config/db.js';
import { broadcast, sendToAgente } from './sseManager.js';
import { getAnthropicClient } from './integrations.js';

// ── PALAVRAS-CHAVE DE FRUSTRAÇÃO (detecção instantânea, sem IA) ──
const PALAVRAS_FRUSTRACAO = [
  'absurdo','ridículo','ridículo','péssimo','horrível','raiva','indignado',
  'cancelar','cancelamento','processo','procon','anatel','nunca mais','mentira',
  'enganou','lixo','incompetente','vergonha','furioso','furioso','revoltado',
  'reclamação','reclame aqui','decepcionante','uma porcaria','que absurdo',
  'não aguento','já faz dias','semanas sem','meses sem','não funciona nada',
];

const PALAVRAS_ESCALADA = [
  'advogado','processo judicial','acionar','denúncia','fiscalização',
  'procon','anatel','reclameaqui','instagram','facebook','twitter','divulgar',
];

// Níveis de sentimento
export const SENTIMENTO = {
  POSITIVO:  'positivo',
  NEUTRO:    'neutro',
  ATENCAO:   'atencao',   // sinais leves de insatisfação
  FRUSTRADO: 'frustrado', // claramente irritado
  CRITICO:   'critico',   // escalada — ameaças, órgãos reguladores
};

// ── DETECÇÃO INSTANTÂNEA (chamada a cada mensagem do cliente) ─────
export function analisarMensagemInstantaneo(texto) {
  const lower = (texto || '').toLowerCase();

  const palavrasCriticas  = PALAVRAS_ESCALADA.filter(p  => lower.includes(p));
  const palavrasFrustracao = PALAVRAS_FRUSTRACAO.filter(p => lower.includes(p));

  // Sinais de urgência implícita
  const urgenciaImplicita = lower.includes('urgente') || lower.includes('urgência') ||
    lower.includes('preciso agora') || lower.includes('preciso hoje') ||
    /[!]{2,}/.test(texto) || /[A-ZÁÉÍÓÚÀÂÊÔÃÕ]{4,}/.test(texto); // CAPS LOCK

  if (palavrasCriticas.length > 0) return { nivel: SENTIMENTO.CRITICO, gatilhos: palavrasCriticas };
  if (palavrasFrustracao.length > 0) return { nivel: SENTIMENTO.FRUSTRADO, gatilhos: palavrasFrustracao };
  if (urgenciaImplicita) return { nivel: SENTIMENTO.ATENCAO, gatilhos: ['urgência detectada'] };
  return { nivel: SENTIMENTO.NEUTRO, gatilhos: [] };
}

// ── ANALISAR DEMORA DO AGENTE ─────────────────────────────────────
// Chamado pelo monitor SLA para conversas com agente assumido
export async function verificarDemoraAgente(convId) {
  const db = getDb();
  const conv = await db('conversas as c')
    .leftJoin('agentes as a', 'a.id', 'c.agente_id')
    .where('c.id', convId)
    .select([
      'c.id', 'c.nome', 'c.canal', 'c.agente_id', 'c.assumido_em',
      'c.ultima_msg_agente_em', 'c.atualizado',
      'a.nome as agente_nome',
    ])
    .first();

  if (!conv || !conv.agente_id) return;

  const agora      = Date.now();
  const ultimaResp = conv.ultima_msg_agente_em
    ? new Date(conv.ultima_msg_agente_em).getTime()
    : conv.assumido_em
    ? new Date(conv.assumido_em).getTime()
    : null;

  if (!ultimaResp) return;

  const minutosSemResposta = Math.floor((agora - ultimaResp) / 60000);

  // Alerta escalonado
  if (minutosSemResposta >= 15) {
    sendToAgente(conv.agente_id, 'supervisora_alerta', {
      tipo:    'demora_critica',
      convId:  conv.id,
      cliente: conv.nome,
      minutos: minutosSemResposta,
      mensagem: `🚨 *${minutosSemResposta} min* sem resposta para *${conv.nome || 'cliente'}*. Considere transferir ou pedir ajuda.`,
    });
    // Também notifica supervisores
    broadcast('supervisora_alerta_supervisor', {
      tipo:       'demora_critica',
      convId:     conv.id,
      agenteId:   conv.agente_id,
      agenteNome: conv.agente_nome,
      cliente:    conv.nome,
      minutos:    minutosSemResposta,
    });
  } else if (minutosSemResposta >= 5) {
    sendToAgente(conv.agente_id, 'supervisora_alerta', {
      tipo:    'demora_atencao',
      convId:  conv.id,
      cliente: conv.nome,
      minutos: minutosSemResposta,
      mensagem: `⏱️ *${minutosSemResposta} min* sem resposta para *${conv.nome || 'cliente'}*.`,
    });
  }
}

// ── PROCESSAR NOVA MENSAGEM DO CLIENTE ────────────────────────────
// Chamado sempre que chega mensagem de cliente em conversa com agente
export async function processarMensagemCliente(conversa, mensagem) {
  const texto   = mensagem.texto || '';
  const db      = getDb();
  const analise = analisarMensagemInstantaneo(texto);

  // Salva sentimento no banco se negativo
  if ([SENTIMENTO.FRUSTRADO, SENTIMENTO.CRITICO, SENTIMENTO.ATENCAO].includes(analise.nivel)) {
    await db('conversas')
      .where({ id: conversa.id })
      .update({ sentimento: analise.nivel });
  }

  // Sem agente assumido — não precisa alertar
  if (!conversa.agente_id) return;

  // Notifica o agente sobre o nível de sentimento
  if (analise.nivel === SENTIMENTO.CRITICO) {
    sendToAgente(conversa.agente_id, 'supervisora_alerta', {
      tipo:     'cliente_critico',
      convId:   conversa.id,
      cliente:  conversa.nome,
      gatilhos: analise.gatilhos,
      mensagem: `🔴 Cliente em estado crítico! Mencionou: *${analise.gatilhos.join(', ')}*. Priorize este atendimento.`,
    });

    broadcast('supervisora_alerta_supervisor', {
      tipo:       'cliente_critico',
      convId:     conversa.id,
      agenteId:   conversa.agente_id,
      cliente:    conversa.nome,
      gatilhos:   analise.gatilhos,
    });

    // Gera sugestão de resposta via IA (assíncrono)
    _gerarSugestaoResposta(conversa, mensagem, 'critico').catch(() => {});

  } else if (analise.nivel === SENTIMENTO.FRUSTRADO) {
    sendToAgente(conversa.agente_id, 'supervisora_alerta', {
      tipo:     'cliente_frustrado',
      convId:   conversa.id,
      cliente:  conversa.nome,
      gatilhos: analise.gatilhos,
      mensagem: `🟠 Cliente demonstrando frustração. Seja empático e objetivo.`,
    });

    _gerarSugestaoResposta(conversa, mensagem, 'frustrado').catch(() => {});
  }
}

// ── SUGESTÃO DE RESPOSTA VIA IA ───────────────────────────────────
async function _gerarSugestaoResposta(conversa, mensagem, nivel) {
  if (!conversa.agente_id) return;

  try {
    const db   = getDb();
    const hist = await db('mensagens')
      .where({ conversa_id: conversa.id, apagada: false })
      .whereIn('origem', ['cliente', 'agente'])
      .orderBy('criado_em', 'desc')
      .limit(6)
      .then(rows => rows.reverse());

    const conversa_str = hist
      .map(m => `${m.origem === 'cliente' ? 'Cliente' : 'Atendente'}: ${m.texto || ''}`)
      .join('\n');

    const ai = await getAnthropicClient();
    const res = await ai.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `Você é a Supervisora IA da NetGo Internet. Sua função é auxiliar atendentes humanos.
O cliente está ${nivel === 'critico' ? 'em estado crítico (mencionou órgãos reguladores ou ações legais)' : 'frustrado'}.
Gere UMA sugestão curta e empática de resposta para o atendente usar (ou adaptar).
A sugestão deve: reconhecer o problema, pedir desculpas quando apropriado, e oferecer solução concreta.
Responda APENAS com a sugestão, sem prefixos ou explicações. Máximo 3 linhas.`,
      messages: [{ role: 'user', content: `Conversa:\n${conversa_str}\n\nÚltima mensagem do cliente: "${mensagem.texto}"` }],
    });

    const sugestao = res.content[0]?.text?.trim();
    if (!sugestao) return;

    sendToAgente(conversa.agente_id, 'supervisora_sugestao', {
      convId:   conversa.id,
      sugestao,
      nivel,
    });

  } catch (err) {
    console.error('[Supervisora] Sugestão falhou:', err.message);
  }
}

// ── ANÁLISE PROFUNDA AO ENCERRAR ──────────────────────────────────
// Assíncrona — não bloqueia o encerramento
export async function analisarConversaEncerrada(convId) {
  try {
    const db   = getDb();
    const msgs = await db('mensagens')
      .where({ conversa_id: convId, apagada: false })
      .whereIn('origem', ['cliente', 'agente', 'ia'])
      .orderBy('criado_em')
      .select(['origem', 'texto', 'criado_em']);

    if (!msgs.length) return;

    const clienteMsgs = msgs.filter(m => m.origem === 'cliente').map(m => m.texto || '').join(' | ');
    if (!clienteMsgs.trim()) return;

    const ai  = await getAnthropicClient();
    const res = await ai.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: `Analise esta conversa de suporte de internet e responda APENAS com XML:
<sentimento>positivo|neutro|negativo</sentimento>
<topico>boleto|suporte|cancelamento|comercial|reclamacao|outros</topico>
<resumo>Resumo em 1 frase do que o cliente precisava e como foi resolvido</resumo>`,
      messages: [{ role: 'user', content: `Mensagens do cliente: ${clienteMsgs}` }],
    });

    const text     = res.content[0]?.text || '';
    const sentimento = text.match(/<sentimento>([\s\S]*?)<\/sentimento>/)?.[1]?.trim();
    const topico     = text.match(/<topico>([\s\S]*?)<\/topico>/)?.[1]?.trim();
    const resumo     = text.match(/<resumo>([\s\S]*?)<\/resumo>/)?.[1]?.trim();

    const update = {};
    if (sentimento && ['positivo','neutro','negativo'].includes(sentimento)) update.sentimento = sentimento;
    if (topico)   update.topico    = topico;
    if (resumo)   update.resumo_ia = resumo;

    if (Object.keys(update).length) {
      await db('conversas').where({ id: convId }).update(update);
      console.log(`[Supervisora] Conv ${convId} → ${sentimento} / ${topico}`);
    }
  } catch (err) {
    console.error('[Supervisora] Análise encerramento falhou:', err.message);
  }
}

// ── MONITOR CONTÍNUO (roda junto com o SLA monitor) ──────────────
let _monitorInterval = null;

export function iniciarMonitorSupervisora() {
  if (_monitorInterval) clearInterval(_monitorInterval);

  _monitorInterval = setInterval(async () => {
    try {
      const db = getDb();
      // Busca conversas ativas com agente há mais de 5 min sem resposta
      const conversas = await db('conversas')
        .where({ status: 'ativa' })
        .whereNotNull('agente_id')
        .whereNotNull('assumido_em')
        .select(['id', 'nome', 'canal', 'agente_id', 'assumido_em', 'ultima_msg_agente_em']);

      for (const conv of conversas) {
        await verificarDemoraAgente(conv.id);
      }
    } catch (err) {
      console.error('[Supervisora Monitor]', err.message);
    }
  }, 2 * 60 * 1000); // a cada 2 minutos

  console.log('✅ Supervisora IA iniciada');
}

export function pararMonitorSupervisora() {
  if (_monitorInterval) { clearInterval(_monitorInterval); _monitorInterval = null; }
}
