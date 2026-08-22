/**
 * copiloto.js — o assistente do ATENDENTE HUMANO (FASE 10).
 *
 * A fronteira que o §77 traça e que este arquivo respeita: **o Copiloto ajuda,
 * a Quality AI audita**. Nada aqui julga o atendente, e nada aqui manda
 * mensagem sozinho — toda saída passa pela mão de uma pessoa.
 *
 * A chamada ao modelo nasce no `llmGateway` (§76). Foi a promessa feita na
 * FASE 9 quando o gateway ficou sem migrar o laço agêntico: **a próxima
 * chamada nova nasce nele** — esta é ela.
 */
import { getDb } from '../config/db.js';
import { generateTexto } from './llmGateway.js';
import { montarFicha } from './cliente360.js';
import { decidirProximaAcao, detectarSinais, montarResumo } from './copilotoHelpers.js';
import { focoAtual } from './playbook.js';
import { buscar as buscarConhecimento } from './knowledge.js';
import { trechoParaIA } from './knowledgeHelpers.js';

/** Últimas mensagens da conversa, mais antigas primeiro. */
async function ultimasMensagens(conversaId, limite = 12) {
  const rows = await getDb()('mensagens')
    .where({ conversa_id: conversaId, apagada: false })
    .whereNot({ tipo: 'nota' })
    .orderBy('criado_em', 'desc')
    .limit(limite)
    .select('origem', 'texto', 'criado_em');
  return rows.reverse();
}

/** Progresso do procedimento nesta conversa (FASE 8). */
async function playbookDaConversa(conversaId) {
  const db = getDb();
  const exec = await db('playbook_execucoes')
    .where({ conversa_id: conversaId }).orderBy('iniciado_em', 'desc').first();
  if (!exec) return null;

  const [playbook, etapas] = await Promise.all([
    db('playbooks').where({ id: exec.playbook_id }).first(),
    db('playbook_etapas').where({ playbook_id: exec.playbook_id }).orderBy('ordem'),
  ]);
  const feitas = new Set((exec.etapas_feitas || []).map(f => f.etapa_id));
  return {
    playbook, execucao: exec,
    etapas: etapas.map(e => ({ ...e, feita: feitas.has(e.id) })),
    foco: focoAtual(etapas, exec),
  };
}

/**
 * O painel do copiloto: contexto, sinais, próxima ação, resumo e procedimento.
 *
 * **Não chama o modelo.** É de propósito: isto é lido a cada conversa aberta, e
 * gastar uma chamada de IA para dizer "identifique o cliente primeiro" seria
 * caro, lento e não determinístico. O modelo só entra quando o atendente pede
 * uma sugestão de TEXTO.
 */
export async function analisar(conversa, agente, { _mensagens = null } = {}) {
  const [ficha, playbook, mensagens] = await Promise.all([
    montarFicha(conversa, agente).catch(() => null),
    playbookDaConversa(conversa.id).catch(() => null),
    _mensagens || ultimasMensagens(conversa.id).catch(() => []),
  ]);

  const ultimaCliente = [...mensagens].reverse().find(m => m.origem === 'cliente')?.texto || '';
  const sinais = detectarSinais(ultimaCliente);
  const proxima = decidirProximaAcao({ ficha, playbook, ultimaMensagem: ultimaCliente, sinais });

  return {
    proxima,
    sinais,
    resumo: montarResumo({ ficha, playbook, sinais, mensagens }),
    playbook,
    cards: ficha?.cards || [],
    // Devolvido para quem já vai usar as mensagens em seguida (a sugestão)
    // não pagar um segundo round-trip por elas.
    _mensagens: mensagens,
  };
}

const SYSTEM = `Você é o copiloto de um atendente humano de um provedor de internet.
Escreva a mensagem que o ATENDENTE enviaria ao cliente — em primeira pessoa, como
se fosse ele. Português do Brasil, tom cordial e direto, no máximo 3 frases curtas.

REGRAS:
- Use SOMENTE os dados do contexto abaixo. Nunca invente valor, prazo, protocolo,
  status, plano ou data — se não estiver no contexto, não afirme.
- Não cumprimente de novo se a conversa já começou.
- Não prometa prazo nem visita técnica.
- Não diga que é uma IA, não explique seu raciocínio, não use markdown.
- Se faltar informação para responder com segurança, escreva uma mensagem pedindo
  ao cliente exatamente o que falta.
Responda APENAS com o texto da mensagem.`;

