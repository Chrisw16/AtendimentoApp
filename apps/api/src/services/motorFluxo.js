/**
 * motorFluxo.js — Motor de execução de fluxos de atendimento
 *
 * Arquitetura:
 *  - Cada conversa tem um estado de execução (nó atual + contexto)
 *  - O motor recebe uma mensagem e avança o fluxo
 *  - Nós suportados: inicio, mensagem, menu, condicional, ia, transferir, encerrar, aguardar
 *  - IA via Anthropic Claude com tools definidas dinamicamente
 */
import Anthropic from '@anthropic-ai/sdk';
import { getDb }          from '../config/db.js';
import { conversaRepo }   from '../repositories/conversaRepository.js';
import { mensagemRepo }   from '../repositories/mensagemRepository.js';
import { broadcast }      from './sseManager.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Estado de execução em memória (migrar para Redis em prod com TTL)
const estadosExecucao = new Map();

// ── TIPOS DE NÓ ───────────────────────────────────────────────────
const PROCESSADORES = {
  inicio:     processarInicio,
  mensagem:   processarMensagem,
  menu:       processarMenu,
  condicional:processarCondicional,
  ia:         processarIA,
  transferir: processarTransferir,
  encerrar:   processarEncerrar,
  aguardar:   processarAguardar,
  webhook:    processarWebhook,
};

// ── ENTRY POINT ───────────────────────────────────────────────────
export async function processarConversa(conversa, mensagemCliente) {
  const db = getDb();

  // Busca fluxo ativo
  const fluxo = await db('fluxos').where({ ativo: true }).first();
  if (!fluxo) {
    // Sem fluxo ativo — vai para IA diretamente
    return processarIADireta(conversa, mensagemCliente);
  }

  const nos      = Array.isArray(fluxo.nos)      ? fluxo.nos      : JSON.parse(fluxo.nos      || '[]');
  const conexoes = Array.isArray(fluxo.conexoes) ? fluxo.conexoes : JSON.parse(fluxo.conexoes || '[]');

  // Estado de execução desta conversa
  let estado = estadosExecucao.get(conversa.id) || {
    noAtual:  'inicio',
    contexto: {},
    historico:[],
  };

  const ctx = {
    conversa,
    mensagem: mensagemCliente,
    fluxo,
    nos,
    conexoes,
    estado,
    db,
    respostas: [],
  };

  // Executa até 10 nós por mensagem (evita loops infinitos)
  let iteracoes = 0;
  while (iteracoes++ < 10) {
    const no = nos.find(n => n.id === ctx.estado.noAtual);
    if (!no) break;

    const processador = PROCESSADORES[no.tipo];
    if (!processador) {
      console.warn(`[Fluxo] Tipo de nó desconhecido: ${no.tipo}`);
      break;
    }

    const resultado = await processador(no, ctx);

    if (resultado.tipo === 'aguardar_input') {
      // Salva estado e aguarda próxima mensagem do cliente
      estadosExecucao.set(conversa.id, ctx.estado);
      break;
    }

    if (resultado.tipo === 'avancar') {
      const proxNo = encontrarProximo(no.id, resultado.saida, ctx.conexoes, ctx.nos);
      if (!proxNo) break;
      ctx.estado.noAtual = proxNo;
      continue;
    }

    if (resultado.tipo === 'fim') {
      estadosExecucao.delete(conversa.id);
      break;
    }

    break;
  }

  // Envia as respostas acumuladas
  for (const resp of ctx.respostas) {
    await enviarResposta(conversa, resp);
  }
}

// ── PROCESSADORES DE NÓ ───────────────────────────────────────────

async function processarInicio(no, ctx) {
  ctx.estado.noAtual = 'inicio';
  ctx.estado.contexto = {};
  return { tipo: 'avancar', saida: 'default' };
}

async function processarMensagem(no, ctx) {
  const texto = interpolarVariaveis(no.config?.texto || '', ctx);
  ctx.respostas.push({ tipo: 'texto', texto });
  return { tipo: 'avancar', saida: 'default' };
}

