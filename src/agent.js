/**
 * agent.js — Maxxi v7.0 — Máquina de estados + IA
 * 
 * Bot-first: botões e listas enviados por código
 * IA-fallback: quando cliente digita texto em vez de clicar
 * TUDO vem da API (ERP). NUNCA inventa dados.
 * 
 * Estados: inicio → aguardando_tipo → aguardando_cpf → identificado → 
 *          aguardando_contrato → atendimento
 */
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { CITMAX_TENANT_ID } from "./services/db.js";
import { getConversationHistory } from "./services/chatwoot.js";
import { tools as allTools, executeTool } from "./tools/index.js";
import { logger } from "./services/logger.js";
import { waSendText } from "./services/whatsapp.js";
import { gerarProtocolo } from "./services/protocolo.js";
import { gerarSaudacao } from "./services/saudacao.js";
import { TOOLS_POR_AGENTE } from "./prompts/prompts-multi.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const GPT = "gpt-4o-mini";
const HAIKU = "claude-haiku-4-5-20251001";

const SILENT_TOOLS = new Set(["wa_enviar_botoes", "wa_enviar_lista", "wa_enviar_pix", "wa_enviar_template", "reagir_mensagem"]);
const localHistory = new Map();
function getLocal(id) { return localHistory.get(id) || []; }
function saveLocal(id, msgs) { localHistory.set(id, msgs.slice(-40)); if (localHistory.size > 500) localHistory.delete([...localHistory.keys()][0]); }

// ── PROMPTS DO BANCO (cache 5 min) ──
let _promptsCache = null;
let _promptsCacheTs = 0;
async function carregarPrompts() {
  if (_promptsCache && Date.now() - _promptsCacheTs < 300000) return _promptsCache;
  try {
    const { query } = await import("./services/db.js");
    const r = await query(`SELECT slug, conteudo, provedor, modelo, temperatura FROM prompts WHERE ativo=true`);
    const map = {};
    for (const row of r.rows) {
      map[row.slug] = {
        conteudo: row.conteudo,
        provedor: row.provedor || 'openai',
        modelo: row.modelo || 'gpt-4o-mini',
        temperatura: parseFloat(row.temperatura) || 0.3,
      };
    }
    _promptsCache = map;
    _promptsCacheTs = Date.now();
    return map;
  } catch (e) {
    logger.warn(`⚠️ Falha ao carregar prompts do banco: ${e.message}`);
    return _promptsCache || {};
  }
}

// Limpa cache (chamado quando admin edita prompt)
export function invalidarCachePrompts() { _promptsCache = null; _promptsCacheTs = 0; }

function getToolsOpenAI(agente) {
  const nomes = TOOLS_POR_AGENTE[agente] || [];
  return allTools.filter(t => nomes.includes(t.name)).map(t => ({
    type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema || { type: "object", properties: {} } },
  }));
}
function getToolsClaude(agente) {
  return allTools.filter(t => (TOOLS_POR_AGENTE[agente] || []).includes(t.name));
}

// ═══════════════════════════════════════════════════════════════
// IA ROTEADOR — classifica texto livre
// ═══════════════════════════════════════════════════════════════
const PROMPT_CLASSIFICAR_FALLBACK = `Analise a mensagem e extraia informações. Responda APENAS JSON:
{"intencao":"boleto|pagamento|suporte|comercial|meus_dados|atendente|saudacao|cpf|contrato|encerrar|outro","cpf":"CPF se mencionado ou null","contrato":"numero se mencionado ou null","eh_cliente":true/false/null}

Regras:
- "boleto": boleto, 2ª via, fatura
- "pagamento": já paguei, informar pagamento, liberar, desbloquear
- "suporte": internet caiu, lento, conexão, reiniciar, técnico, manutenção
- "comercial": plano, instalar, contratar, cobertura, preço, cancelar, mudar plano, upgrade
- "meus_dados": meus dados, meu plano, meu contrato, minha conta
- "atendente": falar com atendente, falar com humano, pessoa real
- "saudacao": oi, olá, bom dia, boa tarde (sem outro assunto)
- "cpf": mensagem contém apenas números (CPF/CNPJ)
- "contrato": mensagem contém #N ou "contrato N"
- "encerrar": tchau, obrigado, era isso, /sair
- "outro": qualquer outra coisa`;

async function getPromptClassificar() {
  try {
    const prompts = await carregarPrompts();
    return prompts.roteador?.conteudo || PROMPT_CLASSIFICAR_FALLBACK;
  } catch { return PROMPT_CLASSIFICAR_FALLBACK; }
}

async function classificar(texto) {
  // Primeiro tenta regex rápido (sem gastar tokens)
  const clean = texto.replace(/\D/g, '');
  if (/^\d{11}$/.test(clean)) return { intencao: "cpf", cpf: clean, contrato: null, eh_cliente: true };
  if (/^\d{14}$/.test(clean)) return { intencao: "cpf", cpf: clean, contrato: null, eh_cliente: true };
  if (/^#?\d{1,5}$/.test(texto.trim())) return { intencao: "contrato", cpf: null, contrato: texto.trim().replace('#', ''), eh_cliente: null };
  if (/^\d{5}-?\d{3}$/.test(texto.trim())) return { intencao: "cep", cep: clean, eh_cliente: null };
  if (/\[localizacao:[\d.,-]+\]/.test(texto)) return { intencao: "localizacao_gps", eh_cliente: null };

  // IA classifica
  try {
    const res = await openai.chat.completions.create({
      model: GPT, max_completion_tokens: 100,
      messages: [{ role: "system", content: await getPromptClassificar() }, { role: "user", content: texto }],
    });
    const t = res.choices?.[0]?.message?.content?.trim() || "";
    const m = t.match(/\{[\s\S]*\}/);
    if (m) {
      const p = JSON.parse(m[0]);
      if (p.cpf) p.cpf = String(p.cpf).replace(/\D/g, '');
      if (p.contrato) p.contrato = String(p.contrato).replace(/^#/, '');
      return p;
    }
  } catch (e) {
    logger.warn(`⚠️ Classificar GPT erro: ${e.message}`);
    // Fallback keywords
    try {
      const res = await anthropic.messages.create({
        model: HAIKU, max_tokens: 100,
        messages: [{ role: "user", content: `${await getPromptClassificar()}\n\nMensagem: ${texto}` }],
      });
      const t = res.content?.[0]?.text?.trim() || "";
      const m = t.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
    } catch {}
  }

  // Fallback por keywords
  const l = texto.toLowerCase();
  if (/boleto|fatura|2.?via/i.test(l)) return { intencao: "boleto", eh_cliente: true };
  if (/paguei|pix.*pag|informar pagamento|liberar|desbloqu/i.test(l)) return { intencao: "pagamento", eh_cliente: true };
  if (/internet|conex|lento|caiu|reinici|t[eé]cnico|manuten/i.test(l)) return { intencao: "suporte", eh_cliente: true };
  if (/plano|upgrade|cancel|contrat|instal|cober|pre[çc]o|quero ser|mudar/i.test(l)) return { intencao: "comercial" };
  if (/meus dados|meu plano|meu contrato|minha conta/i.test(l)) return { intencao: "meus_dados" };
  if (/atendente|humano|pessoa|falar com/i.test(l)) return { intencao: "atendente" };
  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|ei|hello|hey)\s*[!.?]?\s*$/i.test(l)) return { intencao: "saudacao" };
  if (/tchau|obrigad|era isso|\/sair|encerr/i.test(l)) return { intencao: "encerrar" };
  return { intencao: "outro" };
}

// ═══════════════════════════════════════════════════════════════
// ENVIAR MENSAGENS WA DIRETO
// ═══════════════════════════════════════════════════════════════
async function enviarBotoesCliente(telefone, corpo, botoes, _convId) {
  try {
    await executeTool("wa_enviar_botoes", { telefone, corpo, botoes });
    // Registra no chat interno como mensagem da IA com os botões visíveis
    if (_convId) {
      const labels = botoes.map(b => b.title || b.id || b).join(' | ');
      const conteudoChat = corpo + (labels ? `\n[opções: ${labels}]` : '');
      try {
        const { registrarRespostaIA } = await import("./services/chatInterno.js");
        await registrarRespostaIA(_convId, conteudoChat).catch(() => {});
      } catch {}
    }
    return true;
  } catch (e) { logger.warn(`⚠️ Botões falhou: ${e.message}`); return false; }
}

async function enviarLista(telefone, corpo, labelBotao, secoes, _convId) {
  try {
    await executeTool("wa_enviar_lista", { telefone, corpo, label_botao: labelBotao, secoes });
    // Registra no chat interno como mensagem da IA com as opções visíveis
    if (_convId) {
      const rows = (secoes || []).flatMap(s => s.rows || []).map(r => r.title || r.id).filter(Boolean);
      const conteudoChat = corpo + (rows.length ? `\n[opções: ${rows.join(' | ')}]` : '');
      try {
        const { registrarRespostaIA } = await import("./services/chatInterno.js");
        await registrarRespostaIA(_convId, conteudoChat).catch(() => {});
      } catch {}
    }
    return true;
  } catch (e) {
    logger.warn(`⚠️ Lista WA falhou (${e.message}) — enviando como texto simples`);
    // Fallback: envia como texto simples com as opções numeradas
    try {
      const rows = (secoes || []).flatMap(s => s.rows || []);
      const opcoesTexto = rows.map((r, i) => `${i + 1}. ${r.title}`).join('\n');
      const mensagemFallback = `${corpo}\n\n${opcoesTexto}\n\n_Digite o número ou nome da opção desejada._`;
      await executeTool("wa_enviar_texto", { telefone, texto: mensagemFallback }).catch(() =>
        waSendText(telefone, mensagemFallback)
      );
      if (_convId) {
        try {
          const { registrarRespostaIA } = await import("./services/chatInterno.js");
          await registrarRespostaIA(_convId, mensagemFallback).catch(() => {});
        } catch {}
      }
    } catch (e2) { logger.warn(`⚠️ Fallback texto também falhou: ${e2.message}`); }
    return false;
  }
}

// Helper: formata zona para mensagem
function zonaStr(zona) {
  if (!zona?.nome) return "";
  return `\n🗺️ Zona: *${zona.nome}*`;
}

// Helper: monta resumo do cadastro para confirmação
function buildResumo(c) {
  const vencDia = c._vencimentos?.find(v => String(v.id || v.vencimento_id) === String(c.vencimento_id))?.dia || '';
  const vencStr = vencDia ? `\n📅 Vencimento: *dia ${vencDia}*` : '';
  return `📋 *Confirma seus dados?*\n\n👤 *${c.nome}*\nCPF: ${c.cpf}\nCelular: ${c.celular}\n📍 ${c.logradouro}, ${c.numero}${c.complemento ? ' - ' + c.complemento : ''}\n${c.bairro} — ${c.cidade}\n📡 Plano: *${c.plano_nome}* — R$ ${parseFloat(c.plano_valor || 0).toFixed(2).replace('.', ',')}/mês${vencStr}`;
}

// Menu principal — lista interativa com todas as opções
async function enviarMenuPrincipal(telefone, corpo, _convId) {
  const rows = [
    { id: "boleto", title: "2a via de boleto", description: "Gerar boleto ou PIX para pagamento" },
    { id: "pagamento", title: "Informar pagamento", description: "Ja paguei / liberar conexao" },
    { id: "meus_dados", title: "Meus dados", description: "Ver plano, status e contrato" },
    { id: "comercial", title: "Mudar de plano", description: "Upgrade, downgrade ou trocar plano" },
    { id: "suporte_tec", title: "Suporte tecnico", description: "Internet caiu, lenta ou instavel" },
    { id: "atendente", title: "Falar com atendente", description: "Transferir para atendente humano" },
    { id: "encerrar", title: "Encerrar atendimento", description: "Finalizar esta conversa" },
  ];
  return enviarLista(telefone, corpo, "Ver opcoes", [{ title: "Como posso ajudar?", rows }], _convId);
}

