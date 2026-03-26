/**
 * motor-fluxo.js — Motor de execução do editor visual de fluxos
 * Substitui a lógica de estados do agent.js
 */
import { query, CITMAX_TENANT_ID } from "./db.js";
import { logger } from "./logger.js";

// ── Cache de fluxo ativo ─────────────────────────────────────────────────────
let _fluxoCache = null;
let _fluxoCacheTs = 0;

// Cache por canal
const _canalCache = {};
const _canalCacheTs = {};

export async function carregarFluxoAtivo(forcar = false, canal = null) {
  const key = canal || '__global__';
  if (!forcar && _canalCache[key] && Date.now() - (_canalCacheTs[key]||0) < 30000) return _canalCache[key];
  try {
    let r;
    if (canal) {
      // Tenta fluxo específico do canal
      r = await query(`
        SELECT f.* FROM fluxos f
        INNER JOIN canais c ON c.fluxo_id = f.id
        WHERE c.tipo=$1 AND f.publicado=true
        LIMIT 1`, [canal]);
    }
    // Fallback: fluxo global ativo
    if (!r?.rows?.length) {
      r = await query(`SELECT * FROM fluxos WHERE ativo=true AND publicado=true ORDER BY atualizado DESC LIMIT 1`);
    }
    if (r?.rows?.length) {
      _canalCache[key] = r.rows[0];
      _canalCacheTs[key] = Date.now();
    }
    return _canalCache[key] || null;
  } catch { return null; }
}

export function invalidarCacheFluxo() {
  _fluxoCache = null; _fluxoCacheTs = 0;
  Object.keys(_canalCache).forEach(k => { delete _canalCache[k]; delete _canalCacheTs[k]; });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function resolverVariavel(texto, vars) {
  if (!texto || typeof texto !== "string") return texto;
  return texto.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const k = key.trim();
    // Tenta chave flat primeiro: vars["cliente.cpf"]
    if (k in vars) return vars[k];
    // Tenta acesso aninhado: vars.cliente.cpf
    const val = k.split(".").reduce((o, part) => o?.[part], vars);
    return val !== undefined ? val : `{{${key}}}`;
  });
}

function resolverObj(obj, vars) {
  if (!obj) return obj;
  if (typeof obj === "string") return resolverVariavel(obj, vars);
  if (Array.isArray(obj)) return obj.map(i => resolverObj(i, vars));
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = resolverObj(v, vars);
  return out;
}

function proximoNo(fluxo, noId, porta = "saida") {
  const edge = fluxo.edges?.find(e => e.from === noId && (e.port || "saida") === porta);
  if (!edge) return null;
  return fluxo.nodes?.find(n => n.id === edge.to) || null;
}

// Versão com fallback por alias — use esta em vez de proximoNo quando quiser roteamento automático
function proximoNoOuAlias(fluxo, noId, porta = "saida") {
  // Prioridade 1: linha manual no canvas
  const manual = proximoNo(fluxo, noId, porta);
  if (manual) return manual;

  // Prioridade 2: nó com alias igual à porta (roteamento automático)
  if (porta && porta !== "saida") {
    const porAlias = fluxo.nodes?.find(n => n.config?.alias === porta);
    if (porAlias) {
      logger.info(`🔗 Alias match: porta "${porta}" → nó ${porAlias.id} (${porAlias.tipo})`);
      return porAlias;
    }
  }

  return null;
}

function avaliarCondicao(variavel, op, valor, vars) {
  const atual = String(resolverVariavel(`{{${variavel}}}`, vars) ?? "");
  const cmp = String(valor ?? "");
  switch (op) {
    case "==": return atual === cmp;
    case "!=": return atual !== cmp;
    case ">":  return parseFloat(atual) > parseFloat(cmp);
    case "<":  return parseFloat(atual) < parseFloat(cmp);
    case "contem": return atual.toLowerCase().includes(cmp.toLowerCase());
    case "nao_contem": return !atual.toLowerCase().includes(cmp.toLowerCase());
    case "vazio": return !atual;
    case "nao_vazio": return !!atual;
    default: return false;
  }
}

