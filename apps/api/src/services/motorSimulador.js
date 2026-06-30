/**
 * motorSimulador.js — simulador de conversas do motor de fluxo.
 *
 * Roda uma conversa inteira (multi-turno) sobre o loop REAL do motor
 * (`executarLoop`), com um executor de nós FIEL para os nós determinísticos
 * (mensagens, menus, NPS — reusa os helpers reais) e DECISÕES ROTEIRIZADAS para
 * os nós de IO/IA/SGP (qual porta tomar). Não toca banco/IA/WhatsApp.
 *
 * Serve para responder, sem subir nada:
 *  - a conversa chega ao fim? (concluido)         — passo a passo funciona
 *  - trava? (travado, teto de 15 iterações)       — não fica rodando à toa
 *  - some no meio? (perdido, nó sem aresta)        — cliente largado sem atendimento
 *  - fica esperando input que talvez não venha? (aguardando)
 *
 * Diferente do validador estático (que olha o GRAFO), o simulador EXECUTA um
 * caminho concreto que você roteiriza — os dois se complementam.
 */
import { parseFluxo } from './fluxoValidador.js';
import { avaliarNps } from './fluxoHelpers.js';
import { executarLoop } from './motorLoop.js';

const avancar  = (saida = 'saida') => ({ tipo: 'avancar', saida });
const aguardar = () => ({ tipo: 'aguardar_input' });
const fim      = () => ({ tipo: 'fim' });

const slug = (s) => String(s).toLowerCase().replace(/\s+/g, '_');

// Nós que pedem algo ao cliente e pausam (padrão "enviar e aguardar").
const PAUSA = new Set([
  'enviar_botoes', 'enviar_lista', 'aguardar_resposta',
  'solicitar_localizacao', 'nps_inline', 'consultar_cliente',
]);

// Nós de IO/decisão: porta vem de `decisoes` (ou do default abaixo).
const DECISAO = {
  condicao: 'sim', condicao_multipla: 'default', divisao_ab: 'a',
  verificar_status: 'ativo', consultar_boleto: 'encontrado',
  abrir_chamado: 'sucesso', promessa_pagamento: 'sucesso', chamada_http: 'sucesso',
  ia_responde: 'resolvido', ia_roteador: 'nao_entendeu',
};

// Nós de mensagem: empilham uma resposta e seguem por "saida".
const MSG = {
  enviar_texto: 'texto', enviar_cta: 'cta', enviar_imagem: 'imagem',
  enviar_audio: 'audio', enviar_arquivo: 'arquivo', enviar_localizacao: 'localizacao',
};

function temDecisao(ctx, id) {
  return ctx.decisoes && ctx.decisoes[id] != null;
}
function resolverDecisao(ctx, id, padrao) {
  const d = ctx.decisoes ? ctx.decisoes[id] : undefined;
  if (typeof d === 'function') return d(ctx);
  if (d != null) return d;
  return padrao;
}

function normalizarItens(itens) {
  if (typeof itens === 'string') { try { itens = JSON.parse(itens); } catch { itens = []; } }
  return Array.isArray(itens) ? itens : [];
}

function matchBotao(cfg, texto) {
  const inp = (texto || '').trim();
  const m = (cfg.botoes || []).find(b => {
    const lbl = typeof b === 'object' ? b.label : b;
    const id  = typeof b === 'object' ? b.id   : b;
    return inp.toLowerCase() === String(lbl).toLowerCase() || inp === id;
  });
  return m ? (typeof m === 'object' ? m.id : slug(m)) : 'saida';
}

function matchItem(cfg, texto) {
  const itens = normalizarItens(cfg.itens);
  const inp = (texto || '').trim();
  const num = parseInt(inp, 10) - 1;
  const m = itens.find(it => inp.toLowerCase() === (it.titulo || '').toLowerCase() || inp === it.id)
    || (num >= 0 && num < itens.length ? itens[num] : null);
  return m ? m.id : 'saida';
}

function empilharPrompt(no, ctx) {
  const cfg = no.config || {};
  switch (no.tipo) {
    case 'enviar_botoes': ctx.respostas.push({ tipo: 'botoes', corpo: cfg.corpo || '', botoes: cfg.botoes || [] }); break;
    case 'enviar_lista':  ctx.respostas.push({ tipo: 'lista', corpo: cfg.corpo || '', itens: normalizarItens(cfg.itens) }); break;
    case 'nps_inline':    ctx.respostas.push({ tipo: 'texto', texto: cfg.pergunta || 'Qual sua nota?' }); break;
    case 'consultar_cliente': ctx.respostas.push({ tipo: 'texto', texto: cfg.mensagem || 'Informe seu CPF:' }); break;
    case 'aguardar_resposta':
    case 'solicitar_localizacao':
      if (cfg.mensagem) ctx.respostas.push({ tipo: 'texto', texto: cfg.mensagem });
      break;
  }
}