async function enviarBoleto(telefone, boleto, nomeCliente) {
  const valor = boleto.valor_cobrado || boleto.valor || boleto.valor_original || "—";
  const venc = boleto.vencimento_atual || boleto.vencimento || "—";
  const vencOrig = boleto.vencimento_original || "";
  const vencido = boleto.vencido ? "🔴 Vencido" : "🟢 Em dia";
  const nome = nomeCliente || boleto.cliente || "";
  const multa = boleto.multa || 0;
  const juros = boleto.juros || 0;
  const link = boleto.link_cobranca || boleto.link_boleto || "";
  const pix = boleto.pix_copia_cola || "";
  const linha = boleto.linha_digitavel || boleto.linhadigitavel || "";

  logger.info(`📲 enviarBoleto: R$${valor} | ${nome} | link=${link ? 'SIM' : 'NÃO'}`);

  // 1. Texto com dados do boleto
  let resumo = `📄 *Boleto CITmax*\n\n👤 *${nome}*\n💰 Valor: *R$ ${valor}*\n📅 Vencimento: ${venc}${vencOrig && vencOrig !== venc ? ` (original: ${vencOrig})` : ''}\n${vencido}`;
  if (multa > 0 || juros > 0) resumo += `\n📊 Multa: R$ ${multa} | Juros: R$ ${juros}`;
  try { await waSendText(telefone, resumo); } catch (e) { logger.warn(`⚠️ Texto boleto falhou: ${e.message}`); }

  // 2. CTA Button com link_cobranca
  if (link) {
    try {
      const ctaResult = await executeTool("wa_enviar_pix", {
        telefone,
        link_cobranca: link,
        descricao: "Clique para acessar o PIX e Boleto",
      });
      if (ctaResult?.erro) {
        logger.warn(`⚠️ CTA retornou erro: ${ctaResult.erro}`);
        try { await waSendText(telefone, `🔗 *Acesse seu boleto:*\n${link}`); } catch {}
      } else {
        logger.info(`✅ CTA button enviado com sucesso`);
      }
      return true;
    } catch (e) {
      logger.warn(`⚠️ CTA exception: ${e.message}`);
      try { await waSendText(telefone, `🔗 *Acesse seu boleto:*\n${link}`); } catch {}
    }
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════
// CONSULTAR API DO ERP
// ═══════════════════════════════════════════════════════════════
async function consultarCliente(cpf) {
  const cleanCpf = String(cpf).replace(/\D/g, '');
  try { return await executeTool("consultar_clientes", { cpfcnpj: cleanCpf }); }
  catch (e) { logger.warn(`⚠️ consultar_clientes falhou: ${e.message}`); return null; }
}

// Verifica status online/offline de todos os contratos em paralelo
async function enriquecerContratos(contratos) {
  if (!contratos?.length) return contratos;
  try {
    const statusPromises = contratos.map(c =>
      executeTool("verificar_conexao", { contrato: String(c.id) })
        .then(r => ({ id: c.id, online: r?.online || false, msg: r?.msg || "?" }))
        .catch(() => ({ id: c.id, online: false, msg: "?" }))
    );
    const resultados = await Promise.all(statusPromises);
    return contratos.map(c => {
      const st = resultados.find(r => String(r.id) === String(c.id));
      return { ...c, online: st?.online || false, status_msg: st?.msg || "?" };
    });
  } catch (e) {
    logger.warn(`⚠️ verificar status falhou: ${e.message}`);
    return contratos;
  }
}

async function gerarBoleto(cpf, contrato) {
  const cleanCpf = String(cpf).replace(/\D/g, '');
  const cleanContrato = String(contrato).replace(/^#/, '');
  try { return await executeTool("segunda_via_boleto", { cpfcnpj: cleanCpf, contrato: cleanContrato }); }
  catch (e) { logger.warn(`⚠️ segunda_via_boleto falhou: ${e.message}`); return null; }
}

// ═══════════════════════════════════════════════════════════════
// IA CONVERSA LIVRE (suporte, comercial, etc)
// ═══════════════════════════════════════════════════════════════

// Cache de tipos de ocorrência (recarrega a cada 5min)
let _tiposCache = null;
let _tiposCacheTs = 0;
async function carregarTiposOcorrencia() {
  if (_tiposCache && Date.now() - _tiposCacheTs < 300000) return _tiposCache;
  try {
    const { query } = await import("./services/db.js");
    const r = await query(`SELECT sgp_id, nome, keywords FROM ocorrencia_tipos WHERE ativo=true ORDER BY ordem`);
    _tiposCache = r.rows;
    _tiposCacheTs = Date.now();
    return _tiposCache;
  } catch { return []; }
}

let _planosCache = null;
let _planosCacheTs = 0;
async function carregarPlanos() {
  if (_planosCache && Date.now() - _planosCacheTs < 300000) return _planosCache;
  try {
    const { query } = await import("./services/db.js");
    const r = await query(`
      SELECT c.nome as cidade, p.nome as plano, p.velocidade, p.unidade, p.valor, p.sgp_id
      FROM cidade_planos cp
      JOIN cidades c ON c.id=cp.cidade_id AND c.ativo=true
      JOIN planos p ON p.id=cp.plano_id AND p.ativo=true
      ORDER BY c.ordem, p.ordem
    `);
    _planosCache = r.rows;
    _planosCacheTs = Date.now();
    return _planosCache;
  } catch { return []; }
}

async function iaConversa(agente, content, history, sess) {
  // Carrega prompts do banco
  const prompts = await carregarPrompts();
  const cfg = prompts[agente] || prompts.outros || { conteudo: "Você é a Maxxi, atendente virtual da CITmax. Responda de forma simpática.", provedor: 'openai', modelo: 'gpt-4o-mini', temperatura: 0.3 };
  let prompt = cfg.conteudo;
  const provedor = cfg.provedor || 'openai';
  const modelo = cfg.modelo || 'gpt-4o-mini';
  const temperatura = cfg.temperatura || 0.3;

  // Injeta [REGRAS] e [ESTILO] (editáveis separadamente)
  if (prompt.includes("[REGRAS]")) {
    prompt = prompt.replace(/\[REGRAS\]/g, prompts.regras?.conteudo || "");
  }
  if (prompt.includes("[ESTILO]")) {
    prompt = prompt.replace(/\[ESTILO\]/g, prompts.estilo?.conteudo || "");
  }

  // Injeta tipos de ocorrência dinâmicos
  if (prompt.includes("[TIPOS_OCORRENCIA]")) {
    const tipos = await carregarTiposOcorrencia();
    const tiposStr = tipos.map(t => `${t.sgp_id} = ${t.nome}`).join(", ");
    prompt = prompt.replace("[TIPOS_OCORRENCIA]", tiposStr || "200=Reparo, 5=Outros");
  }

  // Injeta planos dinâmicos
  if (prompt.includes("[PLANOS]")) {
    const planos = await carregarPlanos();
    if (planos.length > 0) {
      const porCidade = {};
      planos.forEach(p => {
        if (!porCidade[p.cidade]) porCidade[p.cidade] = [];
        porCidade[p.cidade].push(`${p.plano} (${p.velocidade} ${p.unidade}, R$${parseFloat(p.valor).toFixed(2)}, ID SGP: ${p.sgp_id})`);
      });
      const planosStr = Object.entries(porCidade).map(([c, ps]) => `${c}: ${ps.join(', ')}`).join('\n');
      prompt = prompt.replace("[PLANOS]", planosStr);
    } else {
      prompt = prompt.replace("[PLANOS]", "Consultar planos no sistema");
    }
  }

  const cpfCtx = sess.cpfcnpj ? `\n[CPF: ${sess.cpfcnpj}]` : "";
  const telCtx = sess._telefone ? `\n[Telefone: ${sess._telefone}]` : "";
  const nomeCtx = sess.nome ? `\n[Nome: ${sess.nome}]` : "";
  const contratosCtx = sess.contratos?.length ? `\n[Contratos: ${sess.contratos.map(c => `#${c.id}(${c.end || ''})`).join(', ')}]` : "";
  const contratoAtivo = sess.contrato_ativo ? `\n[Contrato ativo: ${sess.contrato_ativo}]` : "";
  const system = prompt + cpfCtx + telCtx + nomeCtx + contratosCtx + contratoAtivo;

  const toolsOAI = getToolsOpenAI(agente);
  const toolsCL = getToolsClaude(agente);

  logger.info(`🤖 IA: agente=${agente} provedor=${provedor} modelo=${modelo} temp=${temperatura}`);

  // Usa o provedor/modelo configurado no banco
  if (provedor === 'anthropic') {
    try { return await loopClaude(system, history, content, toolsCL, sess, modelo, temperatura); }
    catch (e) {
      logger.warn(`⚠️ Anthropic falhou: ${e.message}, fallback OpenAI...`);
      try { return await loopGPT(system, history, content, toolsOAI, sess); }
      catch (e2) { logger.error(`❌ Ambos falharam: ${e2.message}`); return { text: "Estou com instabilidade. Pode tentar de novo? 🙏" }; }
    }
  } else {
    try { return await loopGPT(system, history, content, toolsOAI, sess, modelo, temperatura); }
    catch (e) {
      logger.warn(`⚠️ OpenAI falhou: ${e.message}, fallback Anthropic...`);
      try { return await loopClaude(system, history, content, toolsCL, sess); }
      catch (e2) { logger.error(`❌ Ambos falharam: ${e2.message}`); return { text: "Estou com instabilidade. Pode tentar de novo? 🙏" }; }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// MOSTRAR CLIENTE IDENTIFICADO — contratos + menu
// ═══════════════════════════════════════════════════════════════
async function mostrarClienteIdentificado(sess, telefone, _convId) {
  const nome = sess.nome?.split(' ')[0] || "cliente";
  const contratos = sess.contratos || [];

  // Monta resumo dos contratos
  let resumo = `Encontrei! 👋 Olá, *${nome}*!\n\n`;
  resumo += `📦 *Seus contratos:*\n`;
  for (const c of contratos.slice(0, 10)) {
    const status = c.status ? ` (${c.status})` : "";
    const plano = c.plano ? ` — ${c.plano}` : "";
    resumo += `  • *#${c.id}*${plano}${status}\n    📍 ${c.end || "Sem endereço"}\n`;
  }
  resumo += `\nComo posso te ajudar?`;

  // Envia com botões
  const ok = await enviarMenuPrincipal(telefone, resumo, _convId);

  return ok ? "" : resumo;
}
// ═══════════════════════════════════════════════════════════════
export { loopGPT, loopClaude };

export async function iaFluxo({ contexto, prompt, modelo, provedor, maxTokens, system, history, content, tools, toolsOAI, sess }) {
  const GPT_M   = "gpt-4o-mini";
  const HAIKU_M = "claude-haiku-4-5-20251001";
  const p = provedor || (modelo?.startsWith("claude") ? "anthropic" : "openai");
  const m = modelo || (p === "anthropic" ? HAIKU_M : GPT_M);

  if (p === "anthropic") {
    try { return await loopClaude(system, history || [], content, tools || [], sess || {}, m); }
    catch(e) {
      logger.warn?.(`⚠️ iaFluxo Claude falhou: ${e.message}, fallback OpenAI`);
      return await loopGPT(system, history || [], content, toolsOAI || [], sess || {}, GPT_M);
    }
  } else {
    try { return await loopGPT(system, history || [], content, toolsOAI || [], sess || {}, m); }
    catch(e) {
      logger.warn?.(`⚠️ iaFluxo GPT falhou: ${e.message}, fallback Claude`);
      return await loopClaude(system, history || [], content, tools || [], sess || {}, HAIKU_M);
    }
  }
}

export async function runMaxxi({ accountId, conversationId, messageId, content, sender, channel, protocolo, memoria, telefone, sessao, tenantId = CITMAX_TENANT_ID }) {
  const t0 = Date.now();
  let sess = sessao ? { ...sessao } : {};
  sess._telefone = telefone;

  // Histórico
  let history = [];
  if (accountId) {
    try { history = await getConversationHistory(accountId, conversationId); } catch { history = getLocal(conversationId); }
  } else { history = getLocal(conversationId); }

  // Wrappers de envio que registram automaticamente no chat interno
  const _enviarBotoes = (tel, corpo, botoes) => enviarBotoesCliente(tel, corpo, botoes, conversationId);
  const _enviarLista = (tel, corpo, label, secoes) => enviarLista(tel, corpo, label, secoes, conversationId);

  const estado_raw = sess._estado || "inicio";
  
  // Se inativo por N minutos E estava com IA, nova saudação (configurável no painel)
  let RESET_MS = 30 * 60 * 1000; // padrão 30min
  try {
    const { getConfig: getReativConfig } = await import("./services/reativacao.js");
    const rCfg = await getReativConfig();
    if (rCfg?.reset_sessao_minutos > 0) RESET_MS = rCfg.reset_sessao_minutos * 60 * 1000;
  } catch {}
  const lastActivity = sess._lastActivity ? new Date(sess._lastActivity).getTime() : 0;
  const isStale = lastActivity > 0 && (Date.now() - lastActivity > RESET_MS);
  // Qualquer estado que não seja "inicio" deve resetar após inatividade
  const estadosIA = [
    "atendimento", "identificado", "aguardando_menu", "suporte_aguardando",
    "aguardando_tipo", "aguardando_cpf", "aguardando_contrato",
    "comercial_tipo", "comercial_cidade", "comercial_plano", "comercial_nome",
    "comercial_cpf", "comercial_nascimento", "comercial_email", "comercial_celular",
    "comercial_endereco", "comercial_numero", "comercial_complemento",
    "comercial_bairro", "comercial_referencia", "comercial_confirmar",
    "comercial_vencimento", "comercial_cep", "comercial_cep_confirm", "comercial_empresarial_cnpj", "comercial_empresarial_resp", "comercial_empresarial_pontos",
    "suporte_tipo", "suporte_descricao", "financeiro_opcao",
    "boleto_aguardando", "cancelamento_motivo", "cancelamento_confirmar",
  ];
  const estado = (isStale && estadosIA.includes(estado_raw)) ? "inicio" : estado_raw;
  if (isStale && estadosIA.includes(estado_raw)) {
    logger.info(`🔄 Sessão inativa ${Math.round((Date.now() - lastActivity) / 60000)}min, reset para inicio`);
    sess._estado = "inicio";
    sess._cadastro = null;
    sess._sugestoes_endereco = null;
    sess._plano_selecionado = null;
  }
  sess._lastActivity = new Date().toISOString();
  
  logger.info(`🧠 [${channel}] #${conversationId} | estado=${estado} | "${content?.slice(0, 50)}"`);
  // Salva ID da última mensagem para uso em reações
  if (messageId) sess._lastMsgId = messageId;

  let reply = "";
  let novaEstado = estado;
  let break_flag = false;

  // ── BOTÃO SGP: cliente clicou em "Ver meu boleto" enviado pelo gateway SMS ──
  if (content === "SGP_BOLETO" || content === "💰 Ver meu boleto" || content?.toLowerCase() === "ver meu boleto") {
    logger.info(`💰 Botão SGP_BOLETO detectado para ${telefone}`);
    // Se já tem CPF na sessão, vai direto pro boleto
    if (sess.cpfcnpj && sess.contratos?.length > 0) {
      return await resolverBoleto(sess, history, content, telefone, conversationId, accountId, t0);
    }
    // Se não tem CPF ainda, pede identificação
    sess._intencao_pendente = "boleto";
    sess._estado = "aguardando_cpf";
    reply = "Olá! 👋 Para gerar seu boleto, preciso te identificar primeiro.\n\nQual seu *CPF* ou *CNPJ*?";
    await saveSess();
    return reply;
  }

  // ── ESTADO: INICIO (primeira mensagem) ──
  if (estado === "inicio") {
    // Garante que dados de cadastro anterior foram limpos
    sess._cadastro = null;
    sess._sugestoes_endereco = null;
    const prot = sess._protocolo || gerarProtocolo();
    sess._protocolo = prot;

    // Se foi encerrado por inatividade recentemente (< 8h) E já tem protocolo
    // → retoma a conversa sem nova saudação com protocolo
    const foiEncerradoRecente = sess._encerrado_inatividade
      && (Date.now() - sess._encerrado_inatividade) < 8 * 60 * 60 * 1000;

    if (foiEncerradoRecente && sess._protocolo) {
      // Limpa flag de encerramento
      sess._encerrado_inatividade = null;
      reply = `Olá! 😊 Seu atendimento continua com o protocolo *${prot}*. Como posso te ajudar?`;
      novaEstado = "aguardando_tipo";
    } else {
      // Saudação completa para conversa nova
      sess._encerrado_inatividade = null;
      const saudacao = gerarSaudacao();
      const corpo = `${saudacao}\nSou a Maxxi, atendente virtual da CITmax! 😊\n\n📋 Protocolo: *${prot}*\n\nVocê já é cliente CITmax?`;

      const enviou = await _enviarBotoes(telefone, corpo, [
        { id: "sou_cliente", title: "✅ Sou cliente" },
        { id: "quero_ser", title: "🆕 Quero contratar" },
      ]);

      reply = enviou ? "" : `${saudacao} Sou a Maxxi da CITmax! 😊\n\n📋 Protocolo: *${prot}*\n\nVocê já é cliente? Responda *1* para sim ou *2* para contratar.`;
      novaEstado = "aguardando_tipo";
    }
  }

  // ── ESTADO: AGUARDANDO TIPO (sou cliente / quero ser) ──
  else if (estado === "aguardando_tipo") {
    const lower = content.toLowerCase().trim();

    // Detecção direta por texto (antes da IA) — frases comuns que significam "sou cliente"
    // Inclui variações de áudio transcrito (Whisper pode transcrever de formas diferentes)
    const ehCliente = content.includes("Sou cliente") || content.includes("sou_cliente")
      || /^(j[aá]|sim|sou|sou sim|j[aá] sou|j[aá] tenho|sou cliente|1|já|tenho)$/i.test(lower)
      || /tenho (internet|contrato|plano|fibra|wifi|wi-fi)/i.test(lower)
      || /meu (boleto|contrato|plano|internet)/i.test(lower)
      || /j[aá] (sou|tenho|assino|uso|contratei)/i.test(lower)
      || /vem hoje|visita|t[eé]cnico|instala[cç]/i.test(lower)
      || /cliente (da|de) citmax/i.test(lower)
      || /[aá]udio.*cliente|cliente.*[aá]udio/i.test(lower);

    // Frases comuns que significam "quero contratar"
    const querContratar = content.includes("Quero contratar") || content.includes("quero_ser")
      || /^(2|n[aã]o|quero|contratar|quero internet|quero contratar|não sou|novo|assinar)$/i.test(lower)
      || /quero (ser|virar|assinar|contratar|internet|fibra|wifi|wi-fi)/i.test(lower)
      || /como (contrato|assino|fa[cç]o|consigo)/i.test(lower)
      || /(ainda )?n[aã]o (sou|tenho|assino)/i.test(lower)
      || /(quero|preciso|gostaria) (de )?(contratar|assinar|internet|fibra|plano)/i.test(lower)
      || /n[aã]o (sou|tenho) cliente/i.test(lower);

    // Se nem ehCliente nem querContratar bateram → usa IA para interpretar (cobre áudios transcritos)
    let _intencaoFallback = null;
    if (!ehCliente && !querContratar && lower.length > 2) {
      try {
        const info = await classificar(content);
        _intencaoFallback = info.intencao;
        if (_intencaoFallback === "comercial") { /* será tratado abaixo */ }
      } catch {}
    }
    const _ehClienteFinal = ehCliente || _intencaoFallback === "cliente" || _intencaoFallback === "boleto" || _intencaoFallback === "suporte";
    const _querContratarFinal = querContratar || _intencaoFallback === "comercial";

    if (_ehClienteFinal) {
      // Tenta classificar com IA pra pegar CPF se informado
      const info = await classificar(content);
      if (info.cpf) {
        sess.cpfcnpj = info.cpf;
        const cliente = await consultarCliente(info.cpf);
        if (cliente && !cliente.erro) {
          sess.nome = cliente.nome;
          sess.contratos = await enriquecerContratos(cliente.contratos || []);
          const qtd = cliente.contratos?.length || 0;

          if (qtd > 1) {
            // Múltiplos → lista interativa
            const rows = cliente.contratos.slice(0, 10).map(c => ({
              id: String(c.id), title: `${c.online ? '🟢' : '🔴'} Contrato ${c.id}`,
              description: (c.end || c.plano || 'Sem endereço').slice(0, 72),
            }));
            // Se já quer boleto, salva intenção pra depois da seleção
            if (info.intencao === "boleto") sess._intencao_pendente = "boleto";
            await _enviarLista(telefone, `Olá, *${cliente.nome?.split(' ')[0]}*! 👋\n\nVocê tem *${qtd} contratos*. Selecione:`, "Ver contratos");
            reply = "";
            novaEstado = "aguardando_contrato";
          } else if (qtd === 1) {
            sess.contrato_ativo = String(cliente.contratos[0].id);
            if (info.intencao === "boleto") {
              return await resolverBoleto(sess, history, content, telefone, conversationId, accountId, t0);
            }
            const c = cliente.contratos[0];
            await enviarMenuPrincipal(telefone, `Olá, *${cliente.nome?.split(' ')[0]}*! 👋

📄 Contrato *#${c.id}* — ${c.end || ''}

Como posso te ajudar?`, conversationId);
            reply = "";
            novaEstado = "identificado";
          } else {
            reply = "Encontrei seu cadastro mas sem contratos ativos. 🤔";
            novaEstado = "identificado";
          }
        } else {
          reply = "Não encontrei esse CPF/CNPJ no sistema. Pode verificar e digitar novamente? 🤔";
          novaEstado = "aguardando_cpf";
        }
      } else {
        reply = "Perfeito! Qual o seu *CPF* ou *CNPJ*? 📝";
        novaEstado = "aguardando_cpf";
      }
    }
    // Clicou "Quero contratar" ou detectou novo cliente
    else if (_querContratarFinal) {
      sess._cadastro = {};
      // Pergunta CEP antes de oferecer planos
      reply = "Que legal que quer contratar CITmax! 😊\n\nPara verificar cobertura na sua região:\n\n📍 Envie sua *localização* pelo WhatsApp (clique no 📎 > Localização)\n\nou\n\n✍️ Digite seu *CEP* (ex: 59064-625) ou *endereço completo* (rua, bairro, cidade)";
      novaEstado = "comercial_cep";
    }
    // Cliente mandou CEP → verifica cobertura direto
    else if (/^\d{5}-?\d{3}$/.test(content.trim()) || /^\d{8}$/.test(content.replace(/\D/g,""))) {
      sess._cadastro = {};
      reply = "Deixa eu verificar a cobertura no seu CEP... 🔍";
      novaEstado = "comercial_cep";
    }
    // Não entendeu — reenvia botões
    else {
      const info = await classificar(content);
      // Última chance: IA detectou intenção
      if (info.intencao === "boleto" || info.intencao === "suporte" || info.eh_cliente === true) {
        reply = "Perfeito! Qual o seu CPF? 📝";
        novaEstado = "aguardando_cpf";
      } else if (info.intencao === "comercial" || info.eh_cliente === false) {
        sess._cadastro = {};
        reply = "Que legal que quer contratar CITmax! 😊\n\nPara verificar cobertura na sua região:\n\n📍 Envie sua *localização* pelo WhatsApp (clique no 📎 > Localização)\n\nou\n\n✍️ Digite seu *CEP* (ex: 59064-625) ou *endereço completo* (rua, bairro, cidade)";
        novaEstado = "comercial_cep";
      } else {
        await _enviarBotoes(telefone, "Me diz: você já é cliente ou quer contratar? 😊", [
          { id: "sou_cliente", title: "✅ Sou cliente" },
          { id: "quero_ser", title: "🆕 Quero contratar" },
        ]);
        reply = "";
      }
    }
  }

  // ── ESTADO: AGUARDANDO CPF ──
  else if (estado === "aguardando_cpf") {
    const info = await classificar(content);
    const _cpfRaw = content.replace(/\D/g, '');
    const cpf = info.cpf || (_cpfRaw.length === 11 || _cpfRaw.length === 14 ? _cpfRaw : null);

    if (cpf) {
      sess.cpfcnpj = cpf;
      const cliente = await consultarCliente(cpf);
      if (cliente && !cliente.erro && cliente.nome) {
        sess.nome = cliente.nome;
        sess.contratos = await enriquecerContratos(cliente.contratos || []);
        const qtd = sess.contratos.length;

        if (qtd > 1) {
          const rows = sess.contratos.slice(0, 10).map(c => ({
            id: String(c.id),
            title: `${c.online ? '🟢' : '🔴'} Contrato ${c.id}`,
            description: (c.end || c.plano || 'Sem endereço').slice(0, 72),
          }));
          const ok = await enviarLista(
            telefone,
            `Encontrei! 👋 Olá, *${cliente.nome?.split(' ')[0]}*!\n\nVocê tem *${qtd} contratos*. Selecione:`,
            "Ver contratos",
            [{ title: "Seus contratos", rows }]
          );
          reply = ok ? "" : `Olá, ${cliente.nome?.split(' ')[0]}! Encontrei ${qtd} contratos. Digite o número:`;
          novaEstado = "aguardando_contrato";
        } else if (qtd === 1) {
          sess.contrato_ativo = String(sess.contratos[0].id);
          const c = sess.contratos[0];
          const stIcon = c.online ? '🟢 Online' : '🔴 Offline';
          reply = `Encontrei! 👋 Olá, *${cliente.nome?.split(' ')[0]}*!\n\n📄 Contrato *#${c.id}* — ${c.end || c.plano || ''}\n${stIcon}`;
          await enviarMenuPrincipal(telefone, reply + "\n\nComo posso te ajudar?", conversationId);
          reply = "";
          novaEstado = "identificado";
        } else {
          reply = "Encontrei seu cadastro mas sem contratos ativos. Posso ajudar com outra coisa? 🤔";
          novaEstado = "identificado";
        }
      } else {
        reply = "Não encontrei esse CPF/CNPJ no sistema 😔 Verifique e tente novamente.";
      }
    } else if (info.intencao === "encerrar") {
      reply = "Tudo bem! Qualquer coisa é só chamar. 😊";
      novaEstado = "inicio";
    } else {
      reply = "Preciso do seu *CPF* ou *CNPJ* pra continuar. Pode digitar? 📝";
    }
  }

  // ── ESTADO: IDENTIFICADO (aguardando menu) ──
  else if (estado === "identificado" || estado === "aguardando_menu") {
    const info = await classificar(content);
    const lower = content.toLowerCase();

    // 💰 BOLETO
    if (content.includes("2a via") || lower.includes("boleto") || lower.includes("fatura") ||
      lower.includes("segunda via") || lower.includes("pix") || lower.includes("pagar") ||
      lower.includes("pagamento") && !lower.includes("informar pagamento") ||
      info.intencao === "boleto") {
      return await resolverBoleto(sess, history, content, telefone, conversationId, accountId, t0);
    }

    // 💳 INFORMAR PAGAMENTO (liberar contrato suspenso/reduzido)
    else if (content.includes("Informar pagamento") || lower.includes("já paguei") ||
      lower.includes("ja paguei") || lower.includes("paguei") || lower.includes("efetuei") ||
      lower.includes("informar pagamento") || lower.includes("liberar") ||
      lower.includes("liberação") || lower.includes("liberacao")) {
      const contratoId = sess.contrato_ativo || (sess.contratos?.length === 1 ? String(sess.contratos[0].id) : null);
      if (!contratoId) {
        sess._intencao_pendente = "pagamento";
        const rows = (sess.contratos || []).slice(0, 10).map(c => ({ id: String(c.id), title: `${c.online ? '🟢' : '🔴'} Contrato ${c.id}`, description: (c.end || c.plano || '').slice(0, 72) }));
        await _enviarLista(telefone, "Qual contrato deseja liberar?", "Ver contratos", [{ title: "Seus contratos", rows }]);
        reply = "";
        novaEstado = "aguardando_contrato";
      } else {
        // Verifica se contrato está suspenso ou reduzido
        const contrato = sess.contratos?.find(c => String(c.id) === contratoId);
        const statusContrato = (contrato?.status || "").toLowerCase();
        
        if (statusContrato === "ativo") {
          reply = `Seu contrato *#${contratoId}* já está *ativo* e com conexão normal! 😊\n\nSe está com problema na internet, selecione *Suporte técnico* no menu.\n\nPrecisa de mais alguma coisa?`;
        } else if (statusContrato === "suspenso" || statusContrato === "reduzido" || statusContrato === "ativo vel. reduzida") {
          try {
            const resultado = await executeTool("promessa_pagamento", { contrato: contratoId });
            if (resultado?.erro || !resultado?.liberado) {
              reply = `Não foi possível liberar o contrato *#${contratoId}*.\n\n${resultado?.msg || resultado?.erro || 'Entre em contato com o suporte.'} 😔\n\nPrecisa de mais alguma coisa?`;
            } else {
              const proto = resultado.protocolo ? `\n📋 Protocolo: *${resultado.protocolo}*` : "";
              const dias = resultado.liberado_dias ? `${resultado.liberado_dias} dia(s)` : "3 dias";
              const dataProm = resultado.data_promessa || "";
              reply = `✅ Contrato *#${contratoId}* liberado por *${dias}*!${proto}\n\n📅 Promessa até: *${dataProm}*\n⏱️ Conexão restabelecida em até 15 minutos.\n\n⚠️ Lembre-se de efetuar o pagamento até a data da promessa para evitar novo bloqueio.\n\nPrecisa de mais alguma coisa? 😊`;
            }
          } catch (e) {
            logger.warn(`⚠️ promessa_pagamento erro: ${e.message}`);
            reply = "Não consegui processar a liberação. Tente novamente em instantes. 🙏";
          }
        } else {
          reply = `O contrato *#${contratoId}* está com status *${statusContrato}*. A liberação por promessa só está disponível para contratos *suspensos* ou com *velocidade reduzida*.\n\nDeseja falar com um atendente? 👤`;
        }
      }
    }

    // 📋 MEUS DADOS
    else if (content.includes("Meus dados") || lower.includes("meus dados") || lower.includes("meu plano") || lower.includes("meu contrato")) {
      const c = sess.contratos?.find(ct => String(ct.id) === sess.contrato_ativo) || sess.contratos?.[0];
      if (c) {
        // Verifica status de conexão em tempo real
        let conexao = "—";
        try {
          const st = await executeTool("verificar_conexao", { contrato: String(c.id) });
          conexao = st?.online ? "🟢 Online" : `🔴 Offline — ${st?.msg || ''}`;
        } catch {}
        reply = `📋 *Seus dados — Contrato #${c.id}*\n\n👤 *${sess.nome}*\n📡 Plano: *${c.plano || '—'}*\n📍 Endereço: ${c.end || '—'}\n📊 Status contrato: ${c.status || '—'}\n📶 Conexão: ${conexao}\n🚀 Velocidade: ${c.velocidade || '—'}\n📅 Vencimento: ${c.venc_dia || '—'}`;
      } else {
        reply = "Não encontrei dados do contrato. Tente novamente. 🤔";
      }
    }

    // 🛒 MUDAR DE PLANO (comercial)
    else if (content.includes("Mudar de plano") || lower.includes("mudar plano") || lower.includes("upgrade") || lower.includes("trocar plano") || info.intencao === "comercial") {
      sess._agente = "comercial";
      novaEstado = "atendimento";
      const ia = await iaConversa("comercial", "Quero mudar meu plano de internet", history, sess);
      reply = ia.text || "Vou te ajudar a mudar de plano! Qual velocidade te interessa? 📡";
    }

    // 🔧 SUPORTE — código diagnostica, IA conversa com contexto
    else if (content.includes("Suporte") || content.includes("suporte_tec") ||
      lower.includes("suporte") || lower.includes("internet caiu") ||
      lower.includes("sem internet") || lower.includes("sem sinal") ||
      lower.includes("internet lenta") || lower.includes("caiu a internet") ||
      lower.includes("net caiu") || lower.includes("tá caída") || lower.includes("ta caida") ||
      lower.includes("não tá funcionando") || lower.includes("nao ta funcionando") ||
      lower.includes("não funciona") || lower.includes("nao funciona") ||
      lower.includes("offline") || lower.includes("fora do ar") ||
      lower.includes("lentidão") || lower.includes("lentidao") ||
      lower.includes("travando") || lower.includes("caindo") ||
      info.intencao === "suporte") {
      sess._agente = "suporte";
      const contratoId = sess.contrato_ativo || (sess.contratos?.length === 1 ? String(sess.contratos[0].id) : null);

      if (!contratoId) {
        reply = "Qual o número do seu contrato? 📋";
        novaEstado = "atendimento";
      } else {
        // Primeiro: verifica manutenção na cidade do cliente
        let conexao = null, manutencao = null;
        try { conexao = await executeTool("verificar_conexao", { contrato: contratoId }); } catch {}
        try { manutencao = await executeTool("consultar_manutencao", {}); } catch {}

        // Pega cidade do cliente do contrato
        const contCliente = sess.contratos?.find(ct => String(ct.id) === String(contratoId));
        // Match por popId (exato) + cidade (fallback)
        const { verificarManutencaoCliente } = await import("./services/erp.js");
        const manRegiao = await verificarManutencaoCliente({
          popId: contCliente?.popId,
          cidade: contCliente?.cidade,
        }).catch(() => ({ temManutencao: false }));

        if (manRegiao.temManutencao) {
          // IA humaniza a mensagem do SGP em vez de mandar crua
          const prevText = manRegiao.previsao ? `Previsão de normalização: ${manRegiao.previsao}.` : "";
          const promptMan = `Reescreva esta mensagem de manutenção de rede de forma empática, profissional e humanizada para o cliente ${sess.nome || ""}. Mantenha todas as informações. Adicione emojis com moderação. Não ultrapasse 3 parágrafos curtos. NÃO mencione abertura de chamado ou protocolo. Ao final, informe que a equipe já está resolvendo e pergunte se pode ajudar com mais alguma coisa.\n\nMensagem original: ${manRegiao.mensagem}\n${prevText}`;
          try {
            const iaMan = await iaConversa("suporte", promptMan, [], sess);
            reply = iaMan.text || `${manRegiao.mensagem}${manRegiao.previsao ? "\n\n⏱️ Previsão: *" + manRegiao.previsao + "*" : ""}\n\nNossa equipe já está trabalhando! 🙏`;
          } catch {
            reply = `${manRegiao.mensagem}${manRegiao.previsao ? "\n\n⏱️ Previsão: *" + manRegiao.previsao + "*" : ""}\n\nNossa equipe já está trabalhando! 🙏`;
          }
          novaEstado = "atendimento";
        } else {

        const isOnline = conexao?.online === true;
        const temManutencao = manutencao?.ativa === true || manutencao?.em_manutencao === true;
        const previsaoMan = manutencao?.previsao || 'sem previsão';
        const msgManutencao = manutencao?.mensagemCentral || manutencao?.titulo || 'Manutenção ativa';

        // Monta contexto do diagnóstico pra IA
        const diagnostico = `[DIAGNÓSTICO AUTOMÁTICO DO SISTEMA]
Contrato: ${contratoId}
Conexão: ${isOnline ? 'ONLINE' : 'OFFLINE'}
Manutenção na rede: ${temManutencao ? 'SIM\nMensagem: ' + msgManutencao + '\nPrevisão: ' + previsaoMan : 'NÃO'}
Cidades afetadas: ${temManutencao && manutencao?.cidadesAfetadas?.length ? manutencao.cidadesAfetadas.join(', ') : 'N/A'}
${conexao?.velocidade ? 'Velocidade: ' + conexao.velocidade : ''}
${conexao?.sinal ? 'Sinal: ' + conexao.sinal : ''}
${temManutencao ? '⚠️ INSTRUÇÃO IMPORTANTE: Use EXATAMENTE a mensagem de manutenção acima para informar o cliente. NÃO abra chamado técnico.' : 'Se não conseguir resolver, abra um chamado com criar_chamado.'}

O cliente selecionou "Suporte técnico". Com base no diagnóstico, inicie a conversa explicando o status.`;

        // IA conversa com contexto rico
        const ia = await iaConversa("suporte", diagnostico, history, sess);
        reply = ia.text || (isOnline
          ? "Sua conexão aparece online! O que exatamente tá acontecendo? 🔧"
          : "Sua conexão está offline. Vamos tentar resolver! 🔧");
        novaEstado = "atendimento";
      }
    }

        } // fecha else (sem manutenção na região)
    // 👤 FALAR COM ATENDENTE
    else if (content.includes("Falar com atendente") || lower.includes("atendente") || lower.includes("humano")) {
      // Verifica manutenção antes de transferir
      const contCliente2 = sess.contratos?.find(ct => String(ct.id) === String(sess.contrato_ativo)) || sess.contratos?.[0];
      // Match por popId (exato) + cidade (fallback)
      const { verificarManutencaoCliente } = await import("./services/erp.js");
      const manRegiao2 = await verificarManutencaoCliente({
        popId: contCliente2?.popId,
        cidade: contCliente2?.cidade,
      }).catch(() => ({ temManutencao: false }));

      if (manRegiao2.temManutencao) {
        const prevText2 = manRegiao2.previsao ? `Previsão de normalização: ${manRegiao2.previsao}.` : "";
        const promptMan2 = `Reescreva esta mensagem de manutenção de forma empática e profissional para o cliente ${sess.nome || ""}. Mantenha todas as informações. Adicione emojis com moderação. NÃO mencione abertura de chamado ou protocolo — a equipe já está resolvendo. Ao final, pergunte apenas se pode ajudar com mais alguma coisa.\n\nMensagem: ${manRegiao2.mensagem}\n${prevText2}`;
        try {
          const iaMan2 = await iaConversa("suporte", promptMan2, [], sess);
          reply = iaMan2.text || `${manRegiao2.mensagem}\n\nNossa equipe já está trabalhando! Posso te ajudar com mais alguma coisa? 😊`;
        } catch {
          reply = `${manRegiao2.mensagem}\n\nNossa equipe já está trabalhando! Posso te ajudar com mais alguma coisa? 😊`;
        }
        novaEstado = "atendimento";
      } else {
        const { transferirParaHumano } = await import("./services/handoff.js");
        await transferirParaHumano(conversationId, null, "Solicitado pelo cliente").catch(() => {});
        reply = "Certo! Vou te transferir para um atendente humano. Aguarde um momento! 🙏";
        novaEstado = "atendimento";
      }
    }

    // ❌ ENCERRAR
    else if (content.includes("Encerrar") || content.includes("encerrar") || lower.includes("encerrar") || info.intencao === "encerrar"
      || /^(s[oó] isso|era isso|[eé] s[oó]|t[aá] bom|valeu|obrigad|tchau|falou|at[eé]|brigad)/i.test(lower)) {
      reply = "Foi um prazer te atender! 😊 Qualquer coisa é só chamar!";
      novaEstado = "inicio";
      sess._cadastro = null;
    }

    // Saudação
    else if (info.intencao === "saudacao") {
      const nome = sess.nome?.split(' ')[0] || "cliente";
      await enviarMenuPrincipal(telefone, `Olá, ${nome}! Como posso te ajudar?`, conversationId);
      reply = "";
    }

    // Texto livre → IA interpreta
    else {
      sess._agente = "outros";
      const ia = await iaConversa("outros", content, history, sess);
      reply = ia.text || "Não entendi. Posso te ajudar com boleto, suporte ou outro assunto?";
    }
  }

  // ── ESTADO: AGUARDANDO CONTRATO (lista enviada, esperando seleção) ──
  else if (estado === "aguardando_contrato") {
    const info = await classificar(content);
    
    // Extrair ID do contrato de forma segura:
    // 1. Se veio [id:5] do webhook → usa direto
    // 2. Se veio só número (digitado) → usa direto
    // 3. Se veio "Contrato 5" → extrai após "Contrato"
    // 4. Fallback: classificador IA
    let contratoId = null;
    const idTag = content.match(/\[id:(\d+)\]/);
    if (idTag) {
      contratoId = idTag[1]; // [id:5] → "5"
    } else {
      const cleanNum = content.trim().replace(/^#/, '');
      if (/^\d{1,6}$/.test(cleanNum)) {
        contratoId = cleanNum;
      } else {
        const match = content.match(/contrato\s*#?(\d{1,6})/i);
        if (match) contratoId = match[1];
      }
    }
    if (!contratoId && info.contrato) contratoId = String(info.contrato);

    if (contratoId && sess.contratos?.find(c => String(c.id) === contratoId)) {
      sess.contrato_ativo = contratoId;
      const c = sess.contratos.find(ct => String(ct.id) === contratoId);
      const descr = c?.end || c?.plano || '';

      // Se tinha intenção pendente
      if (sess._intencao_pendente === "boleto") {
        sess._intencao_pendente = null;
        return await resolverBoleto(sess, history, content, telefone, conversationId, accountId, t0);
      } else if (sess._intencao_pendente === "pagamento") {
        sess._intencao_pendente = null;
        const contrato = sess.contratos?.find(c => String(c.id) === contratoId);
        const st = (contrato?.status || "").toLowerCase();
        if (st === "ativo") {
          reply = `Contrato *#${contratoId}* já está *ativo*! 😊 Não precisa liberar.`;
        } else if (st === "suspenso" || st === "reduzido" || st === "ativo vel. reduzida") {
          try {
            const resultado = await executeTool("promessa_pagamento", { contrato: contratoId });
            if (resultado?.erro || !resultado?.liberado) {
              reply = `Não foi possível liberar: ${resultado?.msg || resultado?.erro || 'erro'} 😔`;
            } else {
              const proto = resultado.protocolo ? `\n📋 Protocolo: *${resultado.protocolo}*` : "";
              reply = `✅ Contrato *#${contratoId}* liberado por *${resultado.liberado_dias || 3} dia(s)*!${proto}\n\n📅 Promessa até: *${resultado.data_promessa}*\n⏱️ Conexão em até 15 minutos.\n\n⚠️ Efetue o pagamento até a data da promessa.`;
            }
          } catch { reply = "Não consegui processar. Tente novamente. 🙏"; }
        } else {
          reply = `Contrato *#${contratoId}* está *${st}*. Liberação só disponível para suspensos/reduzidos.`;
        }
        novaEstado = "identificado";
      } else {
        // Senão mostra menu
        reply = `Contrato *#${contratoId}* selecionado${descr ? ` — ${descr}` : ''} ✅`;
        await enviarMenuPrincipal(telefone, reply + "\n\nComo posso te ajudar?", conversationId);
        reply = "";
        novaEstado = "identificado";
      }
    } else if (info.intencao === "encerrar") {
      reply = "Tudo bem! Qualquer coisa é só chamar. 😊";
      novaEstado = "inicio";
    } else {
      reply = "Não identifiquei o contrato. Selecione na lista acima 👆 ou digite o número.";
    }
  }

  // ── ESTADO: SUPORTE AGUARDANDO (resolveu ou não?) ──
  else if (estado === "suporte_aguardando") {
    const lower = content.toLowerCase().trim();
    const resolveu = content.includes("Resolveu") || content.includes("Voltou") || content.includes("suporte_resolveu")
      || /^(sim|resolveu|voltou|funcionou|ok|beleza|top)$/i.test(lower);
    const naoResolveu = content.includes("Não resolveu") || content.includes("Não voltou") || content.includes("suporte_nao_resolveu")
      || /n[ãa]o|mesmo jeito|nada|piorou|continua|ainda/i.test(lower);

    if (resolveu) {
      reply = "Que bom que resolveu! 😊 Precisando é só chamar!";
      novaEstado = "inicio";
    } else if (naoResolveu) {
      // Abre chamado direto via código
      const contratoId = sess.contrato_ativo || (sess.contratos?.length === 1 ? String(sess.contratos[0].id) : null);
      if (contratoId) {
        try {
          // Verifica manutenção antes de abrir chamado
          const manutSup = await executeTool("consultar_manutencao", {}).catch(() => null);
          const temManSup = manutSup?.ativa === true || manutSup?.em_manutencao === true;
          if (temManSup) {
            const prevSup = manutSup?.previsao || manutSup?.prazo || "em breve";
            reply = `Identificamos uma manutenção em andamento que pode estar causando o problema. 🔧\n\nPrevisão: *${prevSup}*\n\nNossa equipe já está trabalhando! 🙏`;
          } else {
            const resultado = await executeTool("criar_chamado", {
              contrato: contratoId,
              ocorrenciatipo: "200",
              conteudo: "Internet offline — reinício do roteador não resolveu. Cliente solicita visita técnica.",
              contato_nome: sess.nome || "",
              contato_telefone: sess._telefone || "",
            });
            const proto = resultado?.protocolo || resultado?.numero_chamado || resultado?.os_id || '';
            if (proto) {
              reply = `Chamado aberto! 📋 Protocolo: *${proto}*\n\nNossa equipe técnica vai analisar e retornar em até *24 horas*.\n\nPrecisando de algo mais? 😊`;
              // Notifica técnicos sobre novo chamado
              import("./services/notif-agentes.js").then(({ notificarTecnicosChamado }) =>
                notificarTecnicosChamado({ protocolo: proto, nome: sess.nome, telefone, contrato: contratoId, tipo: "Reparo/Visita técnica", conteudo: "Internet offline — reinício não resolveu" }).catch(() => {})
              ).catch(() => {});
            } else {
              reply = `Chamado registrado! 📋\n\nNossa equipe vai entrar em contato em até *24 horas*.\n\nPrecisando de algo mais? 😊`;
            }
          } // fecha else (sem manutenção)
        } catch (e) {
          logger.warn(`⚠️ criar_chamado erro: ${e.message}`);
          reply = "Não consegui abrir o chamado automaticamente. Vou te transferir pra um atendente. 🙏";
          const { transferirParaHumano } = await import("./services/handoff.js");
          await transferirParaHumano(conversationId, null, `Suporte: criar_chamado falhou - ${e.message}`).catch(() => {});
        }
      } else {
        reply = "Vou te transferir pro suporte técnico pra abrir o chamado. 🙏";
        const { transferirParaHumano } = await import("./services/handoff.js");
        await transferirParaHumano(conversationId, null, "Suporte: sem contrato para chamado").catch(() => {});
      }
      novaEstado = "identificado";
    } else {
      // Mensagem não reconhecida — reenvia botões
      await _enviarBotoes(telefone, "O problema foi resolvido?", [
        { id: "suporte_resolveu", title: "✅ Resolveu!" },
        { id: "suporte_nao_resolveu", title: "❌ Não resolveu" },
      ]);
      reply = "";
    }
  }

  // ── ESTADO: ATENDIMENTO (IA conversa livre) ──
  else if (estado === "atendimento") {
    const lower = content.toLowerCase().trim();
    const info = await classificar(content);

    // Cliente insatisfeito / problema não resolveu — abre chamado direto
    const naoResolveu = /n[ãa]o (resolveu|funcionou|voltou|melhorou)|mesmo jeito|continua (sem|off|caindo|lento)|ainda (sem|off|n[ãa]o)|piorou|nada mudou|n[ãa]o adiantou/i.test(lower);
    if (naoResolveu && (sess._agente === "suporte" || sess._agente === "outros")) {
      // Redireciona pro estado suporte_aguardando com resposta "não"
      const contratoId = sess.contrato_ativo || (sess.contratos?.length === 1 ? String(sess.contratos[0].id) : null);
      if (contratoId) {
        try {
          // Verifica manutenção antes de abrir chamado (usa cache — sem custo extra)
          const manutCheck = await executeTool("consultar_manutencao", {}).catch(() => null);
          const temMan = manutCheck?.ativa === true || manutCheck?.em_manutencao === true;
          if (temMan) {
            const prev = manutCheck?.previsao || manutCheck?.prazo || "em breve";
            reply = `Identificamos uma manutenção em andamento na rede que pode estar afetando sua conexão. 🔧\n\nPrevisão de normalização: *${prev}*\n\nNossa equipe já está trabalhando! Pedimos desculpas pelo inconveniente. 🙏`;
          } else {
            const resultado = await executeTool("criar_chamado", {
              contrato: contratoId,
              ocorrenciatipo: "200",
              conteudo: "Internet com problema — cliente reportou que reinício não resolveu.",
              contato_nome: sess.nome || "",
              contato_telefone: sess._telefone || "",
            });
            const proto = resultado?.protocolo || resultado?.numero_chamado || resultado?.os_id || '';
            reply = proto
              ? `Chamado aberto! 📋 Protocolo: *${proto}*\n\nNossa equipe vai analisar em até *24h*. 😊`
              : `Chamado registrado! Nossa equipe vai entrar em contato em até *24h*. 😊`;
          }
        } catch {
          reply = "Vou te transferir pro suporte técnico. 🙏";
          const { transferirParaHumano } = await import("./services/handoff.js");
          await transferirParaHumano(conversationId, null, "Suporte: chamado falhou").catch(() => {});
        }
      } else {
        sess._agente = "suporte";
        const ia = await iaConversa("suporte", content, history, sess);
        reply = ia.text || "Vou abrir um chamado técnico. Qual o número do contrato?";
      }
      novaEstado = "identificado";
    }
    // Se mudar de assunto pra boleto
    else if (info.intencao === "boleto" && sess._agente !== "financeiro") {
      return await resolverBoleto(sess, history, content, telefone, conversationId, accountId, t0);
    }
    // Encerrar — mas só se não tiver problema pendente
    else if (!naoResolveu && (info.intencao === "encerrar" || /^(s[oó] isso|era isso|[eé] s[oó]|t[aá] bom|valeu|obrigad|tchau|falou|at[eé]|brigad)/i.test(lower))) {
      reply = "Foi um prazer te atender! 😊 Qualquer coisa é só chamar!";
      novaEstado = "inicio";
      // Limpa sessão para próximo atendimento começar do zero
      sess.cpfcnpj = null;
      sess.nome = null;
      sess.contratos = null;
      sess.contrato_ativo = null;
      sess._protocolo = null;
      sess._cadastro = null;
      sess._intencao_pendente = null;
      sess._resetado = true;
    } else {
      const ia = await iaConversa(sess._agente || "outros", content, history, sess);
      reply = ia.text || "Como posso ajudar? 😊";
      if (ia.handoff) {
        const { transferirParaHumano } = await import("./services/handoff.js");
        await transferirParaHumano(conversationId, null, `Agente: ${sess._agente}`).catch(() => {});
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // COBERTURA — Verifica antes de iniciar fluxo comercial
  // ══════════════════════════════════════════════════════════════════

  // ── ESCAPE UNIVERSAL DOS ESTADOS COMERCIAIS ──
  // Detecta intenção de saída em qualquer estado comercial
  else if (estado.startsWith("comercial_") && (
    /^(\/sair|\/cancelar|sair|encerre|encerrar|cancelar|desistir|não quero|nao quero|para|parar|chega|esquece|esqueceu|voltar|menu|inicio|começo|recomeçar)/i.test(content.trim())
    || content.trim() === "0"
  )) {
    sess._cadastro = null;
    sess._sugestoes_endereco = null;
    reply = "Tudo bem! Cancelei o cadastro em andamento. 😊\n\nPosso te ajudar com mais alguma coisa?";
    novaEstado = "inicio";
    await enviarMenuPrincipal(telefone, reply, conversationId).catch(() => {});
    reply = "";
  }

  // Saudação no meio do fluxo comercial — pergunta se quer continuar
  else if (estado.startsWith("comercial_") && estado !== "comercial_confirmar" && (
    /^(oi|olá|ola|hey|hello|bom dia|boa tarde|boa noite|oii)/i.test(content.trim())
  )) {
    const etapa = {
      comercial_cep: "verificação de endereço",
      comercial_tipo: "tipo de instalação",
      comercial_plano: "escolha do plano",
      comercial_nome: "dados pessoais",
      comercial_cpf: "dados pessoais",
      comercial_nascimento: "dados pessoais",
      comercial_celular: "dados pessoais",
      comercial_email: "dados pessoais",
      comercial_logradouro: "endereço",
      comercial_numero: "endereço",
      comercial_complemento: "endereço",
      comercial_bairro: "endereço",
      comercial_referencia: "endereço",
      comercial_vencimento: "vencimento",
    }[estado] || "cadastro";
    await _enviarBotoes(telefone,
      `Olá! 😊 Você está no meio de um cadastro (etapa: *${etapa}*).\n\nDeseja continuar?`,
      [{ id: "continuar_cadastro", title: "✅ Continuar" }, { id: "cancelar_cadastro_escape", title: "❌ Cancelar" }]
    );
    reply = "";
    // Mantém estado atual para continuar depois
  }

  // Resposta aos botões de escape
  else if (estado.startsWith("comercial_") && content === "continuar_cadastro") {
    reply = "Ótimo! Continuando... 😊";
    // estado permanece o mesmo
    novaEstado = estado;
  }

  else if (content === "cancelar_cadastro_escape") {
    sess._cadastro = null;
    sess._sugestoes_endereco = null;
    reply = "Cadastro cancelado. Se mudar de ideia é só chamar! 😊";
    novaEstado = "inicio";
  }

  // ── ESTADO: aguardando CEP ou endereço ──
  else if (estado === "comercial_cep") {
    const clean = content.replace(/\D/g, "");
    let resultado = null;
    let enderecoStr = "";
    // Localização GPS — usa coordenadas direto
    const gpsMatch = content.match(/\[localizacao:([\d.-]+),([\d.-]+)/);
    if (gpsMatch) {
      try {
        const lat = parseFloat(gpsMatch[1]), lon = parseFloat(gpsMatch[2]);
        const { verificarCobertura, localizarEndereco } = await import("./services/erp.js");
        const [cobr, end] = await Promise.all([
          verificarCobertura(lat, lon).catch(() => null),
          localizarEndereco(lat, lon).catch(() => null),
        ]);
        sess._cadastro = sess._cadastro || {};
        sess._cadastro._lat = lat; sess._cadastro._lng = lon; sess._cadastro._map_ll = `${lat},${lon}`;
        const addr = end?.address || {};
        const e = {
          logradouro: addr.road || addr.pedestrian || addr.footway || "",
          bairro: addr.suburb || addr.neighbourhood || addr.quarter || "",
          cidade: addr.city || addr.town || addr.village || "",
          cep: addr.postcode || "",
        };
        if (e.logradouro) sess._cadastro.logradouro = e.logradouro;
        if (e.bairro) sess._cadastro.bairro = e.bairro;
        if (cobr) {
          resultado = { cobertura: cobr.cobertura ?? cobr.viavel ?? true, enderecoResolvido: e,
            cidade_id: cobr.cidade_id, cidade: cobr.cidade || e.cidade, zona: cobr.zona, planos: cobr.planos };
          enderecoStr = [e.logradouro, e.bairro, e.cidade].filter(Boolean).join(", ");
        }
      } catch(ex) { logger.warn("⚠️ GPS cobertura: " + ex.message); }
    }

    // Se GPS já resolveu o resultado, pula a busca por CEP/endereço
    try {
      if (resultado) {
        // GPS já resolveu — não sobrescreve com CEP/endereço
      } else {

      const { consultarPorCEP, consultarPorEndereco } = await import("./services/cobertura.js");

      // CEP detectado
      if (/^\d{8}$/.test(clean) || /^\d{5}-\d{3}$/.test(content.trim())) {
        resultado = await consultarPorCEP(clean.slice(0,8), telefone);
        if (resultado?.enderecoResolvido) {
          const e = resultado.enderecoResolvido;
          enderecoStr = `${e.logradouro ? e.logradouro + ', ' : ''}${e.bairro ? e.bairro + ' — ' : ''}${e.cidade || ''}`;
        }
      }
      // Endereço digitado (mínimo 10 chars)
      else if (content.trim().length >= 10) {
        resultado = await consultarPorEndereco(content.trim(), telefone);
        if (resultado?.precisaConfirmar && resultado.sugestoes?.length > 0) {
          sess._sugestoes_endereco = resultado.sugestoes;
          const normMsg = resultado.textoNormalizado
            ? `\n💡 Endereço corrigido: *${resultado.textoNormalizado}*` : "";
          if (resultado.sugestoes.length === 1) {
            // Uma opção — mostra e pede confirmação simples
            const s = resultado.sugestoes[0];
            const endFormatado = [s.logradouro || s.endereco?.split(",")[0], s.bairro, s.cidade].filter(Boolean).join(", ");
            await _enviarBotoes(telefone,
              `Encontrei este endereço:${normMsg}\n\n📍 *${endFormatado}*\n\nEsse é o endereço correto?`,
              [{ id: "end_0", title: "✅ Sim, é esse" }, { id: "end_outro", title: "❌ Não, digitar outro" }]
            );
          } else {
            // Múltiplas opções — lista para escolher
            const rows = resultado.sugestoes.slice(0, 3).map((s, i) => ({
              id: `end_${i}`,
              title: ([s.logradouro || s.endereco?.split(",")[0], s.bairro].filter(Boolean).join(" - ") || `Opção ${i+1}`).slice(0, 24),
            }));
            await _enviarLista(telefone,
              `Encontrei esses endereços:${normMsg}\n\nQual é o seu? 📍`,
              "Ver opções", [{ title: "Endereços encontrados", rows }]
            );
          }
          reply = "";
          novaEstado = "comercial_cep_confirm";
          // Salva estado já
          // salva sessão via salvarSessao normal
          try { const { salvarSessao } = await import("./services/memoria.js"); await salvarSessao(telefone, { ...sess, _estado: novaEstado }, tenantId); } catch {}
          break_flag = true;
        } else if (resultado?.enderecoResolvido) {
          const e = resultado.enderecoResolvido;
          enderecoStr = e.endereco?.slice(0, 60) || content.trim();
        }
      } else {
        // Muito curto — pede de novo
        reply = "Não consegui identificar. Por favor, digite o *CEP* (ex: 59064-625) ou o *endereço completo* com bairro e cidade:";
        novaEstado = "comercial_cep";
      }
      } // fecha else (GPS não resolveu)
    } catch(e) {
      logger.warn("⚠️ Cobertura CEP/endereço: " + e.message);
    }

    if (!break_flag && resultado) {
      if (resultado.cobertura) {
        // ✅ TEM COBERTURA
        sess._cadastro = sess._cadastro || {};
        sess._cadastro._cobertura_ok = true;
        if (resultado.cidade_id) sess._cadastro._cidade_id_cobertura = resultado.cidade_id;
        if (resultado.cidade) sess._cadastro._cidade_cobertura = resultado.cidade;
        // Salva coordenadas para map_ll no cadastro
        if (resultado.enderecoResolvido?.lat) {
          sess._cadastro._lat = resultado.enderecoResolvido.lat;
          sess._cadastro._lng = resultado.enderecoResolvido.lng;
          sess._cadastro._map_ll = `${resultado.enderecoResolvido.lat},${resultado.enderecoResolvido.lng}`;
        }

        const zona = resultado.zona;
        const planos = resultado.planos || [];
        const planosStr = planos.length > 0
          ? "\n\n📡 Planos disponíveis na sua região:\n" + planos.map(p => `• *${p.nome}* — ${p.velocidade} Mega — R$ ${parseFloat(p.valor||0).toFixed(2).replace(".",",")}${p.unidade==="Giga"?"G":"M"}/mês`).join("\n")
          : "";

        const endMsg = enderecoStr ? `\n📍 ${enderecoStr}` : "";
        reply = `✅ *Boa notícia!* Temos cobertura na sua região! 🎉${endMsg}${zonaStr(zona)}${planosStr}\n\nPode prosseguir com o cadastro. É para uso residencial ou empresarial?`;

        await _enviarBotoes(telefone, reply, [
          { id: "residencial", title: "🏠 Residencial" },
          { id: "empresarial", title: "🏢 Empresarial" },
        ]);
        reply = "";
        novaEstado = "comercial_tipo";
      } else if (resultado.erro) {
        // Não conseguiu geocodificar — sugere CEP
        const dicaCEP = resultado.sugerirCEP
          ? "\n\n💡 *Dica:* O CEP é o jeito mais preciso! Ex: *59064-625*"
          : "";
        reply = `Hmm, não consegui localizar esse endereço com precisão. 🤔${dicaCEP}\n\nTenta novamente com o *CEP* ou o endereço mais completo (rua, número, bairro, Natal):`;
        novaEstado = "comercial_cep";
      } else {
        // ❌ SEM COBERTURA
        const prox = resultado.zonaMaisProxima;
        const proxMsg = prox ? `\n\nA região de cobertura mais próxima fica a ~*${prox.distanciaKm}km* daqui (${prox.nome}).` : "";
        // Se resultado veio de fora da área RN, sugere confirmar com CEP
        const foraMsg = resultado.avisoForaArea
          ? "\n\n🔎 Não localizei esse endereço em Natal/RN. Se você está em Natal, tente informar o *CEP* para maior precisão."
          : "";
        reply = `😔 Ainda não temos cobertura nesse endereço.${enderecoStr ? "\n📍 " + enderecoStr : ""}${proxMsg}${foraMsg}\n\nMas estamos expandindo! Gostaria de entrar na *lista de espera*? 📋`;

        await _enviarBotoes(telefone, reply, [
          { id: "lista_espera_sim", title: "✅ Quero entrar na lista" },
          { id: "lista_espera_nao", title: "❌ Não, obrigado" },
        ]);
        reply = "";
        novaEstado = "identificado"; // volta ao início
      }
    } else if (!break_flag && !resultado && content.trim().length >= 10) {
      // Não conseguiu resultado — segue sem verificação
      reply = "Não consegui verificar a cobertura automaticamente. Qual cidade você está? 📍";
      novaEstado = "comercial_cidade";
    }
  }

  // ── ESTADO: confirmar endereço (múltiplas sugestões) ──
  else if (estado === "comercial_cep_confirm") {
    const sugestoes = sess._sugestoes_endereco || [];
    const match = content.match(/^end_(\d+)$/);
    let escolhida = null;

    if (match) {
      escolhida = sugestoes[parseInt(match[1])];
    } else {
      // Tenta por texto
      escolhida = sugestoes.find(s => content.toLowerCase().includes(s.bairro?.toLowerCase() || "xxx"));
    }

    if (escolhida) {
      try {
        const { verificarCobertura } = await import("./services/cobertura.js");
        const resultado = await verificarCobertura(escolhida.lat, escolhida.lng);
        if (resultado.cobertura) {
          sess._cadastro = sess._cadastro || {};
          sess._cadastro._cobertura_ok = true;
          if (resultado.cidade_id) sess._cadastro._cidade_id_cobertura = resultado.cidade_id;
          // Salva coordenadas do endereço confirmado para map_ll
          sess._cadastro._lat = escolhida.lat;
          sess._cadastro._lng = escolhida.lng;
          sess._cadastro._map_ll = `${escolhida.lat},${escolhida.lng}`;
          const planos = resultado.planos || [];
          const planosStr = planos.length > 0 ? "\n\n📡 " + planos.map(p => `*${p.nome}* ${p.velocidade}M`).join(" · ") : "";
          reply = `✅ Cobertura confirmada!${zonaStr(resultado.zona)}${planosStr}\n\nPode prosseguir. É para residencial ou empresarial?`;
          await _enviarBotoes(telefone, reply, [
            { id: "residencial", title: "🏠 Residencial" },
            { id: "empresarial", title: "🏢 Empresarial" },
          ]);
          reply = "";
          novaEstado = "comercial_tipo";
        } else {
          reply = `😔 Sem cobertura nesse endereço ainda.\n\nDeseja entrar na lista de espera?`;
          await _enviarBotoes(telefone, reply, [
            { id: "lista_espera_sim", title: "✅ Lista de espera" },
            { id: "lista_espera_nao", title: "❌ Não" },
          ]);
          reply = "";
          novaEstado = "identificado";
        }
      } catch { novaEstado = "comercial_cidade"; reply = "Qual cidade você está? 📍"; }
    } else {
      reply = "Selecione nas opções acima ou tente digitar o CEP diretamente (ex: 59064625):";
      novaEstado = "comercial_cep";
      sess._sugestoes_endereco = null;
    }
  }

  // ── LISTA DE ESPERA ──
  else if (content.includes("lista_espera_sim") || content.includes("Quero entrar na lista")) {
    try {
      const { query: dbQ } = await import("./services/db.js");
      await dbQ(
        `INSERT INTO consultas_cobertura(telefone, endereco, resultado) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
        [telefone, sess._cadastro?._endereco_sem_cobertura || "sem endereço", "lista_espera"]
      ).catch(()=>{});
    } catch {}
    reply = "✅ Anotado! Você está na lista de espera. Assim que chegarmos na sua região, você será um dos primeiros a saber! 🚀\n\nQualquer coisa é só chamar!";
    novaEstado = "inicio";
  }

  // ══════════════════════════════════════════════════════════════════
  // FLUXO COMERCIAL — Novo cliente (todo código, zero IA)
  // ══════════════════════════════════════════════════════════════════

  // ── TIPO: Residencial ou Empresarial ──
  else if (estado === "comercial_tipo") {
    const lower = content.toLowerCase();
    // Detecta residencial: inclui variações de áudio transcrito
    const isResidencial = content.includes("Residencial") || content.includes("residencial")
      || lower.includes("casa") || lower.includes("resid") || lower.includes("apartamento")
      || lower.includes("minha casa") || lower.includes("meu apto") || lower.includes("moradia")
      || /^(1|resid|casa|apto|apartamento)$/i.test(lower.trim());
    // Detecta empresarial
    const isEmpresarial = content.includes("Empresarial") || content.includes("empresarial")
      || lower.includes("empresa") || lower.includes("comercial") || lower.includes("neg[oó]cio")
      || lower.includes("escritório") || lower.includes("loja") || lower.includes("consultório")
      || /^(2|empresa|comercial|negocio)$/i.test(lower.trim());
    if (isResidencial) {
      sess._cadastro = sess._cadastro || {};
      sess._cadastro.tipo = "residencial";

      // Se já tem cidade da verificação de cobertura → pula direto para planos
      if (sess._cadastro._cidade_id_cobertura) {
        sess._cadastro.cidade = sess._cadastro._cidade_cobertura;
        sess._cadastro.cidade_id = sess._cadastro._cidade_id_cobertura;
        // Busca pop_id e portador_id da cidade no banco
        try {
          const { query: dbQ } = await import("./services/db.js");
          const cidRow = await dbQ(`SELECT pop_id, portador_id FROM cidades WHERE id=$1 LIMIT 1`, [sess._cadastro._cidade_id_cobertura]);
          if (cidRow.rows[0]) {
            sess._cadastro.pop_id = cidRow.rows[0].pop_id;
            sess._cadastro.portador_id = cidRow.rows[0].portador_id;
          }
        } catch {}
        novaEstado = "comercial_plano";
        // Mostra planos da cidade
        try {
          const { query: dbQ2 } = await import("./services/db.js");
          const planos = await dbQ2(`SELECT id,nome,velocidade,valor FROM planos WHERE cidade_id=$1 AND ativo=true ORDER BY valor`, [sess._cadastro._cidade_id_cobertura]);
          if (planos.rows.length) {
            const rows = planos.rows.map(p => ({ id: String(p.id), title: `${p.nome} — ${p.velocidade}M — R$ ${parseFloat(p.valor).toFixed(2).replace('.',',')}` }));
            await _enviarLista(telefone, `📡 Planos disponíveis em *${sess._cadastro.cidade}*:`, "Ver planos", [{ title: "Planos", rows }]);
            reply = "";
          } else {
            reply = `📡 Qual plano deseja em *${sess._cadastro.cidade}*? Me conta o que precisa de velocidade e te indico o melhor! 😊`;
          }
        } catch {
          reply = `📡 Qual plano deseja em *${sess._cadastro.cidade}*?`;
        }
      } else {
        // Sem cidade ainda → pergunta
        try {
          const { query: dbQ } = await import("./services/db.js");
          const r = await dbQ(`SELECT id,nome FROM cidades WHERE ativo=true ORDER BY ordem`);
          const cids = r.rows || [];
          if (cids.length > 0) {
            const rows = cids.map(c => ({ id: String(c.id), title: c.nome }));
            await _enviarLista(telefone, "Em qual cidade será a instalação? 📍", "Ver cidades", [{ title: "Cidades atendidas", rows }]);
            reply = "";
          } else {
            reply = "Em qual cidade será a instalação? 📍";
          }
        } catch { reply = "Em qual cidade será a instalação? 📍"; }
        novaEstado = "comercial_cidade";
      }
    }
    else if (isEmpresarial || lower.includes("cnpj")) {
      // Coleta CNPJ e responsável antes de transferir
      sess._cadastro = sess._cadastro || {};
      sess._cadastro.tipo = "empresarial";
      reply = "Para planos empresariais, preciso de algumas informações:\n\nQual o *CNPJ* da empresa?";
      novaEstado = "comercial_empresarial_cnpj";
    }
    // (transferência acontece após coleta dos dados)
    else if (false) { // placeholder para não quebrar o else
      const { transferirParaHumano } = await import("./services/handoff.js");
      await transferirParaHumano(conversationId, null, "Cliente empresarial - quero contratar").catch(() => {});
      reply = "Para planos empresariais, vou te conectar com um consultor especializado! 🏢\n\nAguarde um momento, por favor.";
      novaEstado = "atendimento";
    }
    else {
      reply = "Por favor, selecione uma opção:";
      await _enviarBotoes(telefone, reply, [
        { id: "residencial", title: "🏠 Residencial" },
        { id: "empresarial", title: "🏢 Empresarial" },
      ]);
      reply = "";
    }
  }

  // ── CIDADE ──
  // ── ESTADO: empresarial — coleta CNPJ, responsável, pontos ──
  else if (estado === "comercial_empresarial_cnpj") {
    const cnpj = content.replace(/\D/g, '');
    if (cnpj.length !== 14) {
      reply = "CNPJ inválido. Digite os 14 dígitos:";
    } else {
      sess._cadastro.cnpj = cnpj;
      reply = "Qual o *nome do responsável*?";
      novaEstado = "comercial_empresarial_resp";
    }
  }

  else if (estado === "comercial_empresarial_resp") {
    sess._cadastro.responsavel = content.trim();
    reply = "Quantos *pontos de rede* serão necessários?";
    novaEstado = "comercial_empresarial_pontos";
  }

  else if (estado === "comercial_empresarial_pontos") {
    sess._cadastro.pontos = content.trim();
    const { transferirParaHumano } = await import("./services/handoff.js");
    await transferirParaHumano(conversationId, null,
      `Empresarial: CNPJ ${sess._cadastro.cnpj} | Resp: ${sess._cadastro.responsavel} | Pontos: ${sess._cadastro.pontos} | Cobertura: ${sess._cadastro.cidade || "verificada"}`
    ).catch(() => {});
    reply = `Perfeito! Vou te transferir para nossa equipe comercial. 😊\n\nEles já terão suas informações:\n📄 CNPJ: ${sess._cadastro.cnpj}\n👤 ${sess._cadastro.responsavel}\n🔌 ${sess._cadastro.pontos} ponto(s)\n📍 Cobertura em ${sess._cadastro.cidade || "sua região"}\n\nAguarde um momento!`;
    novaEstado = "atendimento";
  }

  else if (estado === "comercial_cidade") {
    // Tenta encontrar a cidade pelo texto ou ID
    let cidadeEncontrada = null;
    try {
      const { query: dbQ } = await import("./services/db.js");
      const r = await dbQ(`SELECT * FROM cidades WHERE ativo=true ORDER BY ordem`);
      const cids = r.rows || [];
      const idNum = content.replace(/\D/g, '');
      cidadeEncontrada = cids.find(c => String(c.id) === idNum)
        || cids.find(c => c.nome.toLowerCase() === content.toLowerCase().replace(/^📍\s*/, ''))
        || cids.find(c => content.toLowerCase().includes(c.nome.toLowerCase()));
    } catch {}

    if (cidadeEncontrada) {
      sess._cadastro.cidade = cidadeEncontrada.nome;
      sess._cadastro.cidade_id = cidadeEncontrada.id;
      sess._cadastro.pop_id = cidadeEncontrada.pop_id;
      sess._cadastro.portador_id = cidadeEncontrada.portador_id;

      // Carrega planos da cidade
      try {
        const { query: dbQ } = await import("./services/db.js");
        const r = await dbQ(`
          SELECT p.id, p.sgp_id, p.nome, p.velocidade, p.unidade, p.valor, p.beneficios, p.destaque
          FROM cidade_planos cp JOIN planos p ON p.id=cp.plano_id
          WHERE cp.cidade_id=$1 AND p.ativo=true AND cp.ativo=true ORDER BY p.ordem
        `, [cidadeEncontrada.id]);
        const planos = r.rows || [];
        sess._cadastro._planos = planos;

        if (planos.length > 0) {
          // Envia cada plano como mensagem texto
          for (const p of planos) {
            const benefArr = Array.isArray(p.beneficios) ? p.beneficios : [];
            const benefStr = benefArr.map(b => `✅ ${b}`).join('\n');
            const destaque = p.destaque ? ' ⭐ Mais vendido' : '';
            // Remove sufixo "SMG" do nome exibido
            const nomeExibir = p.nome.replace(/ SMG$/, '');
            const msg = `📡 *${nomeExibir} — ${p.velocidade} ${p.unidade}*${destaque}\n💰 *R$ ${parseFloat(p.valor || 0).toFixed(2).replace('.', ',')}*/mês\n${benefStr}`;
            await waSendText(telefone, msg);
          }
          // Info da taxa de adesão por cidade
          const isSMG = cidadeEncontrada.nome.includes('Gostoso');
          const taxaMsg = isSMG
            ? "ℹ️ _Instalação gratuita (sem taxa de adesão)_"
            : "ℹ️ _Taxa de adesão: R$ 100 (paga na instalação — Pix, dinheiro ou cartão até 12x)_";
          await waSendText(telefone, taxaMsg);
          // Botões pra escolher (máx 3, nome sem "SMG")
          const botoes = planos.slice(0, 3).map(p => ({
            id: `plano_${p.id}`,
            title: `${p.nome.replace(/ SMG$/, '')} ${p.velocidade}${p.unidade === 'Giga' ? 'G' : 'M'}`,
          }));
          await _enviarBotoes(telefone, "Qual plano deseja contratar? 😊", botoes);
          reply = "";
        } else {
          reply = "Ops, não encontrei planos pra essa cidade. Tente outra ou fale com nosso atendente.";
        }
      } catch { reply = "Erro ao buscar planos. Tente novamente."; }
      novaEstado = "comercial_plano";
    } else {
      reply = "Não identifiquei a cidade. Selecione na lista acima 👆";
    }
  }

  // ── PLANO ──
  else if (estado === "comercial_plano") {
    const planos = sess._cadastro?._planos || [];
    const idMatch = content.match(/plano_(\d+)/);
    let planoEscolhido = null;

    if (idMatch) {
      planoEscolhido = planos.find(p => String(p.id) === idMatch[1]);
    }
    if (!planoEscolhido) {
      // Tenta pelo nome
      planoEscolhido = planos.find(p => content.toLowerCase().includes(p.nome.toLowerCase()));
    }

    if (planoEscolhido) {
      sess._cadastro.plano_id = planoEscolhido.sgp_id;
      sess._cadastro.plano_nome = planoEscolhido.nome.replace(/ SMG$/, '');
      sess._cadastro.plano_valor = planoEscolhido.valor;
      sess._cadastro.plano_vel = `${planoEscolhido.velocidade} ${planoEscolhido.unidade || 'Mega'}`;
      reply = `Ótima escolha! *${sess._cadastro.plano_nome} — ${sess._cadastro.plano_vel}* 🚀\n\nAgora preciso dos seus dados. Qual o seu *nome completo*?`;
      novaEstado = "comercial_nome";
    } else {
      reply = "Não identifiquei o plano. Selecione nos botões acima 👆";
    }
  }

  // ── NOME ──
  else if (estado === "comercial_nome") {
    const nome = content.trim();
    if (nome.split(/\s+/).length < 2) {
      reply = "Preciso do nome completo (nome e sobrenome). Pode digitar novamente? 😊";
    } else {
      sess._cadastro.nome = nome;
      reply = "Qual o seu *CPF* ou *CNPJ*? (apenas números, sem pontos ou traços)";
      novaEstado = "comercial_cpf";
    }
  }

  // ── CPF ──
  else if (estado === "comercial_cpf") {
    const cpf = content.replace(/\D/g, '');
    if (cpf.length !== 11 && cpf.length !== 14) {
      reply = "Documento inválido. Digite o *CPF* (11 dígitos) ou *CNPJ* (14 dígitos), apenas números:";
    } else {
      sess._cadastro.cpf = cpf;
      // Verifica se CPF já está cadastrado no SGP
      try {
        const { consultarClientes } = await import("./services/erp.js");
        const cliente = await consultarClientes(cpf).catch(() => null);
        if (cliente && !cliente.erro && cliente.contratos?.length > 0) {
          // CPF já cadastrado — abre chamado de novo ponto
          const contrato = cliente.contratos[0];
          const cad = sess._cadastro;
          const conteudo = `Solicitação de novo ponto de instalação via WhatsApp.
`
            + `Endereço: ${cad.logradouro || ""} ${cad.numero || ""}${cad.complemento ? ", " + cad.complemento : ""}`
            + `${cad.bairro ? " - " + cad.bairro : ""}${cad.cidade ? ", " + cad.cidade : ""}
`
            + `Plano desejado: ${cad.plano_nome || ""} (ID: ${cad.plano_id || ""})
`
            + `Coordenadas: ${cad._map_ll || "não informado"}`;
          const { criarChamado } = await import("./services/erp.js");
          const chamado = await criarChamado(String(contrato.id), "5", conteudo, {
            contato_nome: cliente.nome, contato_telefone: telefone, usuario: "maxxi"
          }).catch(() => null);
          const proto = chamado?.protocolo || chamado?.numero_chamado || "";
          reply = `Olá, *${cliente.nome?.split(" ")[0]}*! 😊

`
            + `Identificamos que você já é cliente CITmax com o contrato *#${contrato.id}*.

`
            + `Registramos sua solicitação de instalação em um novo endereço! `
            + `Nossa equipe comercial entrará em contato para verificar a viabilidade e agendar.
`
            + (proto ? `
📋 Protocolo: *${proto}*` : "")
            + `

Precisa de mais alguma coisa? 😊`;
          sess._cadastro = null;
          novaEstado = "atendimento";
        } else {
          // CPF novo — continua o cadastro
          reply = "Qual sua *data de nascimento*? (ex: 10/01/1990)";
          novaEstado = "comercial_nascimento";
        }
      } catch {
        // Erro na consulta — continua normalmente
        reply = "Qual sua *data de nascimento*? (ex: 10/01/1990)";
        novaEstado = "comercial_nascimento";
      }
    }
  }

  // ── DATA NASCIMENTO ──
  else if (estado === "comercial_nascimento") {
    // Tenta extrair data de qualquer formato
    let dataNasc = content.trim();
    const match = dataNasc.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);
    if (match) {
      dataNasc = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
      sess._cadastro.datanasc = dataNasc;
      reply = `Qual seu *celular* com DDD? (ex: 84999999999)`;
      novaEstado = "comercial_celular";
    } else if (/pular|nao|não|sem/i.test(dataNasc)) {
      sess._cadastro.datanasc = "";
      reply = `Qual seu *celular* com DDD? (ex: 84999999999)`;
      novaEstado = "comercial_celular";
    } else {
      reply = "Não entendi a data. Use o formato DD/MM/AAAA (ex: 10/01/1990):";
    }
  }

  // ── CELULAR ──
  else if (estado === "comercial_celular") {
    const cel = content.replace(/\D/g, '');
    if (cel.length < 10) {
      reply = "Celular inválido. Digite DDD + número (ex: 84999999999):";
    } else {
      sess._cadastro.celular = cel;
      reply = "Qual seu *e-mail*? (ou digite 'não tenho')";
      novaEstado = "comercial_email";
    }
  }

  // ── EMAIL ──
  else if (estado === "comercial_email") {
    const email = content.trim().toLowerCase();
    if (/nao|não|sem|nenhum|pular/i.test(email)) {
      sess._cadastro.email = "";
    } else {
      sess._cadastro.email = email;
    }
    // Se já tem endereço do GPS ou CEP, pula para número
    if (sess._cadastro?.logradouro) {
      reply = `Endereço detectado: *${sess._cadastro.logradouro}${sess._cadastro.bairro ? " - " + sess._cadastro.bairro : ""}*\n\nQual o *número*?`;
      novaEstado = "comercial_numero";
    } else {
      reply = `Agora o endereço de instalação! 🏠\n\nQual o *logradouro*? (rua, avenida...)`;
      novaEstado = "comercial_logradouro";
    }
  }

  // ── LOGRADOURO ──
  else if (estado === "comercial_logradouro") {
    sess._cadastro.logradouro = content.trim();
    reply = "Qual o *número*?";
    novaEstado = "comercial_numero";
  }

  // ── NÚMERO ──
  else if (estado === "comercial_numero") {
    sess._cadastro.numero = content.trim();
    reply = "Tem *complemento*? (apt, bloco, etc — ou 'não tem')";
    novaEstado = "comercial_complemento";
  }

  // ── COMPLEMENTO ──
  else if (estado === "comercial_complemento") {
    const comp = content.trim();
    sess._cadastro.complemento = /nao|não|sem|nenhum/i.test(comp) ? "" : comp;
    reply = "Qual o *bairro*?";
    novaEstado = "comercial_bairro";
  }

  // ── BAIRRO ──
  else if (estado === "comercial_bairro") {
    sess._cadastro.bairro = content.trim();
    reply = "Algum *ponto de referência*? (ou 'não tem')";
    novaEstado = "comercial_referencia";
  }

  // ── PONTO DE REFERÊNCIA → PERGUNTA VENCIMENTO ──
  else if (estado === "comercial_referencia") {
    const ref = content.trim();
    sess._cadastro.pontoreferencia = /nao|não|sem|nenhum/i.test(ref) ? "" : ref;

    // Busca vencimentos disponíveis do ERP
    try {
      const { listarVencimentos } = await import("./services/erp.js");
      const vencimentos = await listarVencimentos();
      const lista = Array.isArray(vencimentos) ? vencimentos : (vencimentos?.vencimentos || []);
      sess._cadastro._vencimentos = lista;
      if (lista.length > 0) {
        const rows = lista.slice(0, 10).map(v => ({
          id: `venc_${v.id || v.vencimento_id || v.dia}`,
          title: `Dia ${v.dia || v.vencimento || v.nome || v.id}`,
        }));
        await _enviarLista(telefone, "Qual o melhor dia de vencimento da sua fatura? 📅", "Ver opções", [{ title: "Dias disponíveis", rows }]);
        reply = "";
      } else {
        // Sem vencimentos na API — usa dia 5 como padrão
        sess._cadastro.vencimento_id = "1";
        const c = sess._cadastro;
        const resumo = buildResumo(c);
        await _enviarBotoes(telefone, resumo, [
          { id: "confirmar_cadastro", title: "✅ Confirmar" },
          { id: "cancelar_cadastro", title: "❌ Cancelar" },
        ]);
        reply = "";
        novaEstado = "comercial_confirmar";
      }
    } catch {
      sess._cadastro.vencimento_id = "1";
      const c = sess._cadastro;
      const resumo = buildResumo(c);
      await _enviarBotoes(telefone, resumo, [
        { id: "confirmar_cadastro", title: "✅ Confirmar" },
        { id: "cancelar_cadastro", title: "❌ Cancelar" },
      ]);
      reply = "";
      novaEstado = "comercial_confirmar";
    }
    // Só vai pra vencimento se não foi direto pro confirmar
    if (novaEstado !== "comercial_confirmar") novaEstado = "comercial_vencimento";
  }

  // ── VENCIMENTO → RESUMO ──
  else if (estado === "comercial_vencimento") {
    // Interpreta seleção de lista ou texto livre
    const vencimentos = sess._cadastro._vencimentos || [];
    const match = content.match(/^venc_(.+)$/);
    let vencEscolhido = null;
    if (match) {
      const vid = match[1];
      vencEscolhido = vencimentos.find(v => String(v.id || v.vencimento_id || v.dia) === vid);
    }
    if (!vencEscolhido) {
      // Tenta pelo número digitado diretamente
      const num = content.replace(/\D/g, '');
      vencEscolhido = vencimentos.find(v => String(v.dia || v.vencimento || v.id) === num);
    }
    sess._cadastro.vencimento_id = String(vencEscolhido?.id || vencEscolhido?.vencimento_id || 1);

    // Resumo final
    const c = sess._cadastro;
    const resumo = buildResumo(c);
    await _enviarBotoes(telefone, resumo, [
      { id: "confirmar_cadastro", title: "✅ Confirmar" },
      { id: "cancelar_cadastro", title: "❌ Cancelar" },
    ]);
    reply = "";
    novaEstado = "comercial_confirmar";
  }

  // ── CONFIRMAÇÃO FINAL ──
  else if (estado === "comercial_confirmar") {
    if (content.includes("Confirmar") || content.includes("confirmar") || content.toLowerCase().includes("sim")) {
      const c = sess._cadastro;
      try {
        const { cadastrarCliente } = await import("./services/erp.js");
        // Tenta pegar coordenadas: da sessão (_map_ll), ou da localização GPS
        const mapLL = c._map_ll || sess._map_ll || null;
        const resultado = await cadastrarCliente({
          nome: c.nome, cpf: c.cpf, datanasc: c.datanasc || '',
          email: c.email || '', celular: c.celular,
          logradouro: c.logradouro || '', numero: c.numero || '',
          complemento: c.complemento || '', bairro: c.bairro || '',
          cidade: c.cidade, pontoreferencia: c.pontoreferencia || '',
          plano_id: c.plano_id, vencimento_id: c.vencimento_id || '1',
          pop_id: c.pop_id, portador_id: c.portador_id,
          ...(mapLL ? { map_ll: mapLL } : {}),
        });

        // Salva lead localmente
        try {
          const { query: dbQ } = await import("./services/db.js");
          await dbQ(`INSERT INTO leads(cpf,nome,telefone,email,cidade,plano_id,datanasc,logradouro,numero,complemento,bairro,pontoreferencia,pop_id,portador_id,status,canal,erp_response)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [c.cpf, c.nome, c.celular, c.email, c.cidade, String(c.plano_id), c.datanasc, c.logradouro, c.numero, c.complemento, c.bairro, c.pontoreferencia, String(c.pop_id), String(c.portador_id), 'cadastrado', 'whatsapp', JSON.stringify(resultado)]);
        } catch {}

        const proto = resultado?.protocolo ? `\n📋 Protocolo: *${resultado.protocolo}*` : '';
        const nomeFirst = c.nome?.split(" ")[0] || "Cliente";
        reply = `🎉 *Bem-vindo à CITmax, ${nomeFirst}!*${proto}\n\n✅ Seu cadastro foi realizado com sucesso!\n\n📱 *Baixe nosso app* para acompanhar sua conta, boletos e chamados:\nhttps://cit.net.br/app\n\n🔧 Nossa equipe técnica entrará em contato em breve para *agendar a instalação*.\n\nQualquer dúvida é só chamar! 😊`;
      } catch (e) {
        logger.warn(`⚠️ Cadastro ERP falhou: ${e.message}`);
        reply = "Ops, houve um erro no cadastro. Vou te transferir pra um atendente finalizar. 🙏";
        const { transferirParaHumano } = await import("./services/handoff.js");
        await transferirParaHumano(conversationId, null, `Cadastro falhou: ${JSON.stringify(sess._cadastro)}`).catch(() => {});
      }
      sess._cadastro = null;
      novaEstado = "inicio";
    }
    else if (content.includes("Cancelar") || content.includes("cancelar") || content.toLowerCase().includes("não")) {
      reply = "Cadastro cancelado. Se mudar de ideia, é só chamar! 😊";
      sess._cadastro = null;
      novaEstado = "inicio";
    }
    else {
      reply = "Confirma o cadastro?";
      await _enviarBotoes(telefone, reply, [
        { id: "confirmar_cadastro", title: "✅ Confirmar" },
        { id: "cancelar_cadastro", title: "❌ Cancelar" },
      ]);
      reply = "";
    }
  }

  // Salvar estado
  sess._estado = novaEstado;
  const elapsed = Date.now() - t0;
  logger.info(`✅ estado=${novaEstado} | ${elapsed}ms | "${reply?.slice(0, 50)}"`);

  // Salvar sessão e histórico
  if (!accountId) saveLocal(conversationId, [...history, { role: "user", content }, ...(reply ? [{ role: "assistant", content: reply }] : [])]);
  try { const { salvarSessao } = await import("./services/memoria.js"); await salvarSessao(telefone, sess, tenantId); } catch {}

  // Disparar pesquisa NPS quando encerra atendimento
  if (novaEstado === "inicio" && sess.nome && telefone) {
    try {
      const { agendarNPS } = await import("./services/nps.js");
      agendarNPS({
        telefone,
        canal: "whatsapp",
        protocolo: sess._protocolo || conversationId,
        enviarFn: async (pergunta) => {
          const { marcarAguardandoNPS } = await import("./services/nps.js");
          marcarAguardandoNPS(telefone, sess._protocolo || conversationId);
          await waSendText(telefone, pergunta);
        },
      }).catch(() => {});
    } catch {}
  }

  return { reply, sessaoAtualizada: sess };
}

// ═══════════════════════════════════════════════════════════════
// RESOLVER BOLETO — fluxo completo
// ═══════════════════════════════════════════════════════════════
async function resolverBoleto(sess, history, content, telefone, conversationId, accountId, t0) {
  const saveSess = async () => { try { const { salvarSessao } = await import("./services/memoria.js"); await salvarSessao(telefone, sess, tenantId); } catch {} };

  // Se não tem CPF, pede
  if (!sess.cpfcnpj) {
    sess._estado = "aguardando_cpf";
    sess._intencao_pendente = "boleto";
    await saveSess();
    return { reply: "Pra enviar o boleto preciso do seu *CPF* ou *CNPJ* 📝", sessaoAtualizada: sess };
  }

  // Consulta API pra dados frescos
  const cliente = await consultarCliente(sess.cpfcnpj);
  if (!cliente || cliente.erro || !cliente.contratos?.length) {
    sess._estado = "aguardando_cpf";
    await saveSess();
    return { reply: "Não encontrei contratos nesse CPF/CNPJ. Pode verificar? 🤔", sessaoAtualizada: sess };
  }
  sess.nome = cliente.nome;
  sess.contratos = await enriquecerContratos(cliente.contratos || []);
  logger.info(`📋 Cliente: ${cliente.nome} | ${cliente.contratos.length} contratos | ativo: ${sess.contrato_ativo || 'nenhum'}`);

  // Múltiplos contratos SEM contrato selecionado → lista
  if (sess.contratos.length > 1 && !sess.contrato_ativo) {
    const rows = sess.contratos.slice(0, 10).map(c => ({
      id: String(c.id),
      title: `${c.online ? '🟢' : '🔴'} Contrato ${c.id}`,
      description: (c.end || c.plano || '').slice(0, 72),
    }));
    logger.info(`📲 Enviando lista de ${rows.length} contratos → ${telefone}`);
    const ok = await enviarLista(
      telefone,
      `${sess.nome?.split(' ')[0]}, encontrei ${sess.contratos.length} contratos. Qual deseja o boleto?`,
      "Ver contratos",
      [{ title: "Seus contratos", rows }]
    );
    sess._estado = "aguardando_contrato";
    sess._intencao_pendente = "boleto"; // Quando selecionar → vai direto pro boleto
    await saveSess();
    return { reply: ok ? "" : `Encontrei ${sess.contratos.length} contratos. Qual o número do contrato?`, sessaoAtualizada: sess };
  }

  // Contrato já selecionado ou único → gera boleto direto
  const contratoId = sess.contrato_ativo || String(sess.contratos[0].id);
  logger.info(`📋 Gerando boleto: contrato #${contratoId}`);

  const resultado = await gerarBoleto(sess.cpfcnpj, contratoId);
  if (!resultado) {
    sess._estado = "identificado";
    await saveSess();
    return { reply: "Não consegui gerar o boleto agora. Tente novamente em instantes. 🙏", sessaoAtualizada: sess };
  }

  // Extrair boleto da resposta (vários formatos possíveis)
  let boleto = null;
  if (resultado.status === "boleto_encontrado") boleto = resultado;
  else if (resultado.boletos?.[0]) boleto = resultado.boletos[0];
  else if (Array.isArray(resultado) && resultado[0]) boleto = resultado[0];
  else if (resultado.link_cobranca || resultado.pix_copia_cola) boleto = resultado;

  logger.info(`📋 Boleto extraído: ${boleto ? `R$${boleto.valor_cobrado || boleto.valor} | link: ${boleto.link_cobranca ? 'SIM' : 'NÃO'} | pix: ${boleto.pix_copia_cola ? 'SIM' : 'NÃO'}` : 'NULL'}`);

  if (boleto && (boleto.pix_copia_cola || boleto.link_cobranca || boleto.linha_digitavel || boleto.link_boleto || boleto.linhadigitavel || boleto.codigopix)) {
    await enviarBoleto(telefone, boleto, sess.nome);
    sess._estado = "identificado";
    await saveSess();
    return { reply: "Precisa de mais alguma coisa? 😊", sessaoAtualizada: sess };
  }

  if (resultado.status === "sem_boleto") {
    sess._estado = "identificado";
    await saveSess();
    return { reply: "Não encontrei boleto em aberto pra esse contrato 👍 Tá tudo em dia!\n\nPrecisa de outra coisa?", sessaoAtualizada: sess };
  }

  logger.warn(`⚠️ segunda_via retornou estrutura desconhecida: ${JSON.stringify(resultado).slice(0, 300)}`);
  sess._estado = "identificado";
  await saveSess();
  return { reply: "Não consegui processar o boleto. Tente novamente. 🙏", sessaoAtualizada: sess };
}

// ═══════════════════════════════════════════════════════════════
// LOOP GPT (tool calling)
// ═══════════════════════════════════════════════════════════════
async function loopGPT(system, history, content, tools, sess, modelo = GPT, temperatura = undefined) {
  const msgs = [{ role: "system", content: system }, ...history.slice(-20), { role: "user", content }];
  let usedSilent = false, loops = 0;

  const opts = { model: modelo, max_completion_tokens: 600, messages: msgs, tools: tools.length > 0 ? tools : undefined };
  if (temperatura !== undefined) opts.temperature = temperatura;
  let res = await openai.chat.completions.create(opts);

  while (res.choices?.[0]?.finish_reason === "tool_calls" && loops < 8) {
    loops++;
    const calls = res.choices[0].message.tool_calls || [];
    msgs.push(res.choices[0].message);

    for (const tc of calls) {
      const name = tc.function.name;
      let input = {};
      try { input = JSON.parse(tc.function.arguments || "{}"); } catch {}
      if (input.contrato) input.contrato = String(input.contrato).replace(/^#/, '');
      if (input.cpfcnpj) input.cpfcnpj = String(input.cpfcnpj).replace(/\D/g, '');
      logger.info(`🔧 [GPT/${loops}] ${name} | ${JSON.stringify(input).slice(0, 150)}`);

      if (SILENT_TOOLS.has(name)) usedSilent = true;
      if (name === "transferir_para_humano") return { text: "Vou transferir para um atendente humano! 🙏", handoff: true };
      if (name === "encerrar_atendimento") return { text: input.mensagem_final || "Foi um prazer! 😊", resolve: true };

      let result;
      try { result = await executeTool(name, input); }
      catch { try { await new Promise(r => setTimeout(r, 800)); result = await executeTool(name, input); } catch (e2) { result = { erro: e2.message }; } }

      // Notifica técnicos quando IA (GPT) abre chamado técnico
      if (name === "criar_chamado" && result && !result.erro) {
        const proto = result?.protocolo || result?.numero_chamado || result?.os_id || "";
        if (proto) {
          import("./services/notif-agentes.js").then(({ notificarTecnicosChamado }) =>
            notificarTecnicosChamado({ protocolo: proto, nome: sess?.nome, telefone: sess?._telefone, contrato: input?.contrato, tipo: "Ocorrência", conteudo: input?.conteudo || "" }).catch(() => {})
          ).catch(() => {});
        }
        // Reação automática ✅ confirma abertura do chamado
        if (sess?._lastMsgId && telefone) {
          import("./services/whatsapp.js").then(({ waSendReaction }) =>
            waSendReaction(telefone, sess._lastMsgId, "✅").catch(() => {})
          ).catch(() => {});
        }
      }

      // Reação automática 👍 ao confirmar promessa de pagamento
      if (name === "promessa_pagamento" && result && !result.erro) {
        if (sess?._lastMsgId && telefone) {
          import("./services/whatsapp.js").then(({ waSendReaction }) =>
            waSendReaction(telefone, sess._lastMsgId, "👍").catch(() => {})
          ).catch(() => {});
        }
      }

      msgs.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result || { erro: "vazio" }) });
    }

    res = await openai.chat.completions.create({
      model: modelo, max_completion_tokens: 600,
      messages: msgs, tools: tools.length > 0 ? tools : undefined,
    });
  }

  let text = res.choices?.[0]?.message?.content || "";
  text = text.replace(/```json[\s\S]*?```/g, "").replace(/```[\s\S]*?```/g, "").trim();
  if (text.startsWith("{") && text.endsWith("}")) { try { JSON.parse(text); text = ""; } catch {} }
  if (usedSilent && !text) text = "";
  return { text, usedSilent };
}

// ═══════════════════════════════════════════════════════════════
// LOOP CLAUDE (fallback)
// ═══════════════════════════════════════════════════════════════
async function loopClaude(system, history, content, tools, sess, modelo = HAIKU, temperatura = undefined) {
  const messages = [...history.slice(-20), { role: "user", content }];
  let usedSilent = false, loops = 0;

  const opts = { model: modelo, max_tokens: 600, system: [{ type: "text", text: system }], tools, messages };
  if (temperatura !== undefined) opts.temperature = temperatura;
  let res = await anthropic.messages.create(opts);

  while (res.stop_reason === "tool_use" && loops < 8) {
    loops++;
    const tbs = res.content.filter(b => b.type === "tool_use");
    const results = [];
    for (const tb of tbs) {
      if (tb.input?.contrato) tb.input.contrato = String(tb.input.contrato).replace(/^#/, '');
      if (tb.input?.cpfcnpj) tb.input.cpfcnpj = String(tb.input.cpfcnpj).replace(/\D/g, '');
      logger.info(`🔧 [Claude/${loops}] ${tb.name} | ${JSON.stringify(tb.input).slice(0, 150)}`);
      if (SILENT_TOOLS.has(tb.name)) usedSilent = true;
      if (tb.name === "transferir_para_humano") return { text: "Vou transferir! 🙏", handoff: true };
      if (tb.name === "encerrar_atendimento") return { text: tb.input?.mensagem_final || "Foi um prazer! 😊" };

      let result;
      try { result = await executeTool(tb.name, tb.input); }
      catch { try { await new Promise(r => setTimeout(r, 800)); result = await executeTool(tb.name, tb.input); } catch (e2) { result = { erro: e2.message }; } }

      // Notifica técnicos quando IA abre chamado técnico
      if (tb.name === "criar_chamado" && result && !result.erro) {
        const proto = result?.protocolo || result?.numero_chamado || result?.os_id || "";
        if (proto) {
          import("./services/notif-agentes.js").then(({ notificarTecnicosChamado }) =>
            notificarTecnicosChamado({
              protocolo: proto,
              nome: sess?.nome,
              telefone: sess?._telefone || sess?.telefone,
              contrato: tb.input?.contrato,
              tipo: { "200":"Reparo/Visita técnica","3":"Mudança de senha Wi-Fi","14":"Relocação de roteador","13":"Mudança de endereço","23":"Mudança de plano","22":"Problema de fatura","5":"Outros" }[String(tb.input?.ocorrenciatipo)] || "Ocorrência",
              conteudo: tb.input?.conteudo || "",
            }).catch(() => {})
          ).catch(() => {});
        }
        // Reação automática ✅ confirma abertura do chamado
        if (sess?._lastMsgId && telefone) {
          import("./services/whatsapp.js").then(({ waSendReaction }) =>
            waSendReaction(telefone, sess._lastMsgId, "✅").catch(() => {})
          ).catch(() => {});
        }
      }

      // Reação automática 👍 ao confirmar promessa de pagamento
      if (tb.name === "promessa_pagamento" && result && !result.erro) {
        if (sess?._lastMsgId && telefone) {
          import("./services/whatsapp.js").then(({ waSendReaction }) =>
            waSendReaction(telefone, sess._lastMsgId, "👍").catch(() => {})
          ).catch(() => {});
        }
      }

      results.push({ type: "tool_result", tool_use_id: tb.id, content: JSON.stringify(result || {}) });
    }
    res = await anthropic.messages.create({ model: modelo, max_tokens: 600, system: [{ type: "text", text: system }], tools, messages: [...messages, { role: "assistant", content: res.content }, { role: "user", content: results }] });
  }

  let text = res.content?.find(b => b.type === "text")?.text || "";
  text = text.replace(/```json[\s\S]*?```/g, "").replace(/```[\s\S]*?```/g, "").trim();
  if (text.startsWith("{") && text.endsWith("}")) { try { JSON.parse(text); text = ""; } catch {} }
  return { text, usedSilent };
}