// ── Executor principal ───────────────────────────────────────────────────────
export async function executarFluxo({ telefone, mensagem, sessao, conversationId, canal, accountId, tenantId = CITMAX_TENANT_ID, enviarFn, enviarBotoesFn, enviarListaFn, transferirFn }) {
  // Suporte a fluxo específico via override (transferência manual pelo agente)
  let fluxo;
  if (sessao._fluxo_id_override) {
    const { query: dbQ } = await import("./db.js");
    const r = await dbQ(`SELECT * FROM fluxos WHERE id=$1 AND publicado=true`, [sessao._fluxo_id_override]); // tenant implícito via sessão
    fluxo = r.rows[0] || null;
    if (!fluxo) { sessao._fluxo_id_override = null; } // fluxo não existe mais, limpa
  }
  if (!fluxo) fluxo = await carregarFluxoAtivo(false, canal);
  if (!fluxo?.dados) return null;

  const dados = typeof fluxo.dados === "string" ? JSON.parse(fluxo.dados) : fluxo.dados;

  // ── Escape universal: /sair, encerrar, tchau, oi no meio do fluxo ──────────
  const msgLower = (mensagem || "").toLowerCase().trim();
  const isEscape = /^(\/sair|encerr|tchau|sair|cancelar|voltar|menu|inicio|reiniciar|oi$|ol[aá]$|bom dia|boa tarde|boa noite)/.test(msgLower);
  if (isEscape && sessao._fluxo_no && sessao._fluxo_no !== 'inicio') {
    logger.info(`🚪 Escape universal: "${mensagem}" — resetando sessão`);
    sessao._fluxo_no = null;
    sessao._fluxo_aguardando = null;
    sessao._vars = {};
    sessao._estado = "inicio";
    sessao._cadastro = null;
    sessao._protocolo = null;
    sessao._resetado = true;
    return { tipo: "resetado", sessaoAtualizada: { ...sessao } };
  }

  const vars = sessao._vars || {};

  // Injeta variáveis de sistema sempre disponíveis
  if (!vars['saudacao']) {
    try {
      const { gerarSaudacao } = await import("./saudacao.js");
      vars['saudacao'] = gerarSaudacao();
    } catch { vars['saudacao'] = 'Olá!'; }
  }
  if (!vars['protocolo']) {
    try {
      const { gerarProtocolo } = await import("./protocolo.js");
      vars['protocolo'] = sessao._protocolo || gerarProtocolo();
      sessao._protocolo = vars['protocolo'];
    } catch { vars['protocolo'] = '—'; }
  }
  let noId = sessao._fluxo_no || null;

  // Primeira mensagem — acha o nó de início
  if (!noId) {
    const inicio = dados.nodes?.find(n => n.tipo === "inicio");
    if (!inicio) return null;
    noId = inicio.id;
  }

  let no = dados.nodes?.find(n => n.id === noId);
  if (!no) return null;

  let resultado = null;
  let maxIteracoes = 20;

  while (no && maxIteracoes-- > 0) {
    logger.info(`⚙️ Fluxo: executando nó ${no.id} (${no.tipo})`);

    switch (no.tipo) {

      case "inicio": {
        sessao._vars = {};
        no = proximoNo(dados, no.id) || null;
        continue;
      }

      case "enviar_texto": {
        const texto = resolverVariavel(no.config?.texto || "", vars);
        await enviarFn(texto);
        sessao._fluxo_no = no.id;
        no = proximoNo(dados, no.id) || null;
        continue;
      }

      case "enviar_botoes": {
        // ── Retorno: já estava aguardando resposta de botão ──────────────────
        if (sessao._fluxo_aguardando === "botao" && sessao._fluxo_no === no.id) {
          const botoes = (no.config?.botoes || []).map(b => ({
            id: typeof b === "object" ? (b.id || b.label?.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"")) : String(b),
            label: typeof b === "object" ? (b.label || "") : String(b),
          }));
          // Tenta casar resposta com id ou label do botão (WhatsApp envia o id)
          const msgNorm = (mensagem || "").toLowerCase().trim().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
          const escolhido = botoes.find(b =>
            b.id === mensagem?.trim() ||
            b.id === msgNorm ||
            b.label?.toLowerCase() === mensagem?.toLowerCase().trim()
          ) || botoes.find(b => mensagem?.toLowerCase().includes(b.label?.toLowerCase()));

          const porta = escolhido?.id || msgNorm || "saida";
          vars["opcao_escolhida"] = porta;
          sessao._vars = vars;
          sessao._fluxo_aguardando = null;
          // Tenta rota direta pelo id do botão; fallback para saida genérica
          no = proximoNoOuAlias(dados, no.id, porta) || proximoNoOuAlias(dados, no.id, "saida") || proximoNo(dados, no.id) || null;
          continue;
        }
        // ── Envio inicial ─────────────────────────────────────────────────────
        const corpo = resolverVariavel(no.config?.corpo || "", vars);
        const botoes = (no.config?.botoes || []).map(b => ({
          id: typeof b === "object" ? (b.id || b.label?.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"")) : `btn_${Math.random().toString(36).slice(2,6)}`,
          title: resolverVariavel(typeof b === "object" ? (b.label || "") : String(b), vars),
        }));
        await enviarBotoesFn(corpo, botoes);
        sessao._fluxo_no = no.id;
        sessao._fluxo_aguardando = "botao";
        resultado = { tipo: "aguardando" };
        no = null;
        break;
      }

      case "enviar_lista": {
        // ── Retorno: já estava aguardando seleção de lista ───────────────────
        if (sessao._fluxo_aguardando === "lista" && sessao._fluxo_no === no.id) {
          // Coleta todos os ids de linhas para casar com a resposta
          const itensRaw = (no.config?.itens || "").split("\n").map(l => l.trim()).filter(Boolean);
          const todosIds = itensRaw.map(l => {
            const [id] = l.split("|");
            return (id || "").trim().toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
          });
          const msgNorm = (mensagem || "").toLowerCase().trim().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
          const porta = todosIds.find(id => id === mensagem?.trim() || id === msgNorm) || msgNorm || "saida";
          vars["opcao_escolhida"] = porta;
          sessao._vars = vars;
          sessao._fluxo_aguardando = null;
          no = proximoNoOuAlias(dados, no.id, porta) || proximoNoOuAlias(dados, no.id, "saida") || proximoNo(dados, no.id) || null;
          continue;
        }
        // ── Envio inicial ─────────────────────────────────────────────────────
        const corpo2 = resolverVariavel(no.config?.corpo || "", vars);
        const label2 = resolverVariavel(no.config?.label_botao || "Ver opções", vars);
        // Suporta formato "id|Título" linha a linha OU array de secoes legado
        let secoes2;
        if (no.config?.itens) {
          const linhas = (no.config.itens || "").split("\n").map(l => l.trim()).filter(Boolean);
          const rows2 = linhas.map(l => {
            const [id, ...rest] = l.split("|");
            const title = rest.join("|").trim() || id.trim();
            return { id: (id||"").trim().toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,""), title };
          });
          secoes2 = [{ title: no.config?.titulo_secao || "Opções", rows: rows2 }];
        } else {
          secoes2 = (no.config?.secoes || []).map(s => ({
            title: resolverVariavel(s.title, vars),
            rows: (s.rows || []).map(r => ({
              id: r.id || r.title?.toLowerCase().replace(/\s+/g,"_"),
              title: resolverVariavel(r.title, vars),
            })),
          }));
        }
        await enviarListaFn(corpo2, label2, secoes2);
        sessao._fluxo_no = no.id;
        sessao._fluxo_aguardando = "lista";
        resultado = { tipo: "aguardando" };
        no = null;
        break;
      }

      case "aguardar_resposta": {
        if (sessao._fluxo_aguardando === "ia" && sessao._fluxo_no === no.id) {
          // Estava aguardando IA — redireciona para o nó IA pai
          // (não deveria cair aqui, mas por segurança)
          sessao._fluxo_aguardando = null;
          no = dados.nodes?.find(n => n.id === no.id) || null;
          continue;
        }
        if (sessao._fluxo_aguardando === "resposta" && sessao._fluxo_no === no.id) {
          // Já estava aguardando — recebeu a resposta
          const varName = no.config?.variavel || "resposta";
          vars[varName] = mensagem;
          sessao._vars = vars;
          sessao._fluxo_aguardando = null;
          no = proximoNo(dados, no.id) || null;
          continue;
        }
        // Ainda não aguardava — manda mensagem e aguarda
        if (no.config?.mensagem) {
          await enviarFn(resolverVariavel(no.config.mensagem, vars));
        }
        sessao._fluxo_no = no.id;
        sessao._fluxo_aguardando = "resposta";
        resultado = { tipo: "aguardando" };
        no = null;
        break;
      }

      case "condicao": {
        const c = no.config || {};
        const passou = avaliarCondicao(c.variavel, c.operador, c.valor, vars);
        no = proximoNo(dados, no.id, passou ? "sim" : "nao") || null;
        continue;
      }

      case "condicao_multipla": {
        // Verifica múltiplas condições em ordem — first match wins
        const ramos = no.config?.ramos || [];
        let ramoEscolhido = "default";
        for (const ramo of ramos) {
          if (avaliarCondicao(ramo.variavel, ramo.operador, ramo.valor, vars)) {
            ramoEscolhido = ramo.porta;
            break;
          }
        }
        no = proximoNo(dados, no.id, ramoEscolhido) || null;
        continue;
      }

      case "definir_variavel": {
        const varName = no.config?.variavel;
        const valor = resolverVariavel(no.config?.valor || "", vars);
        if (varName) vars[varName] = valor;
        sessao._vars = vars;
        no = proximoNo(dados, no.id) || null;
        continue;
      }

      case "consultar_cliente":
      case "consultar_sgp": {
        // ── PRIORIDADE 1: já estava aguardando seleção de contrato ────────────
        if (sessao._fluxo_aguardando === "contrato" && sessao._fluxo_no === no.id && sessao._contratos_disponiveis) {
          const contratos = sessao._contratos_disponiveis;
          const msgLimpa = (mensagem || "").replace(/[^0-9]/g, "");
          const numDigitado = parseInt(msgLimpa) - 1;
          const escolhido =
            contratos.find(ct => ct.id === mensagem?.trim()) ||
            contratos.find(ct => ct.id === msgLimpa) ||
            contratos.find(ct => mensagem?.includes(ct.id)) ||
            (numDigitado >= 0 && numDigitado < contratos.length ? contratos[numDigitado] : null) ||
            null;

          if (escolhido) {
            vars["cliente.contrato"] = escolhido.id;
            vars["cliente.plano"]    = escolhido.plano;
            vars["cliente.status"]   = escolhido.status;
            vars["cliente.cidade"]   = escolhido.cidade;
            vars["cliente.cadastrado"] = "true";
            sessao._fluxo_aguardando = null;
            sessao._contratos_disponiveis = null;
            sessao._vars = vars;
            no = proximoNo(dados, no.id, "multiplos_contratos") || proximoNo(dados, no.id, "encontrado") || null;
            continue;
          }
          // Não reconheceu a seleção — manda a lista de novo
          no = null;
          resultado = { tipo: "aguardando", sessaoAtualizada: { ...sessao } };
          break;
        }

        // ── PRIORIDADE 2: já estava aguardando digitação do CPF ──────────────
        const cpfAtual = resolverVariavel(no.config?.cpf || "{{cliente.cpf}}", vars);
        const temCpf = cpfAtual && cpfAtual !== "{{cliente.cpf}}" && cpfAtual.replace(/\D/g,"").length >= 11;
        const maxTentativas = parseInt(no.config?.max_tentativas) || 3;
        const erroKey = "_cpf_erros_" + no.id;

        if (!temCpf) {
          // Se estava aguardando a digitação do CPF, salva e prossegue
          if (sessao._fluxo_aguardando === "cpf_lookup" && sessao._fluxo_no === no.id) {
            vars["cliente.cpf"] = mensagem;
            sessao._vars = vars;
            sessao._fluxo_aguardando = null;
            // Não avança — deixa o while rodar o nó novamente com o CPF preenchido
            no = dados.nodes?.find(n => n.id === no.id) || null;
            continue;
          }
          // Pergunta configurada? Envia e aguarda
          if (no.config?.pergunta) {
            await enviarFn(resolverVariavel(no.config.pergunta, vars));
            sessao._fluxo_no = no.id;
            sessao._fluxo_aguardando = "cpf_lookup";
            resultado = { tipo: "aguardando" };
            no = null;
            break;
          }
        }

        try {
          const { consultarClientes, verificarConexao } = await import("./erp.js");
          const cpf = resolverVariavel(no.config?.cpf || "{{cliente.cpf}}", vars);
          if (cpf && cpf !== "{{cliente.cpf}}") {
            const dados2 = await consultarClientes(cpf.replace(/\D/g, "")).catch(() => null);
            if (dados2 && !dados2.erro && dados2.nome) {
              const contratos = dados2.contratos || [];
              vars["cliente.nome"] = dados2.nome;
              vars["cliente.cpf"] = cpf;
              vars["cliente.cadastrado"] = "true";
              vars["cliente.contratos_total"] = String(contratos.length);

              if (contratos.length === 1) {
                const c0 = contratos[0];
                vars["cliente.contrato"] = c0.id?.toString() || "";
                vars["cliente.plano"]    = c0.plano || "";
                vars["cliente.status"]   = c0.status || "";
                vars["cliente.cidade"]   = c0.popNome || c0.cidade || dados2.cidade || "";
                sessao._vars = vars;

              } else if (contratos.length > 1) {
                const statusList = await Promise.all(
                  contratos.map(ct =>
                    verificarConexao(String(ct.id))
                      .then(r => ({ id: ct.id, online: r?.online || false }))
                      .catch(() => ({ id: ct.id, online: false }))
                  )
                );

                sessao._contratos_disponiveis = contratos.map(ct => ({
                  id: String(ct.id), plano: ct.plano || "", status: ct.status || "",
                  cidade: ct.popNome || ct.cidade || "", end: ct.end || "",
                }));
                sessao._vars = vars;

                const modoContratos = no.config?.modo_contratos || "lista";
                const cabecalho = `Encontrei *${contratos.length} contratos* para *${dados2.nome.split(" ")[0]}*. Selecione qual deseja consultar:`;
                const emojisNum = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];

                if (modoContratos === "texto") {
                  // Modo texto: lista numerada com emoji
                  const linhas = contratos.slice(0, 10).map((ct, i) => {
                    const st = statusList.find(s => String(s.id) === String(ct.id));
                    const sinal = st?.online ? "🟢" : "🔴";
                    const end = ct.end ? ` — ${ct.end.slice(0, 40)}` : (ct.plano ? ` — ${ct.plano}` : "");
                    return `${emojisNum[i] || `${i+1}.`} ${sinal} *Contrato #${ct.id}*${end}`;
                  });
                  await enviarFn(`${cabecalho}\n\n${linhas.join("\n")}\n\nDigite o *número* do contrato:`);
                } else {
                  // Modo lista (WhatsApp list)
                  const rows = contratos.slice(0, 10).map(ct => {
                    const st = statusList.find(s => String(s.id) === String(ct.id));
                    const icon = st?.online ? "🟢" : "🔴";
                    return {
                      id: String(ct.id),
                      title: `${icon} Contrato #${ct.id}`,
                      description: (ct.end || ct.plano || "Sem endereço").slice(0, 72),
                    };
                  });
                  await enviarListaFn(cabecalho, "Ver contratos", [{ title: "Seus contratos", rows }]);
                }

                sessao._fluxo_no = no.id;
                sessao._fluxo_aguardando = "contrato";
                resultado = { tipo: "aguardando", sessaoAtualizada: { ...sessao } };
                no = null;
                break;
              }
            } else {
              // CPF não encontrado — incrementa contador de erros
              sessao[erroKey] = (sessao[erroKey] || 0) + 1;
              sessao._vars = vars;

              if (sessao[erroKey] >= maxTentativas) {
                // Esgotou tentativas — sai pela porta max_tentativas
                logger.warn('⚠️ Max tentativas CPF atingido: ' + sessao[erroKey]);
                sessao[erroKey] = 0;
                sessao._fluxo_aguardando = null;
                vars["cliente.cadastrado"] = "false";
                sessao._vars = vars;
                no = proximoNo(dados, no.id, "max_tentativas") || proximoNo(dados, no.id, "nao_encontrado") || null;
                continue;
              } else {
                // Ainda tem tentativas — mostra erro e pede de novo
                const msgErro = no.config?.mensagem_erro || "CPF/CNPJ não encontrado. Verifique e tente novamente.";
                const restantes = maxTentativas - sessao[erroKey];
                await enviarFn(resolverVariavel(msgErro, vars) + (restantes < maxTentativas ? " (" + restantes + " tentativa" + (restantes > 1 ? "s" : "") + " restante" + (restantes > 1 ? "s" : "") + ")" : ""));
                if (no.config?.pergunta) {
                  await enviarFn(resolverVariavel(no.config.pergunta, vars));
                }
                sessao._fluxo_no = no.id;
                sessao._fluxo_aguardando = "cpf_lookup";
                resultado = { tipo: "aguardando" };
                no = null;
                break;
              }
            }
          }
        } catch(e) { logger.warn("⚠️ consultar_sgp: " + e.message); }

        if (!resultado) {
          // CPF encontrado com 1 contrato — reset contador e segue
          if (vars["cliente.cadastrado"] === "true") {
            sessao[erroKey] = 0;
          }
          no = proximoNo(dados, no.id, vars["cliente.cadastrado"] === "true" ? "encontrado" : "nao_encontrado") || null;
        }
        continue;
      }

      case "verificar_status": {
        // Lê o status já disponível na sessão (preenchido pelo consultar_cliente)
        const statusRaw = resolverVariavel("{{cliente.status}}", vars) || "";
        const s = statusRaw.toLowerCase().trim();

        // Mapeia para a porta correta
        let porta;
        if      (s === "1" || s === "ativo")                                         porta = "ativo";
        else if (s === "2" || s === "inativo")                                        porta = "inativo";
        else if (s === "3" || s === "cancelado")                                      porta = "cancelado";
        else if (s === "4" || s === "suspenso")                                       porta = "suspenso";
        else if (s === "5" || s.includes("inviabilidade"))                            porta = "inviabilidade";
        else if (s === "6" || s === "novo")                                           porta = "novo";
        else if (s === "7" || s.includes("reduzida") || s === "reduzido")             porta = "reduzido";
        else porta = "ativo"; // fallback seguro

        logger.info(`⚙️ verificar_status: "${statusRaw}" → porta "${porta}"`);
        no = proximoNo(dados, no.id, porta) || proximoNo(dados, no.id) || null;
        continue;
      }

      case "consultar_boleto":
      case "gerar_boleto": {
        const emojisB = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
        const modoBoletos = no.config?.modo_boletos || "texto";

        // ── PRIORIDADE 1: aguardando seleção de boleto ───────────────────────
        if (sessao._fluxo_aguardando === "boleto_selecao" && sessao._fluxo_no === no.id && sessao._boletos_disponiveis) {
          const boletosList = sessao._boletos_disponiveis;
          const msgLimpa = (mensagem || "").replace(/[^0-9]/g, "");
          const numDigitado = parseInt(msgLimpa) - 1;
          const escolhidoB =
            boletosList.find(b => b.id === mensagem?.trim()) ||
            boletosList.find(b => b.id === msgLimpa) ||
            (numDigitado >= 0 && numDigitado < boletosList.length ? boletosList[numDigitado] : null) ||
            null;

          if (escolhidoB) {
            vars["boleto.valor"]      = escolhidoB.valor;
            vars["boleto.vencimento"] = escolhidoB.vencimento;
            vars["boleto.link"]       = escolhidoB.link;
            vars["boleto.pix"]        = escolhidoB.pix;
            sessao._fluxo_aguardando = null;
            sessao._boletos_disponiveis = null;
            sessao._vars = vars;
            // Envia o boleto escolhido diretamente
            const msgBoleto = resolverVariavel(no.config?.mensagem_boleto ||
              "📄 *Boleto CITmax*\n\n💰 Valor: *R$ {{boleto.valor}}*\n📅 Vencimento: {{boleto.vencimento}}\n\n🔗 {{boleto.link}}\n\n💠 PIX copia e cola:\n{{boleto.pix}}", vars);
            await enviarFn(msgBoleto);
            no = proximoNo(dados, no.id, "encontrado") || null;
            continue;
          }
          // Não reconheceu — reapresenta a lista
          const bCabeca = `Não entendi. Digite o *número* do boleto (1 a ${boletosList.length}):`;
          await enviarFn(bCabeca);
          no = null;
          resultado = { tipo: "aguardando", sessaoAtualizada: { ...sessao } };
          break;
        }

        // ── PRIORIDADE 2: pede contrato se não tiver ─────────────────────────
        const contratoAtual2 = resolverVariavel(no.config?.contrato || "{{cliente.contrato}}", vars);
        const temContrato2 = contratoAtual2 && contratoAtual2 !== "{{cliente.contrato}}";
        if (!temContrato2) {
          if (sessao._fluxo_aguardando === "contrato_lookup" && sessao._fluxo_no === no.id) {
            vars["cliente.contrato"] = (mensagem || "").replace(/\D/g,"") || mensagem;
            sessao._vars = vars;
            sessao._fluxo_aguardando = null;
            no = dados.nodes?.find(n => n.id === no.id) || null;
            continue;
          }
          if (no.config?.pergunta) {
            await enviarFn(resolverVariavel(no.config.pergunta, vars));
            sessao._fluxo_no = no.id;
            sessao._fluxo_aguardando = "contrato_lookup";
            resultado = { tipo: "aguardando" };
            no = null;
            break;
          }
        }

        // ── PRIORIDADE 3: busca boletos via segundaViaBoleto ─────────────────
        try {
          const contratoId = resolverVariavel(no.config?.contrato || "{{cliente.contrato}}", vars);
          const cpfId      = resolverVariavel("{{cliente.cpf}}", vars);
          if (contratoId && contratoId !== "{{cliente.contrato}}") {
            const { segundaViaBoleto } = await import("./erp.js");
            const res = await segundaViaBoleto(cpfId || "00000000000", contratoId).catch(() => null);

            if (!res || res.erro || res.status === "sem_boleto") {
              // Nenhum boleto — envia mensagem configurada ou padrão e sai por nao_encontrado
              const msgSemBoleto = resolverVariavel(
                no.config?.mensagem_sem_boleto || "✅ Não encontrei nenhum boleto em aberto para o contrato *#{{cliente.contrato}}*. Sua conta está em dia! 🎉",
                vars
              );
              await enviarFn(msgSemBoleto);
              no = proximoNo(dados, no.id, "nao_encontrado") || proximoNo(dados, no.id) || null;

            } else if (res.status === "multiplos_boletos") {
              // Múltiplos boletos — lista para o cliente escolher
              sessao._boletos_disponiveis = res.lista.map(b => ({
                id: String(b.fatura_id || b.indice),
                valor:      String(b.valor_cobrado || ""),
                vencimento: String(b.vencimento_atual || ""),
                link:       String(b.link_cobranca || ""),
                pix:        String(b.pix_copia_cola || ""),
              }));
              sessao._vars = vars;
              const cab = `Encontrei *${res.total} boletos em aberto* para *${res.cliente?.split(" ")[0] || "você"}*. Selecione qual deseja:`;

              if (modoBoletos === "lista") {
                const rows = sessao._boletos_disponiveis.map(b => ({
                  id: b.id, title: `R$ ${b.valor}`, description: `Venc. ${b.vencimento}`,
                }));
                await enviarListaFn(cab, "Ver boletos", [{ title: "Boletos em aberto", rows }]);
              } else {
                const linhas = sessao._boletos_disponiveis.map((b, i) =>
                  `${emojisB[i]||`${i+1}.`} *R$ ${b.valor}* — venc. ${b.vencimento}`
                ).join("\n");
                await enviarFn(`${cab}\n\n${linhas}\n\nDigite o *número* do boleto:`);
              }
              sessao._fluxo_no = no.id;
              sessao._fluxo_aguardando = "boleto_selecao";
              resultado = { tipo: "aguardando", sessaoAtualizada: { ...sessao } };
              no = null;

            } else if (res.status === "boleto_encontrado") {
              // 1 boleto — preenche vars e envia diretamente
              vars["boleto.valor"]      = String(res.valor_cobrado || "");
              vars["boleto.vencimento"] = String(res.vencimento_atual || "");
              vars["boleto.link"]       = String(res.link_cobranca || "");
              vars["boleto.pix"]        = String(res.pix_copia_cola || "");
              sessao._vars = vars;
              const msgBoleto1 = resolverVariavel(no.config?.mensagem_boleto ||
                "📄 *Boleto CITmax*\n\n💰 Valor: *R$ {{boleto.valor}}*\n📅 Vencimento: {{boleto.vencimento}}\n\n🔗 {{boleto.link}}\n\n💠 PIX copia e cola:\n{{boleto.pix}}", vars);
              await enviarFn(msgBoleto1);
              no = proximoNo(dados, no.id, "encontrado") || proximoNo(dados, no.id) || null;
            }
          }
        } catch(e) { logger.warn("⚠️ gerar_boleto: " + e.message); }
        if (!resultado && !no) no = proximoNo(dados, no.id) || null;
        continue;
      }

      case "abrir_chamado": {
        try {
          const contratoId = resolverVariavel(no.config?.contrato || "{{cliente.contrato}}", vars);
          const descricao = resolverVariavel(no.config?.descricao || "Chamado aberto via WhatsApp", vars);
          const tipo = no.config?.tipo_id || "5";
          if (contratoId && contratoId !== "{{cliente.contrato}}") {
            const { criarChamado } = await import("./erp.js");
            const r = await criarChamado(contratoId, tipo, descricao, {
              contato_telefone: telefone, usuario: "maxxi",
            }).catch(() => null);
            if (r?.ok) {
              vars["chamado.protocolo"] = r.protocolo || r.numero_chamado || "";
              sessao._vars = vars;
            }
          }
        } catch(e) { logger.warn("⚠️ abrir_chamado: " + e.message); }
        no = proximoNo(dados, no.id) || null;
        continue;
      }

      case "promessa_pagamento": {
        try {
          const contratoId = resolverVariavel("{{cliente.contrato}}", vars);
          const statusAtual = (resolverVariavel("{{cliente.status}}", vars) || "").toLowerCase();

          if (!contratoId || contratoId === "{{cliente.contrato}}") {
            logger.warn("⚠️ promessa_pagamento: contrato não disponível na sessão");
            no = proximoNo(dados, no.id, "erro") || null;
            continue;
          }

          // ── Verifica elegibilidade pelo status antes de chamar o SGP ────────
          // Apenas Suspenso (4) e Ativo V. Reduzida (7) podem fazer promessa
          const isAtivo       = statusAtual === "ativo" || statusAtual === "1";
          const isElegivel    = statusAtual === "suspenso" || statusAtual === "4" ||
                                statusAtual === "ativo v. reduzida" || statusAtual === "7" ||
                                statusAtual === "reduzido";
          const isNaoElegivel = statusAtual === "cancelado" || statusAtual === "3" ||
                                statusAtual === "inativo" || statusAtual === "2" ||
                                statusAtual === "inviabilidade técnica" || statusAtual === "5" ||
                                statusAtual === "novo" || statusAtual === "6";

          if (isAtivo) {
            // Contrato ativo — não precisa de promessa
            const msgAdim = resolverVariavel(
              no.config?.mensagem_adimplente ||
              "✅ *Boa notícia, {{cliente.nome}}!*\n\nSeu contrato *#{{cliente.contrato}}* já está *ativo e em dia*. Não há necessidade de promessa de pagamento. 🎉\n\nPosso te ajudar com mais alguma coisa?",
              vars
            );
            await enviarFn(msgAdim);
            no = proximoNo(dados, no.id, "adimplente") || proximoNo(dados, no.id) || null;
            continue;
          }

          if (isNaoElegivel) {
            // Status não permite promessa (cancelado, inativo, etc.)
            vars["promessa.motivo"] = `Contrato com status "${statusAtual}" não é elegível para promessa de pagamento.`;
            sessao._vars = vars;
            const msgErro = resolverVariavel(
              no.config?.mensagem_erro ||
              "❌ Não foi possível registrar a promessa de pagamento.\n\n*Motivo:* {{promessa.motivo}}\n\nPosso te transferir para um atendente para resolver isso. Deseja?",
              vars
            );
            await enviarFn(msgErro);
            no = proximoNo(dados, no.id, "erro") || null;
            continue;
          }

          // ── Elegível (Suspenso ou V. Reduzida) — chama o SGP ────────────────
          const { promessaPagamento } = await import("./erp.js");
          const r = await promessaPagamento(contratoId).catch(() => null);

          if (r?.liberado) {
            // ✅ Promessa registrada com sucesso
            vars["promessa.dias"]      = String(r.liberado_dias || 3);
            vars["promessa.data"]      = String(r.data_promessa || "");
            vars["promessa.protocolo"] = String(r.protocolo || "");
            sessao._vars = vars;
            const msgOk = resolverVariavel(
              no.config?.mensagem_sucesso ||
              "✅ *Promessa de pagamento registrada!*\n\nSeu acesso foi liberado por *{{promessa.dias}} dias*.\n📅 Pague até: *{{promessa.data}}*\n🔑 Protocolo: {{promessa.protocolo}}\n\n⚠️ Após este prazo o acesso será bloqueado novamente.\nEssa opção está disponível *1x por mês*. 🙏",
              vars
            );
            await enviarFn(msgOk);
            no = proximoNo(dados, no.id, "sucesso") || proximoNo(dados, no.id) || null;

          } else {
            // SGP retornou erro (ex: já usou no mês)
            const msgSgp = (r?.msg || r?.erro || "").toLowerCase();
            // SGP pode retornar "ativo" mesmo sendo suspenso em alguns casos
            if (msgSgp.includes("ativo") || msgSgp.includes("adimplente") || msgSgp.includes("em dia")) {
              const msgAdim2 = resolverVariavel(
                no.config?.mensagem_adimplente ||
                "✅ Seu contrato já está ativo! Não há necessidade de promessa de pagamento.",
                vars
              );
              await enviarFn(msgAdim2);
              no = proximoNo(dados, no.id, "adimplente") || null;
            } else {
              vars["promessa.motivo"] = r?.msg || r?.erro || "Não foi possível registrar a promessa.";
              sessao._vars = vars;
              const msgErro2 = resolverVariavel(
                no.config?.mensagem_erro ||
                "❌ Não foi possível registrar a promessa de pagamento.\n\n*Motivo:* {{promessa.motivo}}\n\nPosso te transferir para um atendente para resolver isso. Deseja?",
                vars
              );
              await enviarFn(msgErro2);
              no = proximoNo(dados, no.id, "erro") || null;
            }
          }
        } catch(e) {
          logger.warn("⚠️ promessa_pagamento: " + e.message);
          no = proximoNo(dados, no.id, "erro") || null;
        }
        continue;
      }

      case "ia_roteador": {
        // ── PRIORIDADE 1: já aguardando resposta do cliente ───────────────────
        if (sessao._fluxo_aguardando === "roteador" && sessao._fluxo_no === no.id) {
          sessao._fluxo_aguardando = null;
          // Cai para classificação abaixo
        } else {
          // ── Envia mensagem inicial e aguarda ──────────────────────────────
          const msgInicial = resolverVariavel(
            no.config?.mensagem || "Posso te ajudar com mais alguma coisa? 😊",
            vars
          );
          await enviarFn(msgInicial);
          sessao._fluxo_no = no.id;
          sessao._fluxo_aguardando = "roteador";
          resultado = { tipo: "aguardando" };
          no = null;
          break;
        }

        // ── PRIORIDADE 2: classifica a intenção com Haiku ────────────────────
        try {
          const rotas = Array.isArray(no.config?.rotas) ? no.config.rotas : [];

          if (!rotas.length) {
            // Sem rotas configuradas — vai direto para nao_entendeu
            no = proximoNo(dados, no.id, "nao_entendeu") || null;
            continue;
          }

          // Detecta despedida antes de chamar a IA
          const despedida = /^(obrigad|valeu|vlw|não|nao|tchau|encerr|até|flw|ok|certo|tudo|fechou?|nada|por enquanto|por ora)[^\w]*/i.test((mensagem||"").trim());
          if (despedida) {
            no = proximoNo(dados, no.id, "encerrar") || null;
            continue;
          }

          // Monta prompt de classificação
          const rotasDesc = rotas.map(r =>
            `- "${r.id}": ${r.label || r.id}${r.descricao ? ` (${r.descricao})` : ''}`
          ).join("\n");

          const systemClass = `Você é um classificador de intenções. Analise a mensagem e escolha UMA das rotas abaixo, ou "nao_entendeu" se nenhuma se encaixar.

Rotas disponíveis:
${rotasDesc}
- "encerrar": cliente quer encerrar, disse obrigado, tchau ou não precisa de mais nada

Responda APENAS com o ID da rota escolhida, sem mais nada. Exemplo: boleto`;

          const { iaFluxo } = await import("../agent.js");
          const r = await iaFluxo({
            modelo: "claude-haiku-4-5-20251001",
            provedor: "anthropic",
            system: systemClass,
            history: [],
            content: mensagem,
            tools: [],
            toolsOAI: [],
            sess: {},
          });

          const portaIA = (r?.text || r?.reply || "").trim().toLowerCase()
            .replace(/[^a-z0-9_]/g, "").slice(0, 40);

          // Valida que a porta existe
          const idsValidos = [...rotas.map(r => r.id), "nao_entendeu", "encerrar"];
          const porta = idsValidos.includes(portaIA) ? portaIA : "nao_entendeu";

          logger.info(`🧭 ia_roteador: "${mensagem?.slice(0,30)}" → porta "${porta}"`);
          vars["roteador.intencao"] = porta;
          sessao._vars = vars;

          no = proximoNoOuAlias(dados, no.id, porta) || proximoNoOuAlias(dados, no.id, "nao_entendeu") || null;

        } catch(e) {
          logger.warn("⚠️ ia_roteador: " + e.message);
          no = proximoNo(dados, no.id, "nao_entendeu") || null;
        }
        continue;
      }

      case "ia_responde": {
        try {
          const { iaFluxo } = await import("../agent.js");
          const { tools: allTools, executeTool } = await import("../tools/index.js");

          // ── Configurações do nó ───────────────────────────────────────────
          const contexto     = no.config?.contexto || "geral";
          const promptExtra  = no.config?.prompt || "";
          const maxTurnos    = parseInt(no.config?.max_turns) || 5;
          const modeloCfg    = no.config?.modelo || "haiku";
          const toolsAtivas  = no.config?.tools_ativas || ["segunda_via_boleto","criar_chamado","verificar_conexao","promessa_pagamento"];

          // Mapeia alias do modelo para string real
          const MODELOS = {
            "haiku":   { m: "claude-haiku-4-5-20251001",  p: "anthropic" },
            "sonnet":  { m: "claude-sonnet-4-5-20251016", p: "anthropic" },
            "gpt-4o-mini": { m: "gpt-4o-mini",            p: "openai" },
          };
          const { m: modelo, p: provedor } = MODELOS[modeloCfg] || MODELOS["haiku"];

          // ── Monta contexto do cliente a partir das vars do fluxo ──────────
          const ctxCliente = Object.entries(vars)
            .filter(([k]) => k.startsWith("cliente.") || k === "protocolo" || k === "saudacao")
            .map(([k, v]) => v ? `${k}: ${v}` : null)
            .filter(Boolean)
            .join("\n");

          const system = [
            `Você é a Maxxi, atendente virtual da CITmax (fibra em Natal/RN).`,
            `Contexto da conversa: ${contexto}.`,
            ctxCliente ? `\n📋 Dados do cliente identificado:\n${ctxCliente}` : "",
            promptExtra ? `\nInstrução específica: ${promptExtra}` : "",
            `\nUse as ferramentas disponíveis quando necessário. Já tem os dados do cliente, não precisa pedí-los novamente.`,
            `Responda em português, de forma simpática e objetiva.`,
          ].filter(Boolean).join("\n");

          // ── Seleciona tools habilitadas para este nó ──────────────────────
          const TOOLS_FIXAS = ["transferir_para_humano", "encerrar_atendimento"];
          const nomesSelecionados = [...new Set([...toolsAtivas, ...TOOLS_FIXAS])];

          const toolsClaude = allTools.filter(t => nomesSelecionados.includes(t.name));
          const toolsGPT    = toolsClaude.map(t => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.input_schema || { type:"object", properties:{} } },
          }));

          // ── Controla turnos restantes ─────────────────────────────────────
          const turnosKey = "_ia_turnos_" + no.id;
          const turnosUsados = sessao[turnosKey] || 0;

          if (turnosUsados >= maxTurnos) {
            // Esgotou — sai pela porta max_turnos
            logger.warn(`⚠️ ia_responde: max_turnos(${maxTurnos}) atingido`);
            sessao[turnosKey] = 0;
            sessao._vars = vars;
            no = proximoNo(dados, no.id, "max_turnos") || proximoNo(dados, no.id, "transferir") || null;
            continue;
          }

          // ── Histórico da conversa (mantém contexto entre turnos) ──────────
          const histKey = "_ia_hist_" + no.id;
          const history = sessao[histKey] || [];

          // ── Chama a IA ────────────────────────────────────────────────────
          const r = await iaFluxo({
            contexto, prompt: promptExtra, modelo, provedor,
            system, history, content: mensagem,
            tools: toolsClaude, toolsOAI: toolsGPT,
            sess: { ...sessao, cpfcnpj: vars["cliente.cpf"], contrato_ativo: vars["cliente.contrato"], nome: vars["cliente.nome"] },
          });

          // ── Executa tool calls se houver ──────────────────────────────────
          let reply = r?.text || r?.reply || "";
          const toolCalls = r?.tool_calls || r?.toolCalls || [];

          for (const tc of toolCalls) {
            try {
              const result = await executeTool(tc.name || tc.function?.name, tc.input || JSON.parse(tc.function?.arguments || "{}"));
              // Encerrar/Transferir via tool da IA
              if (tc.name === "encerrar_atendimento" || tc.function?.name === "encerrar_atendimento") {
                sessao[turnosKey] = 0;
                sessao[histKey] = [];
                no = proximoNo(dados, no.id, "resolvido") || null;
                continue;
              }
              if (tc.name === "transferir_para_humano" || tc.function?.name === "transferir_para_humano") {
                const motivo = tc.input?.motivo || tc.function?.arguments?.motivo || "Transferido pela IA do fluxo";
                await transferirFn(motivo + "\n\n" + ctxCliente);
                sessao[turnosKey] = 0;
                sessao[histKey] = [];
                sessao._fluxo_no = null;
                resultado = { tipo: "transferido" };
                no = null;
                break;
              }
              // Formata resultado para incluir na resposta
              if (result && !reply) {
                reply = typeof result === "string" ? result : JSON.stringify(result);
              }
            } catch(te) { logger.warn("⚠️ ia_responde tool: " + te.message); }
          }

          // ── Envia resposta ────────────────────────────────────────────────
          if (reply) {
            await enviarFn(reply);
            resultado = { tipo: "ia", reply };
          }

          // ── Atualiza contadores e histórico ───────────────────────────────
          sessao[turnosKey] = turnosUsados + 1;
          sessao[histKey] = [...history, { role:"user", content: mensagem }, { role:"assistant", content: reply }].slice(-20);
          sessao._vars = vars;

          // ── Roteamento ────────────────────────────────────────────────────
          const transferiu = r?.transferir || toolCalls.some(tc => (tc.name || tc.function?.name) === "transferir_para_humano");
          const resolveu   = r?.resolve || r?.resolved;

          if (!resultado || resultado.tipo === "ia") {
            const porta = transferiu ? "transferir" : resolveu ? "resolvido" : null;
            if (porta) {
              sessao[turnosKey] = 0;
              sessao[histKey] = [];
              no = proximoNo(dados, no.id, porta) || null;
              if (no) { continue; }
            }
            // Ainda aguardando mais mensagens do cliente
            sessao._fluxo_no = no.id;
            sessao._fluxo_aguardando = "ia";
            resultado = { tipo: "aguardando", sessaoAtualizada: { ...sessao } };
            no = null;
          }

        } catch(e) {
          logger.warn("⚠️ ia_responde: " + e.message);
          no = proximoNo(dados, no.id, "transferir") || proximoNo(dados, no.id) || null;
          continue;
        }
        break;
      }

      case "transferir_agente": {
        const motivo = resolverVariavel(no.config?.motivo || "Transferência via fluxo", vars);
        const contextoTransf = Object.entries(vars).map(([k,v]) => `${k}: ${v}`).join("\n");
        await transferirFn(motivo + "\n\n" + contextoTransf);
        sessao._fluxo_no = null;
        resultado = { tipo: "transferido" };
        no = null;
        break;
      }

      case "enviar_flow": {
        // Envia WhatsApp Flow interativo para o cliente
        // Aguarda o retorno do flow completado via webhook
        if (sessao._fluxo_aguardando === "flow" && sessao._fluxo_no === no.id) {
          // Flow foi completado — dados chegam via webhook como mensagem especial
          // O webhook salva os dados do flow em vars.flow_dados
          if (vars.flow_dados) {
            sessao._fluxo_aguardando = null;
            no = proximoNoOuAlias(dados, no.id, "concluido") || proximoNo(dados, no.id) || null;
            continue;
          }
          // Ainda aguardando
          resultado = { tipo: "aguardando" };
          no = null;
          break;
        }
        // Envio inicial do Flow
        const flowId = resolverVariavel(no.config?.flow_id || "", vars);
        const headerText = resolverVariavel(no.config?.header || "CITmax Internet", vars);
        const bodyText = resolverVariavel(no.config?.corpo || "Preencha o formulário para contratar:", vars);
        const actionLabel = resolverVariavel(no.config?.botao || "📋 Fazer cadastro", vars);
        const flowToken = no.config?.flow_token || "FLOW_TOKEN_CITMAX";

        if (!flowId) {
          await enviarFn("⚠️ Flow não configurado. Fale com o suporte.");
          no = proximoNoOuAlias(dados, no.id, "erro") || null;
          break;
        }

        try {
          const { getCanal } = await import("./canais.js");
          const canal = await getCanal("whatsapp");
          const cfg = canal?.config || {};
          const token = cfg.accessToken || process.env.WHATSAPP_TOKEN;
          const phoneNumberId = cfg.phoneNumberId || process.env.WHATSAPP_PHONE_ID;

          const payload = {
            messaging_product: "whatsapp",
            to: telefone,
            type: "interactive",
            interactive: {
              type: "flow",
              header: { type: "text", text: headerText },
              body: { text: bodyText },
              footer: { text: "CITmax — Internet de verdade" },
              action: {
                name: "flow",
                parameters: {
                  flow_message_version: "3",
                  flow_token: flowToken,
                  flow_id: flowId,
                  flow_cta: actionLabel,
                  flow_action: "navigate",
                  flow_action_payload: { screen: "TELA_CEP" },
                },
              },
            },
          };
          await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
          });
        } catch(e) {
          logger.error(`❌ Erro ao enviar Flow: ${e.message}`);
        }

        sessao._fluxo_no = no.id;
        sessao._fluxo_aguardando = "flow";
        resultado = { tipo: "aguardando" };
        no = null;
        break;
      }

      case "encerrar": {
        const msg = resolverVariavel(no.config?.mensagem || "Atendimento encerrado. Obrigado! 😊", vars);
        if (msg) await enviarFn(msg);
        // Reset COMPLETO — próxima mensagem começa do zero
        sessao._fluxo_no = null;
        sessao._fluxo_aguardando = null;
        sessao._vars = {};
        sessao._estado = "inicio";
        sessao._cadastro = null;
        sessao.cpfcnpj = null;
        sessao.nome = null;
        sessao.contratos = null;
        sessao.contrato_ativo = null;
        sessao._protocolo = null;
        sessao._intencao_pendente = null;
        sessao._resetado = true;
        resultado = { tipo: "encerrado", sessaoAtualizada: { ...sessao } };
        no = null;
        break;
      }

      default:
        logger.warn(`⚠️ Tipo de nó desconhecido: ${no.tipo}`);
        no = proximoNo(dados, no.id) || null;
        continue;
    }

    // Se chegou aqui via break (aguardando/encerrado), sai do while
    break;
  }

  // Sempre inclui sessaoAtualizada para que o webhook salve a sessão corretamente
  if (resultado && !resultado.sessaoAtualizada) {
    resultado.sessaoAtualizada = { ...sessao };
  }
  // Nunca retorna null — se o motor processou algo mas não gerou resultado explícito
  // (ex: cadeia enviar_texto → fim sem nó seguinte), retorna "fim" para o webhook parar
  if (!resultado) {
    resultado = { tipo: "fim", sessaoAtualizada: { ...sessao } };
  }
  return resultado;
}