async function processarMenu(no, ctx) {
  const { pergunta, opcoes = [] } = no.config || {};

  if (!ctx.estado.aguardandoMenu) {
    // Primeira vez — envia o menu
    const opcoesTexto = opcoes.map(o => `${o.id} - ${o.texto}`).join('\n');
    ctx.respostas.push({ tipo: 'texto', texto: `${pergunta}\n\n${opcoesTexto}` });
    ctx.estado.aguardandoMenu = no.id;
    return { tipo: 'aguardar_input' };
  }

  // Recebeu resposta — valida
  const input   = ctx.mensagem.texto?.trim() || '';
  const opcaoId = input.charAt(0);
  const opcao   = opcoes.find(o => String(o.id) === opcaoId || o.texto.toLowerCase().includes(input.toLowerCase()));

  if (!opcao) {
    ctx.respostas.push({ tipo: 'texto', texto: 'Opção inválida. Por favor, escolha uma das opções acima.' });
    return { tipo: 'aguardar_input' };
  }

  ctx.estado.aguardandoMenu = null;
  ctx.estado.contexto.opcaoEscolhida = opcao.id;
  return { tipo: 'avancar', saida: String(opcao.id) };
}

async function processarCondicional(no, ctx) {
  const { campo, operador, valor, saida_sim = 'sim', saida_nao = 'nao' } = no.config || {};
  const valorCampo = getValorContexto(ctx, campo);

  let resultado = false;
  switch (operador) {
    case 'igual':     resultado = String(valorCampo) === String(valor); break;
    case 'contem':    resultado = String(valorCampo).toLowerCase().includes(String(valor).toLowerCase()); break;
    case 'maior':     resultado = Number(valorCampo) > Number(valor); break;
    case 'menor':     resultado = Number(valorCampo) < Number(valor); break;
    case 'existe':    resultado = valorCampo != null && valorCampo !== ''; break;
    default:          resultado = false;
  }

  return { tipo: 'avancar', saida: resultado ? saida_sim : saida_nao };
}

async function processarIA(no, ctx) {
  const promptBase = no.config?.prompt || await getPromptSistema(ctx.db);
  const historico  = await obterHistoricoRecente(ctx.conversa.id, ctx.db);

  const messages = [
    ...historico.map(m => ({
      role:    m.origem === 'cliente' ? 'user' : 'assistant',
      content: m.texto || '',
    })),
    { role: 'user', content: ctx.mensagem.texto || '' },
  ].filter(m => m.content);

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 1024,
      system:     promptBase,
      messages,
      tools:      getToolsIA(ctx),
    });

    // Processa tool use
    for (const bloco of response.content) {
      if (bloco.type === 'tool_use') {
        const resultado = await executarTool(bloco.name, bloco.input, ctx);
        ctx.estado.contexto[`tool_${bloco.name}`] = resultado;
      }
      if (bloco.type === 'text' && bloco.text) {
        ctx.respostas.push({ tipo: 'texto', texto: bloco.text });
      }
    }

    // Se stop_reason for tool_use, continua processando
    if (response.stop_reason === 'end_turn') {
      return { tipo: 'aguardar_input' };
    }
  } catch (err) {
    console.error('[IA] Erro:', err.message);
    ctx.respostas.push({ tipo: 'texto', texto: 'Desculpe, ocorreu um erro. Aguarde um momento.' });
  }

  return { tipo: 'aguardar_input' };
}

async function processarTransferir(no, ctx) {
  const { agente_id, mensagem } = no.config || {};

  await conversaRepo.atualizar(ctx.conversa.id, {
    status:    agente_id ? 'ativa' : 'aguardando',
    agente_id: agente_id || null,
    aguardando_desde: agente_id ? null : new Date().toISOString(),
  });

  if (mensagem) {
    ctx.respostas.push({ tipo: 'texto', texto: mensagem });
  }

  const convAtualizada = await conversaRepo.porId(ctx.conversa.id);
  broadcast('conversa_atualizada', convAtualizada);

  estadosExecucao.delete(ctx.conversa.id);
  return { tipo: 'fim' };
}

async function processarEncerrar(no, ctx) {
  const { mensagem } = no.config || {};
  if (mensagem) ctx.respostas.push({ tipo: 'texto', texto: mensagem });

  await conversaRepo.encerrar(ctx.conversa.id);
  const convAtualizada = await conversaRepo.porId(ctx.conversa.id);
  broadcast('conversa_atualizada', convAtualizada);

  estadosExecucao.delete(ctx.conversa.id);
  return { tipo: 'fim' };
}

async function processarAguardar(no, ctx) {
  return { tipo: 'aguardar_input' };
}

async function processarWebhook(no, ctx) {
  const { url, method = 'POST', campos = [] } = no.config || {};
  if (!url) return { tipo: 'avancar', saida: 'erro' };

  try {
    const body = {};
    campos.forEach(c => { body[c.chave] = getValorContexto(ctx, c.valor); });

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    method !== 'GET' ? JSON.stringify(body) : undefined,
      signal:  AbortSignal.timeout(8000),
    });

    const data = await res.json().catch(() => ({}));
    ctx.estado.contexto.webhook_response = data;

    return { tipo: 'avancar', saida: res.ok ? 'sucesso' : 'erro' };
  } catch {
    return { tipo: 'avancar', saida: 'erro' };
  }
}