function retomarPausa(no, ctx) {
  const cfg = no.config || {};
  switch (no.tipo) {
    case 'enviar_botoes': return temDecisao(ctx, no.id) ? resolverDecisao(ctx, no.id, 'saida') : matchBotao(cfg, ctx.mensagem?.texto);
    case 'enviar_lista':  return temDecisao(ctx, no.id) ? resolverDecisao(ctx, no.id, 'saida') : matchItem(cfg, ctx.mensagem?.texto);
    case 'aguardar_resposta': {
      const v = cfg.variavel || 'resposta';
      ctx.estado.contexto[v] = ctx.mensagem?.texto || '';
      return 'saida';
    }
    case 'solicitar_localizacao': return 'localizacao_recebida';
    case 'nps_inline': {
      const r = avaliarNps(ctx.mensagem?.texto, cfg.escala);
      return r.valida ? r.porta : resolverDecisao(ctx, no.id, 'detrator');
    }
    case 'consultar_cliente': return resolverDecisao(ctx, no.id, 'encontrado');
    default: return 'saida';
  }
}

/** Executor de nó do simulador (injetado no executarLoop como `processarNo`). */
export async function simularNo(no, ctx) {
  const cfg = no.config || {};
  const t = no.tipo;

  if (t === 'inicio') { ctx.estado.contexto.cliente = ctx.estado.contexto.cliente || {}; return avancar('saida'); }
  if (t === 'gatilho_keyword') return avancar('saida');

  if (t === 'encerrar') {
    if (cfg.mensagem) ctx.respostas.push({ tipo: 'texto', texto: cfg.mensagem });
    return fim();
  }
  if (t === 'transferir_agente') {
    const p = resolverDecisao(ctx, no.id, null);
    if (p === 'fora_horario') {
      if (cfg.msg_fora) ctx.respostas.push({ tipo: 'texto', texto: cfg.msg_fora });
      return avancar('fora_horario');
    }
    ctx.respostas.push({ tipo: 'texto', texto: '(transferindo para atendente)' });
    return fim();
  }

  if (MSG[t]) {
    ctx.respostas.push({ tipo: MSG[t], texto: cfg.texto ?? cfg.corpo ?? '' });
    return avancar('saida');
  }

  if (PAUSA.has(t)) {
    if (ctx.estado.aguardando === no.id) {
      ctx.estado.aguardando = null;
      return avancar(retomarPausa(no, ctx));
    }
    empilharPrompt(no, ctx);
    ctx.estado.aguardando = no.id;
    return aguardar();
  }

  if (DECISAO[t] !== undefined) return avancar(resolverDecisao(ctx, no.id, DECISAO[t]));

  if (t === 'definir_variavel') {
    if (cfg.variavel) ctx.estado.contexto[cfg.variavel] = cfg.valor;
    return avancar('saida');
  }

  // lineares restantes (aguardar_tempo, listar_planos, consultar_historico,
  // nota_interna, enviar_email, stubs, tipo desconhecido)
  return avancar('saida');
}

/**
 * Simula uma conversa inteira.
 * @param fluxo  objeto do fluxo (formato editor/legado — passa pelo parseFluxo)
 * @param opts   { turnos:string[], decisoes:{id:porta|fn}, contextoInicial:{} }
 * @returns { status, trilha, transcript, turnos, estado, perdidoEm }
 *   status final: 'concluido'|'perdido'|'travado'|'aguardando'|'erro'|'sem_entrada'
 */
export async function simularConversa(fluxo, opts = {}) {
  const { turnos = [''], decisoes = {}, contextoInicial = {} } = opts;
  const { nodes, edges } = parseFluxo(fluxo);

  const entrada = nodes.find(n => n.tipo === 'inicio' || n.tipo === 'gatilho_keyword');
  if (!entrada) return { status: 'sem_entrada', trilha: [], transcript: [], turnos: [] };

  const estado = { noAtual: entrada.id, contexto: { cliente: {}, ...contextoInicial }, aguardando: null };
  const trilha = [];
  const transcript = [];
  const turnosOut = [];
  let status = 'aguardando';
  let perdidoEm = null;

  const msgs = turnos.length ? turnos : [''];
  for (let i = 0; i < msgs.length; i++) {
    if (i > 0 && status !== 'aguardando') break; // conversa já terminou
    const ctx = {
      dados: { nodes, edges }, estado, decisoes,
      mensagem: { texto: msgs[i] }, respostas: [],
    };
    const trilhaTurno = [];
    const res = await executarLoop(ctx, {
      processarNo: simularNo,
      onPasso: ({ no }) => { trilha.push(no.id); trilhaTurno.push(no.id); },
    });
    status = res.status;
    if (status === 'perdido') perdidoEm = res.noId;
    transcript.push(...ctx.respostas);
    turnosOut.push({ mensagem: msgs[i], status, trilha: trilhaTurno, respostas: ctx.respostas });
  }

  return { status, trilha, transcript, turnos: turnosOut, estado, perdidoEm };
}