/**
 * §78 — a sugestão de resposta.
 *
 * O contexto é montado dos mesmos lugares que a IA atendente usa (ficha,
 * procedimento, base de conhecimento), porque uma sugestão que contradiz o que
 * a IA responderia é pior que nenhuma: o cliente recebe duas versões da mesma
 * empresa.
 */
export async function sugerir(conversa, agente, { instrucao = null } = {}) {
  const inicio = Date.now();
  // Uma consulta só ao SGP e uma só ao histórico: `analisar` já buscou os dois,
  // e refazer aqui dobraria a latência de um clique do atendente.
  const analise = await analisar(conversa, agente);
  const mensagens = analise._mensagens || [];
  const ultimaCliente = [...mensagens].reverse().find(m => m.origem === 'cliente')?.texto || '';

  // A base de conhecimento entra sem registrar uso: quem "usou" o artigo é o
  // atendente, e ele ainda não decidiu nada — o uso é registrado se ele enviar.
  const artigos = ultimaCliente ? await buscarConhecimento(ultimaCliente, { limite: 2 }).catch(() => []) : [];

  const contexto = [
    `## CONTEXTO\n${analise.resumo}`,
    analise.playbook?.foco ? `## PRÓXIMA ETAPA DO PROCEDIMENTO\n${analise.playbook.foco.titulo}` : '',
    artigos.length ? `## BASE DE CONHECIMENTO\n${artigos.map(a => `${a.titulo}: ${trechoParaIA(a, 500)}`).join('\n\n')}` : '',
    `## CONVERSA (mais recente por último)\n${mensagens.map(m => `${m.origem}: ${m.texto || '[mídia]'}`).join('\n')}`,
    instrucao ? `## O ATENDENTE PEDIU\n${instrucao}` : '',
  ].filter(Boolean).join('\n\n');

  const texto = await generateTexto({
    system: SYSTEM,
    messages: [{ role: 'user', content: contexto }],
    temperatura: 0.4,
    maxTokens: 400,
  });

  await registrarEvento({
    conversaId: conversa.id, agenteId: agente?.id, evento: 'sugestao_gerada',
    ms: Date.now() - inicio,
  });

  const { _mensagens, ...analisePublica } = analise;
  return { texto, analise: analisePublica, fontes: artigos.map(a => ({ id: a.id, titulo: a.titulo })) };
}

/** §87 — o que o atendente FEZ com a sugestão. Nunca lança. */
export async function registrarEvento({ conversaId, agenteId = null, evento, acao = null, feedback = null, motivo = null, texto = null, ms = null }) {
  try {
    await getDb()('copiloto_eventos').insert({
      conversa_id: conversaId, agente_id: agenteId, evento,
      acao, feedback, motivo, texto, ms,
    });
  } catch (err) {
    // Métrica que derruba a tela do atendente seria pior que métrica ausente.
    console.error('[Copiloto] registrarEvento:', err.message);
  }
}

/** Agregado de uso — responde "o copiloto está ajudando ou atrapalhando?". */
export async function metricas({ dias = 7 } = {}) {
  const db = getDb();
  const rows = await db('copiloto_eventos')
    .whereRaw(`criado_em > now() - interval '${Math.min(Number(dias) || 7, 90)} days'`)
    .groupBy('evento').select('evento').count('id as n');
  const mapa = Object.fromEntries(rows.map(r => [r.evento, Number(r.n)]));

  const geradas = mapa.sugestao_gerada || 0;
  return {
    ...mapa,
    // A taxa que importa: sugestão gerada que virou mensagem (enviada direto ou
    // depois de editada). Sugestão ignorada é o sinal de que ela não serve.
    aproveitamento: geradas ? Number((((mapa.enviada || 0) + (mapa.editada || 0)) / geradas).toFixed(2)) : null,
  };
}