// ── IA DIRETA (sem fluxo) ─────────────────────────────────────────
async function processarIADireta(conversa, mensagemCliente) {
  const db         = getDb();
  const prompt     = await getPromptSistema(db);
  const historico  = await obterHistoricoRecente(conversa.id, db);

  const messages = [
    ...historico.map(m => ({
      role:    m.origem === 'cliente' ? 'user' : 'assistant',
      content: m.texto || '',
    })),
    { role: 'user', content: mensagemCliente.texto || '' },
  ].filter(m => m.content);

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 1024,
      system:     prompt,
      messages,
    });

    const texto = response.content.find(b => b.type === 'text')?.text;
    if (texto) await enviarResposta(conversa, { tipo: 'texto', texto });
  } catch (err) {
    console.error('[IA Direta] Erro:', err.message);
  }
}

// ── HELPERS ───────────────────────────────────────────────────────
async function enviarResposta(conversa, { tipo, texto }) {
  if (!texto) return;

  const msg = await mensagemRepo.criar({
    conversa_id: conversa.id,
    origem:      'ia',
    tipo,
    texto,
  });

  broadcast('mensagem', { ...msg, conversa_id: conversa.id });

  // TODO: enviar para canal externo (WhatsApp, Telegram, etc.)
  // await canalService.enviar(conversa, msg);
}

function encontrarProximo(noAtualId, saida, conexoes, nos) {
  const conn = conexoes.find(c =>
    c.origem === noAtualId && (c.saida === saida || c.saida === 'default' || !c.saida)
  ) || conexoes.find(c => c.origem === noAtualId);

  return conn?.destino || null;
}

async function getPromptSistema(db) {
  const kv = await db('sistema_kv').where({ chave: 'prompt_ia' }).first();
  return kv?.valor
    ? (typeof kv.valor === 'string' ? JSON.parse(kv.valor) : kv.valor)
    : 'Você é um assistente de atendimento ao cliente. Seja cordial e objetivo.';
}

async function obterHistoricoRecente(conversaId, db, limit = 10) {
  return db('mensagens')
    .where({ conversa_id: conversaId, apagada: false })
    .whereIn('origem', ['cliente', 'ia', 'agente'])
    .orderBy('criado_em', 'desc')
    .limit(limit)
    .then(rows => rows.reverse());
}

function interpolarVariaveis(texto, ctx) {
  return texto
    .replace(/\{nome\}/g,     ctx.conversa.nome || 'cliente')
    .replace(/\{telefone\}/g, ctx.conversa.telefone || '')
    .replace(/\{canal\}/g,    ctx.conversa.canal || '');
}

function getValorContexto(ctx, caminho) {
  if (!caminho) return '';
  const partes = caminho.split('.');
  let val = ctx.estado.contexto;
  for (const p of partes) val = val?.[p];
  return val ?? ctx.conversa[caminho] ?? '';
}

function getToolsIA(ctx) {
  return [
    {
      name:        'transferir_agente',
      description: 'Transfere a conversa para atendimento humano quando o cliente solicitar ou o problema for complexo',
      input_schema: {
        type: 'object',
        properties: {
          motivo: { type: 'string', description: 'Motivo da transferência' },
        },
        required: [],
      },
    },
    {
      name:        'encerrar_conversa',
      description: 'Encerra a conversa após resolver o problema do cliente',
      input_schema: {
        type: 'object',
        properties: {
          motivo: { type: 'string', description: 'Motivo/resumo do encerramento' },
        },
        required: [],
      },
    },
  ];
}

async function executarTool(nome, input, ctx) {
  switch (nome) {
    case 'transferir_agente':
      await conversaRepo.atualizar(ctx.conversa.id, {
        status:           'aguardando',
        aguardando_desde: new Date().toISOString(),
      });
      broadcast('conversa_atualizada', await conversaRepo.porId(ctx.conversa.id));
      estadosExecucao.delete(ctx.conversa.id);
      return { ok: true };

    case 'encerrar_conversa':
      await conversaRepo.encerrar(ctx.conversa.id);
      broadcast('conversa_atualizada', await conversaRepo.porId(ctx.conversa.id));
      estadosExecucao.delete(ctx.conversa.id);
      return { ok: true };

    default:
      return { erro: `Tool desconhecida: ${nome}` };
  }
}
