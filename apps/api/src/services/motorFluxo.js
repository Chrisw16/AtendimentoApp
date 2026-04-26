/**
 * motorFluxo.js — Motor de execução de fluxos de atendimento
 * Suporta todos os 30+ tipos de nó do editor visual
 * Credenciais lidas do banco via integrations.js
 */
import { getDb }          from '../config/db.js';
import { conversaRepo }   from '../repositories/conversaRepository.js';
import { mensagemRepo }   from '../repositories/mensagemRepository.js';
import { broadcast }      from './sseManager.js';
import { resolverPrompt } from './promptService.js';
import {
  getAnthropicClient,
  consultarClientes, segundaViaBoleto, promessaPagamento,
  criarChamado, verificarConexao, listarPlanos, consultarManutencao,
  sgpBuscarCliente, sgpBuscarBoletos, sgpVerificarStatus,
  sgpAbrirChamado, sgpPromessaPagamento, sgpListarPlanos,
  evolutionEnviarTexto, evolutionEnviarBotoes, evolutionEnviarLista,
  evolutionEnviarCTA, evolutionEnviarImagem, evolutionEnviarAudio,
  evolutionEnviarArquivo,
} from './integrations.js';

// Estado de execução em memória (por conversa_id)
const estadosExecucao = new Map();

// ── ENTRY POINT ───────────────────────────────────────────────────
export async function processarConversa(conversa, mensagemCliente) {
  const db = getDb();

  // Busca fluxo ativo — usa campo dados (editor visual) com fallback para nos/conexoes
  const fluxo = await db('fluxos').where({ ativo: true }).first();
  if (!fluxo) return processarIADireta(conversa, mensagemCliente);

  const dados = parseDados(fluxo);
  console.log(`[Motor] Fluxo "${fluxo.nome}": ${dados.nodes?.length || 0} nós, ${dados.edges?.length || 0} edges`);
  if (!dados.nodes?.length) {
    console.warn('[Motor] Fluxo sem nós — caindo para IA direta');
    return processarIADireta(conversa, mensagemCliente);
  }

  let estado = estadosExecucao.get(conversa.id) || {
    noAtual:  null,
    contexto: { cliente: {} },
    historico: [],
    aguardando: null,
  };

  // Se não tem nó atual, começa pelo nó de início
  if (!estado.noAtual) {
    const noInicio = dados.nodes.find(n => n.tipo === 'inicio' || n.tipo === 'gatilho_keyword');
    estado.noAtual = noInicio?.id;
  }
  if (!estado.noAtual) return processarIADireta(conversa, mensagemCliente);

  const ctx = {
    conversa, mensagem: mensagemCliente,
    dados, estado, db, respostas: [],
    instancia: conversa.canal_instancia || conversa.canal || 'default',
    numero:    conversa.telefone,
  };

  let iteracoes = 0;
  while (iteracoes++ < 15) {
    const no = dados.nodes.find(n => n.id === ctx.estado.noAtual);
    if (!no) {
      console.warn(`[Motor] Nó não encontrado: ${ctx.estado.noAtual} — encerrando`);
      break;
    }

    console.log(`[Motor] Executando nó: ${no.tipo} (id=${no.id})`);
    let resultado;
    try {
      resultado = await processarNo(no, ctx);
    } catch (err) {
      console.error(`[Motor] Erro no nó ${no.tipo}:`, err.message, err.stack?.split('\n')[1]);
      ctx.respostas.push({ tipo: 'texto', texto: `⚠️ Erro interno: ${err.message.slice(0, 100)}` });
      resultado = { tipo: 'fim' };
    }

    console.log(`[Motor] Resultado nó ${no.tipo}: tipo=${resultado.tipo} saida=${resultado.saida}`);

    if (resultado.tipo === 'aguardar_input') {
      estadosExecucao.set(conversa.id, ctx.estado);
      break;
    }
    if (resultado.tipo === 'avancar') {
      const proxId = encontrarProximo(no.id, resultado.saida, dados.edges);
      console.log(`[Motor] Próximo nó: ${proxId || 'NENHUM (fim do fluxo)'}`);
      if (!proxId) { estadosExecucao.delete(conversa.id); break; }
      ctx.estado.noAtual = proxId;
      continue;
    }
    if (resultado.tipo === 'fim') {
      estadosExecucao.delete(conversa.id);
      break;
    }
    break;
  }

  console.log(`[Motor] Respostas geradas: ${ctx.respostas.length}`);
  for (const resp of ctx.respostas) {
    await enviarResposta(conversa, resp, ctx.instancia);
  }
}

// ── DESPACHANTE ───────────────────────────────────────────────────
async function processarNo(no, ctx) {
  const cfg = no.config || {};
  switch (no.tipo) {

    // ── GATILHOS ──────────────────────────────────────────────────
    case 'inicio':
      ctx.estado.contexto = { cliente: {} };
      return avancar('saida');

    case 'gatilho_keyword':
      return avancar('saida');

    // ── MENSAGENS ─────────────────────────────────────────────────
    case 'enviar_texto': {
      const texto = interpolar(cfg.texto || '', ctx);
      ctx.respostas.push({ tipo: 'texto', texto });
      return avancar('saida');
    }

    case 'enviar_cta': {
      ctx.respostas.push({ tipo: 'cta', corpo: interpolar(cfg.corpo || '', ctx), label: cfg.label, url: interpolar(cfg.url || '', ctx) });
      return avancar('saida');
    }

    case 'enviar_imagem':
      ctx.respostas.push({ tipo: 'imagem', url: cfg.url, legenda: interpolar(cfg.legenda || '', ctx) });
      return avancar('saida');

    case 'enviar_audio':
      ctx.respostas.push({ tipo: 'audio', url: cfg.url });
      return avancar('saida');

    case 'enviar_arquivo':
      ctx.respostas.push({ tipo: 'arquivo', url: cfg.url, filename: cfg.filename });
      return avancar('saida');

    case 'enviar_localizacao':
      ctx.respostas.push({ tipo: 'localizacao', nome: cfg.nome, address: cfg.address, lat: cfg.lat, lng: cfg.lng });
      return avancar('saida');

    case 'enviar_botoes': {
      const bts = (cfg.botoes || []).filter(b => (typeof b === 'object' ? b.label : b));
      if (ctx.estado.aguardando === no.id) {
        // Já enviou — processa resposta
        ctx.estado.aguardando = null;
        const inp = ctx.mensagem.texto?.trim() || '';
        const match = bts.find(b => {
          const lbl = typeof b === 'object' ? b.label : b;
          const id  = typeof b === 'object' ? b.id   : b;
          return inp.toLowerCase() === lbl.toLowerCase() || inp === id;
        });
        const porta = match ? (typeof match === 'object' ? match.id : match.toLowerCase().replace(/\s+/g,'_')) : 'saida';
        return avancar(porta);
      }
      ctx.respostas.push({ tipo: 'botoes', corpo: interpolar(cfg.corpo || '', ctx), botoes: bts, ia_menu_ativo: cfg.ia_menu_ativo });
      ctx.estado.aguardando = no.id;
      return aguardar();
    }

    case 'enviar_lista': {
      let itens = cfg.itens || [];
      if (typeof itens === 'string') { try { itens = JSON.parse(itens); } catch { itens = []; } }
      if (!Array.isArray(itens)) itens = [];
      if (ctx.estado.aguardando === no.id) {
        ctx.estado.aguardando = null;
        const inp = ctx.mensagem.texto?.trim() || '';
        // Aceita número digitado (ex: "1", "2") além de título/id
      const num = parseInt(inp) - 1;
      const match = itens.find(it => inp.toLowerCase() === (it.titulo||'').toLowerCase() || inp === it.id)
        || (num >= 0 && num < itens.length ? itens[num] : null);
      return avancar(match ? match.id : 'saida');
      }
      ctx.respostas.push({ tipo: 'lista', corpo: interpolar(cfg.corpo || '', ctx), label_botao: cfg.label_botao, titulo_secao: cfg.titulo_secao, itens });
      ctx.estado.aguardando = no.id;
      return aguardar();
    }

    case 'solicitar_localizacao': {
      if (ctx.estado.aguardando === no.id) {
        ctx.estado.aguardando = null;
        if (cfg.variavel) ctx.estado.contexto[cfg.variavel] = ctx.mensagem.texto;
        return avancar('localizacao_recebida');
      }
      if (cfg.mensagem) ctx.respostas.push({ tipo: 'texto', texto: interpolar(cfg.mensagem, ctx) });
      ctx.estado.aguardando = no.id;
      return aguardar();
    }

    // ── LÓGICA ────────────────────────────────────────────────────
    case 'aguardar_resposta': {
      if (ctx.estado.aguardando === no.id) {
        ctx.estado.aguardando = null;
        const v = cfg.variavel || 'resposta';
        ctx.estado.contexto[v] = ctx.mensagem.texto || '';
        return avancar('saida');
      }
      if (cfg.mensagem) ctx.respostas.push({ tipo: 'texto', texto: interpolar(cfg.mensagem, ctx) });
      ctx.estado.aguardando = no.id;
      return aguardar();
    }

    case 'condicao': {
      const val = getCtxVal(ctx, cfg.variavel || '');
      const r = avaliarCondicao(val, cfg.operador || '==', cfg.valor || '');
      return avancar(r ? 'sim' : 'nao');
    }

    case 'condicao_multipla': {
      const ramos = cfg.ramos || [];
      for (const ramo of ramos) {
        const val = getCtxVal(ctx, ramo.variavel || '');
        if (avaliarCondicao(val, ramo.operador || '==', ramo.valor || '')) {
          return avancar(ramo.porta || 'ramo1');
        }
      }
      return avancar('default');
    }

    case 'definir_variavel': {
      if (cfg.variavel) ctx.estado.contexto[cfg.variavel] = interpolar(cfg.valor || '', ctx);
      return avancar('saida');
    }

    case 'divisao_ab': {
      const pct = cfg.pct_a || 50;
      return avancar(Math.random() * 100 < pct ? 'a' : 'b');
    }

    case 'aguardar_tempo': {
      // Em produção usar fila/job scheduler; aqui avança imediatamente
      const seg = cfg.segundos || 60;
      console.log(`[Motor] aguardar_tempo: ${seg}s (simulado)`);
      return avancar('saida');
    }

    // ── SGP / ERP ─────────────────────────────────────────────────
    case 'consultar_cliente': {
      if (ctx.estado.aguardando === no.id) {
        ctx.estado.aguardando = null;
        const tentativas = (ctx.estado.contexto._cpf_tentativas || 0) + 1;
        const cpf = (ctx.mensagem.texto || '').replace(/\D/g, '');

        if (cpf.length < 11) {
          if (tentativas >= (cfg.max_tentativas || 3)) return avancar('max_tentativas');
          ctx.estado.contexto._cpf_tentativas = tentativas;
          ctx.respostas.push({ tipo: 'texto', texto: cfg.mensagem_erro || 'CPF inválido. Tente novamente.' });
          ctx.estado.aguardando = no.id;
          return aguardar();
        }

        try {
          // usa consultarClientes — fiel ao erp.js original
          const data = await consultarClientes(cpf);
          if (data.erro || !data.contratos?.length) {
            if (tentativas >= (cfg.max_tentativas || 3)) return avancar('max_tentativas');
            ctx.estado.contexto._cpf_tentativas = tentativas;
            ctx.respostas.push({ tipo: 'texto', texto: cfg.mensagem_erro || data.mensagem || 'CPF não encontrado. Tente novamente.' });
            ctx.estado.aguardando = no.id;
            return aguardar();
          }

          // Preenche contexto com o primeiro contrato (mais relevante pela ordenação do SGP)
          const ct = data.contratos[0];
          ctx.estado.contexto.cliente = {
            nome:     data.nome,
            cpf:      data.cpfcnpj,
            contrato: String(ct.id),
            plano:    ct.plano,
            status:   ct.status,
            cidade:   ct.cidade || '',
            email:    data.email || '',
            popId:    ct.popId,
            titulos_abertos: ct.titulos_abertos,
            valor_aberto:    ct.valor_aberto,
          };
          ctx.estado.contexto._cpf_tentativas = 0;
          ctx.estado.contexto._contratos_sgp = data.contratos;

          if (data.contratos.length > 1) return avancar('multiplos_contratos');
          return avancar('encontrado');
        } catch (err) {
          console.error('[Motor] consultar_cliente:', err.message);
          return avancar('max_tentativas');
        }
      }

      // Já tem CPF no contexto
      const cpfExistente = ctx.estado.contexto.cliente?.cpf;
      if (cpfExistente) {
        try {
          const data = await consultarClientes(cpfExistente);
          if (!data.erro && data.contratos?.length) {
            const ct = data.contratos[0];
            ctx.estado.contexto.cliente = { ...ctx.estado.contexto.cliente, nome: data.nome, contrato: String(ct.id), plano: ct.plano, status: ct.status, cidade: ct.cidade || '' };
            ctx.estado.contexto._contratos_sgp = data.contratos;
            return avancar(data.contratos.length > 1 ? 'multiplos_contratos' : 'encontrado');
          }
        } catch (err) { console.error('[Motor] consultar_cliente (direto):', err.message); }
        return avancar('max_tentativas');
      }

      if (cfg.pergunta) ctx.respostas.push({ tipo: 'texto', texto: cfg.pergunta });
      ctx.estado.contexto._cpf_tentativas = 0;
      ctx.estado.aguardando = no.id;
      return aguardar();
    }

    case 'consultar_boleto': {
      const contrato = getCtxVal(ctx, 'cliente.contrato') || cfg.contrato;
      const cpf      = getCtxVal(ctx, 'cliente.cpf') || '';
      if (!contrato) {
        ctx.respostas.push({ tipo: 'texto', texto: 'Contrato não identificado. Por favor, informe seu CPF primeiro.' });
        return avancar('nao_encontrado');
      }
      // Se estava aguardando seleção de boleto entre múltiplos
      if (ctx.estado.aguardando === no.id && ctx.estado.contexto._boletos_disponiveis) {
        const lista = ctx.estado.contexto._boletos_disponiveis;
        const inp   = (ctx.mensagem.texto || '').replace(/\D/g, '');
        const idx   = parseInt(inp) - 1;
        const esc   = lista[idx] || lista.find(b => b.id === inp) || null;
        if (esc) {
          ctx.estado.aguardando = null;
          ctx.estado.contexto._boletos_disponiveis = null;
          ctx.estado.contexto.boleto = { valor: esc.valor, vencimento: esc.vencimento, link: esc.link, pix: esc.pix };
          const msg = interpolar(cfg.mensagem_boleto ||
            '📄 *Segunda via*\n\n💰 Valor: *R$ {{boleto.valor}}*\n📅 Vencimento: {{boleto.vencimento}}\n\n🔗 {{boleto.link}}\n\n💠 PIX copia e cola:\n{{boleto.pix}}', ctx);
          ctx.respostas.push({ tipo: 'texto', texto: msg });
          return avancar('encontrado');
        }
        ctx.respostas.push({ tipo: 'texto', texto: `Não entendi. Digite o número do boleto (1 a ${lista.length}):` });
        return aguardar();
      }
      try {
        // segundaViaBoleto(cpfcnpj, contrato) — POST /api/ura/fatura2via/
        const res = await segundaViaBoleto(cpf || '00000000000', contrato);
        if (!res || res.erro || res.status === 'sem_boleto') {
          const msgSem = cfg.mensagem_sem_boleto || '✅ Não encontrei boletos em aberto para o contrato *#{{cliente.contrato}}*. Sua conta está em dia! 🎉';
          ctx.respostas.push({ tipo: 'texto', texto: interpolar(msgSem, ctx) });
          return avancar('nao_encontrado');
        }
        if (res.status === 'multiplos_boletos') {
          ctx.estado.contexto._boletos_disponiveis = res.lista.map(b => ({
            id:         String(b.fatura_id || b.indice),
            valor:      String(b.valor_cobrado || ''),
            vencimento: String(b.vencimento_atual || ''),
            link:       String(b.link_cobranca || b.link_boleto || ''),
            pix:        String(b.pix_copia_cola || ''),
          }));
          const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
          const linhas = ctx.estado.contexto._boletos_disponiveis.map((b, i) =>
            `${emojis[i] || `${i+1}.`} *R$ ${b.valor}* — venc. ${b.vencimento}`
          ).join('\n');
          ctx.respostas.push({ tipo: 'texto', texto: `Encontrei *${res.total} boletos em aberto*. Qual deseja?\n\n${linhas}\n\nDigite o *número*:` });
          ctx.estado.aguardando = no.id;
          return aguardar();
        }
        // boleto_encontrado — único
        ctx.estado.contexto.boleto = {
          valor:      String(res.valor_cobrado || ''),
          vencimento: String(res.vencimento_atual || ''),
          link:       String(res.link_cobranca || res.link_boleto || ''),
          pix:        String(res.pix_copia_cola || ''),
          linha:      String(res.linha_digitavel || ''),
          vencido:    res.vencido ? 'Sim' : 'Não',
        };
        const msg = interpolar(cfg.mensagem_boleto ||
          '📄 *Segunda via*\n\n💰 Valor: *R$ {{boleto.valor}}*\n📅 Vencimento: {{boleto.vencimento}}\n\n🔗 {{boleto.link}}\n\n💠 PIX copia e cola:\n{{boleto.pix}}', ctx);
        ctx.respostas.push({ tipo: 'texto', texto: msg });
        return avancar('encontrado');
      } catch (err) {
        console.error('[Motor] consultar_boleto:', err.message);
        return avancar('nao_encontrado');
      }
    }

    case 'verificar_status': {
      // Lê o status já disponível na sessão (preenchido pelo consultar_cliente)
      // Idêntico ao sistema de inspiração — sem chamada extra ao SGP
      const statusRaw = getCtxVal(ctx, 'cliente.status') || '';
      const s = statusRaw.toLowerCase().trim();
      if      (s === '1' || s === 'ativo')                            return avancar('ativo');
      else if (s === '2' || s === 'inativo')                          return avancar('inativo');
      else if (s === '3' || s === 'cancelado')                        return avancar('cancelado');
      else if (s === '4' || s === 'suspenso')                         return avancar('suspenso');
      else if (s === '5' || s.includes('inviabilidade'))              return avancar('inviabilidade');
      else if (s === '6' || s === 'novo')                             return avancar('novo');
      else if (s === '7' || s.includes('reduzida') || s === 'reduzido') return avancar('reduzido');
      else return avancar('ativo'); // fallback seguro como no original
    }

    case 'abrir_chamado': {
      const contrato = getCtxVal(ctx, 'cliente.contrato');
      if (!contrato) return avancar('erro');
      try {
        // criarChamado(contrato, tipo, descricao) — fiel ao erp.js original
        const data = await criarChamado(
          contrato,
          cfg.tipo_id || 5,
          interpolar(cfg.descricao || 'Chamado aberto via GoCHAT', ctx)
        );
        ctx.estado.contexto.chamado = {
          protocolo: data.protocolo || data.id || '',
          aberto:    data.chamado_aberto,
          cliente:   data.cliente || '',
        };
        return avancar(data.chamado_aberto ? 'sucesso' : 'erro');
      } catch (err) {
        console.error('[Motor] abrir_chamado:', err.message);
        return avancar('erro');
      }
    }

    case 'promessa_pagamento': {
      const contrato = getCtxVal(ctx, 'cliente.contrato');
      if (!contrato) return avancar('erro');
      try {
        const data = await sgpPromessaPagamento(contrato);
        if (data.adimplente) {
          if (cfg.mensagem_adimplente) ctx.respostas.push({ tipo: 'texto', texto: cfg.mensagem_adimplente });
          return avancar('adimplente');
        }
        ctx.estado.contexto.promessa = { dias: data.dias || data.prazo_dias, data: data.data || data.data_limite, protocolo: data.protocolo || data.id };
        const msg = interpolar(cfg.mensagem_sucesso || '✅ Promessa registrada!\n📅 Pague até: {{promessa.data}}', ctx);
        ctx.respostas.push({ tipo: 'texto', texto: msg });
        return avancar('sucesso');
      } catch (err) {
        console.error('[Motor] promessa_pagamento:', err.message);
        ctx.estado.contexto.promessa = { motivo: err.message };
        if (cfg.mensagem_erro) ctx.respostas.push({ tipo: 'texto', texto: interpolar(cfg.mensagem_erro, ctx) });
        return avancar('erro');
      }
    }

    case 'listar_planos': {
      const cidade = interpolar(cfg.cidade || '{{cliente.cidade}}', ctx);
      try {
        // listarPlanos retorna array já normalizado com { id, descricao, valor, velocidade }
        const planos = await listarPlanos(cidade);
        ctx.estado.contexto.planos = {
          lista: planos.map((p, i) =>
            `${i+1}. *${p.descricao}*${p.velocidade ? ` (${p.velocidade})` : ''} — R$ ${p.valor}`
          ).join('\n'),
        };
        return avancar('saida');
      } catch (err) {
        console.error('[Motor] listar_planos:', err.message);
        ctx.estado.contexto.planos = { lista: 'Não foi possível listar os planos no momento.' };
        return avancar('saida');
      }
    }

    // ── NÓS DO SISTEMA DE INSPIRAÇÃO (stubs seguros) ─────────────
    case 'mudanca_endereco':
    case 'mudar_plano':
    case 'cadastrar_lead':
    case 'cadastrar_condominio':
    case 'registrar_ocorrencia_cond':
      // Nós avançados — agendam via texto e transferem para agente
      if (cfg.mensagem) ctx.respostas.push({ tipo: 'texto', texto: interpolar(cfg.mensagem, ctx) });
      return avancar('saida');

    case 'consultar_historico': {
      const contrato = getCtxVal(ctx, 'cliente.contrato');
      if (!contrato) {
        ctx.estado.contexto.historico = { resumo: 'Contrato não identificado.' };
        return avancar('saida');
      }
      try {
        // historicoOcorrencias — POST /api/ura/ocorrencia/list/
        const { historicoOcorrencias } = await import('./integrations.js');
        const lista = await historicoOcorrencias(contrato).catch(() => null);
        if (!lista?.length) {
          ctx.estado.contexto.historico = { resumo: 'Nenhum chamado encontrado.' };
        } else {
          ctx.estado.contexto.historico = {
            resumo: lista.slice(0, 5).map(o =>
              `#${o.numero} — ${o.tipo} (${o.status}) ${o.data_cadastro}`
            ).join('\n'),
          };
        }
      } catch (err) {
        ctx.estado.contexto.historico = { resumo: 'Histórico temporariamente indisponível.' };
      }
      return avancar('saida');
    }

    // ── IA ────────────────────────────────────────────────────────
    case 'ia_responde':
      return processarIAResponde(no, ctx);

    case 'ia_roteador':
      return processarIARoteador(no, ctx);

    // ── AÇÕES ─────────────────────────────────────────────────────
    case 'transferir_agente': {
      const horario = await verificarHorario(ctx.db);
      if (!horario.dentro) {
        const msg = cfg.msg_fora || 'Fora do horário de atendimento.';
        ctx.respostas.push({ tipo: 'texto', texto: msg });
        return avancar('fora_horario');
      }
      await conversaRepo.atualizar(ctx.conversa.id, { status: 'aguardando', aguardando_desde: new Date().toISOString(), agente_id: null });
      broadcast('conversa_atualizada', await conversaRepo.porId(ctx.conversa.id));
      estadosExecucao.delete(ctx.conversa.id);
      return fim();
    }

    case 'chamada_http': {
      const { url, method = 'GET', body: bodyTpl, variavel = 'http_resposta' } = cfg;
      if (!url) return avancar('erro');
      try {
        const opts = { method, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000) };
        if (bodyTpl && method !== 'GET') opts.body = interpolar(bodyTpl, ctx);
        const res  = await fetch(interpolar(url, ctx), opts);
        const data = await res.json().catch(() => ({}));
        ctx.estado.contexto[variavel] = data;
        return avancar(res.ok ? 'sucesso' : 'erro');
      } catch (err) {
        ctx.estado.contexto.http_erro = err.message;
        return avancar('erro');
      }
    }

    case 'nota_interna':
      await mensagemRepo.criar({ conversa_id: ctx.conversa.id, origem: 'sistema', tipo: 'nota', texto: interpolar(cfg.nota || '', ctx) }).catch(() => {});
      return avancar('saida');

    case 'enviar_email':
      // TODO: integrar com serviço de e-mail
      console.log('[Motor] enviar_email (não implementado):', cfg.para);
      return avancar('saida');

    case 'nps_inline': {
      if (ctx.estado.aguardando === no.id) {
        ctx.estado.aguardando = null;
        const nota = parseInt(ctx.mensagem.texto || '0');
        if (nota >= 1 && nota <= 10) {
          await ctx.db('satisfacao').insert({ conversa_id: ctx.conversa.id, nota, canal: ctx.conversa.canal }).catch(() => {});
          const porta = nota >= 9 ? 'promotor' : nota >= 7 ? 'neutro' : 'detrator';
          return avancar(porta);
        }
        ctx.estado.aguardando = no.id;
        return aguardar();
      }
      const pergunta = cfg.pergunta || 'De 1 a 10, qual nota você dá ao nosso atendimento? ⭐';
      ctx.respostas.push({ tipo: 'texto', texto: pergunta });
      ctx.estado.aguardando = no.id;
      return aguardar();
    }

    case 'encerrar': {
      if (cfg.mensagem) ctx.respostas.push({ tipo: 'texto', texto: interpolar(cfg.mensagem, ctx) });
      await conversaRepo.encerrar(ctx.conversa.id).catch(() => {});
      broadcast('conversa_atualizada', await conversaRepo.porId(ctx.conversa.id).catch(() => ({})));
      estadosExecucao.delete(ctx.conversa.id);
      return fim();
    }

    default:
      console.warn(`[Motor] Nó desconhecido: ${no.tipo}`);
      return avancar('saida');
  }
}

// ── IA RESPONDE ───────────────────────────────────────────────────
async function processarIAResponde(no, ctx) {
  const cfg      = no.config || {};
  const slug     = cfg.contexto || 'outros';
  const maxTurnos = parseInt(cfg.max_turns) || 6;
  const turnosKey = `_ia_turnos_${no.id}`;
  const histKey   = `_ia_hist_${no.id}`;

  // Controla turnos — idêntico ao sistema de inspiração
  const turnosUsados = ctx.estado.contexto[turnosKey] || 0;
  if (turnosUsados >= maxTurnos) {
    ctx.estado.contexto[turnosKey] = 0;
    ctx.estado.contexto[histKey]   = [];
    return avancar('max_turnos');
  }

  // Carrega prompt do banco com placeholders resolvidos
  const { system: systemBase, modelo, provedor, temperatura } = await resolverPrompt(
    slug, ctx.estado.contexto.cliente || {}
  );

  // Injeta dados do cliente em variáveis de contexto (como no sistema de inspiração)
  const ctxCliente = Object.entries(ctx.estado.contexto.cliente || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `cliente.${k}: ${v}`)
    .join('\n');

  const system = [
    systemBase,
    cfg.prompt ? `\nInstrução específica: ${cfg.prompt}` : '',
    ctxCliente ? `\n📋 Dados do cliente identificado:\n${ctxCliente}` : '',
    '\nUse as ferramentas disponíveis quando necessário. Não peça dados que já foram fornecidos.',
  ].filter(Boolean).join('\n');

  // Histórico mantido em sessão por nó (não só do banco — preserva contexto entre turnos)
  const histSessao = ctx.estado.contexto[histKey] || [];
  const messages   = [
    ...histSessao,
    { role: 'user', content: ctx.mensagem.texto || '' },
  ].filter(m => m.content);

  try {
    let texto = '';

    if (provedor === 'openai') {
      // OpenAI — busca chave do banco
      const openaiKey = await getDb()('sistema_kv').where({ chave: 'openai_api_key' }).first()
        .then(r => r?.valor ? JSON.parse(r.valor) : null).catch(() => null);
      if (openaiKey) {
        const { default: OpenAI } = await import('openai');
        const oai = new OpenAI({ apiKey: openaiKey });
        const res = await oai.chat.completions.create({
          model:       modelo || 'gpt-4o-mini',
          max_tokens:  1024,
          temperature: temperatura,
          messages:    [{ role: 'system', content: system }, ...messages],
        });
        texto = res.choices[0]?.message?.content || '';
      } else {
        // Fallback Anthropic se OpenAI não configurado
        const ai = await getAnthropicClient();
        const res = await ai.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, system, messages });
        texto = res.content.find(b => b.type === 'text')?.text || '';
      }
    } else {
      // Anthropic (padrão)
      const ai = await getAnthropicClient();
      const res = await ai.messages.create({
        model:       modelo || 'claude-haiku-4-5-20251001',
        max_tokens:  1024,
        temperature: temperatura,
        system,
        messages,
      });
      texto = res.content.find(b => b.type === 'text')?.text || '';
    }

    if (texto) ctx.respostas.push({ tipo: 'texto', texto });

    // Atualiza histórico de sessão (mantém os últimos 20 turns — como no original)
    ctx.estado.contexto[turnosKey] = turnosUsados + 1;
    ctx.estado.contexto[histKey]   = [
      ...histSessao,
      { role: 'user',      content: ctx.mensagem.texto || '' },
      { role: 'assistant', content: texto },
    ].slice(-20);

    // Roteamento: detecta transferência/resolução no texto
    // (o sistema de inspiração usa tool_calls; sem tools usamos heurística melhorada)
    const lwr = texto.toLowerCase();
    const transferiu = lwr.includes('vou te transferir') || lwr.includes('transferindo') ||
                       lwr.includes('chamar um atendente') || lwr.includes('conectar com atendente');
    const resolveu   = lwr.includes('posso te ajudar com mais') || lwr.includes('mais alguma coisa') ||
                       lwr.includes('foi um prazer') || lwr.includes('até mais');

    if (transferiu) {
      ctx.estado.contexto[turnosKey] = 0;
      ctx.estado.contexto[histKey]   = [];
      return avancar('transferir');
    }
    if (resolveu) {
      ctx.estado.contexto[turnosKey] = 0;
      ctx.estado.contexto[histKey]   = [];
      return avancar('resolvido');
    }
  } catch (err) {
    console.error(`[Motor] ia_responde (${slug}):`, err.message);
    ctx.respostas.push({ tipo: 'texto', texto: 'Desculpe, ocorreu um erro. Tente novamente em instantes.' });
    return avancar('transferir');
  }

  return aguardar();
}

// ── IA ROTEADOR ───────────────────────────────────────────────────
async function processarIARoteador(no, ctx) {
  const cfg   = no.config || {};
  const rotas = Array.isArray(cfg.rotas) ? cfg.rotas : [];
  const roteadorKey = `_roteador_${no.id}`;

  // Envia mensagem inicial e aguarda (só na primeira vez)
  if (cfg.mensagem && !ctx.estado.contexto[roteadorKey]) {
    ctx.respostas.push({ tipo: 'texto', texto: interpolar(cfg.mensagem, ctx) });
    ctx.estado.contexto[roteadorKey] = true;
    ctx.estado.aguardando = no.id;
    return aguardar();
  }
  // Limpa flag para próxima execução
  ctx.estado.contexto[roteadorKey] = false;

  const texto = ctx.mensagem.texto || '';

  // ── Detecta despedida antes de chamar IA (economiza chamada API)
  // Idêntico ao sistema de inspiração
  const isDespedida = /^(obrigad|valeu|vlw|não|nao|tchau|encerr|até|flw|ok|certo|tudo|fechou?|nada|por enquanto|por ora)[^\w]*/i
    .test(texto.trim());
  if (isDespedida) return avancar('encerrar');

  if (!rotas.length) return avancar('nao_entendeu');

  // ── Monta prompt XML estruturado (idêntico ao sistema de inspiração)
  const rotasDesc = rotas.map(r =>
    `- "${r.id}": ${r.label || r.id}${r.descricao ? ` (${r.descricao})` : ''}`
  ).join('\n');

  const system = `Você é um classificador de intenções. Analise a mensagem e escolha UMA das rotas.

Rotas disponíveis:
${rotasDesc}
- "encerrar": cliente quer encerrar, disse obrigado, tchau ou não precisa de mais nada
- "nao_entendeu": nenhuma rota se encaixa

Responda APENAS com a tag XML abaixo, sem texto adicional:
<rota>id_da_rota_escolhida</rota>`;

  try {
    const ai = await getAnthropicClient();
    const response = await ai.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 30,
      system,
      messages:   [{ role: 'user', content: texto }],
    });

    const rawText  = (response.content[0]?.text || '').trim();
    // Extrai tag XML — mais robusto que texto puro
    const xmlMatch = rawText.match(/<rota>([\s\S]*?)<\/rota>/);
    const portaRaw = xmlMatch ? xmlMatch[1].trim() : rawText;
    const portaIA  = portaRaw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40);

    const idsValidos = [...rotas.map(r => r.id), 'nao_entendeu', 'encerrar'];
    const porta = idsValidos.includes(portaIA) ? portaIA : 'nao_entendeu';

    ctx.estado.contexto.roteador_intencao = porta;
    return avancar(porta);
  } catch (err) {
    console.error('[Motor] ia_roteador:', err.message);
    return avancar('nao_entendeu');
  }
}

// ── IA DIRETA (sem fluxo ativo) ───────────────────────────────────
async function processarIADireta(conversa, mensagemCliente) {
  const db   = getDb();
  const hist = await obterHistorico(conversa.id, db);

  // Usa o prompt 'outros' como fallback quando não há fluxo ativo
  const { system, modelo, temperatura } = await resolverPrompt('outros', {
    nome:     conversa.nome,
    telefone: conversa.telefone,
  });

  const messages = [
    ...hist.map(m => ({ role: m.origem === 'cliente' ? 'user' : 'assistant', content: m.texto || '' })),
    { role: 'user', content: mensagemCliente.texto || '' },
  ].filter(m => m.content);

  try {
    const ai = await getAnthropicClient();
    const response = await ai.messages.create({
      model:       modelo || 'claude-haiku-4-5-20251001',
      max_tokens:  1024,
      temperature: temperatura,
      system,
      messages,
    });
    const texto = response.content.find(b => b.type === 'text')?.text;
    if (texto) await enviarResposta(conversa, { tipo: 'texto', texto }, conversa.canal_instancia || conversa.canal || 'default');
  } catch (err) {
    console.error('[IA Direta] Erro:', err.message);
  }
}

// ── ENVIAR RESPOSTA ───────────────────────────────────────────────
async function enviarResposta(conversa, resp, instancia) {
  if (!resp.texto && resp.tipo === 'texto') return;

  const msg = await mensagemRepo.criar({
    conversa_id: conversa.id,
    origem:      'ia',
    tipo:        resp.tipo || 'texto',
    texto:       resp.texto || '',
    url:         resp.url || null,
    mime:        resp.mime || null,
  }).catch(err => { console.error('[Motor] criar mensagem:', err.message); return null; });

  if (msg) broadcast('mensagem', { ...msg, conversa_id: conversa.id });

  const chatId = conversa.telefone;
  if (!chatId) return;

  try {
    if (conversa.canal === 'telegram') {
      // ── Envio via Telegram ──────────────────────────────────
      const { tgEnviarTexto, tgEnviarBotoes, tgEnviarImagem } = await import('./telegram.js');
      switch (resp.tipo) {
        case 'texto':
          if (resp.texto) await tgEnviarTexto(chatId, resp.texto); break;
        case 'botoes':
          if (resp.botoes?.length) await tgEnviarBotoes(chatId, resp.corpo || resp.texto || '', resp.botoes);
          break;
        case 'lista': {
          // Telegram não tem lista nativa — converte para botões (máx 8 itens)
          console.log('[Motor] lista resp:', JSON.stringify(resp).slice(0, 300));
          let itens = resp.itens || [];
          // Garante array — pode vir como string JSON
          if (typeof itens === 'string') { try { itens = JSON.parse(itens); } catch { itens = []; } }
          if (!Array.isArray(itens)) itens = [];
          console.log('[Motor] lista itens count:', itens.length, 'tipo:', typeof resp.itens);
          if (!itens.length) {
            // Sem itens configurados — envia só o corpo como texto para não travar
            if (resp.corpo) await tgEnviarTexto(chatId, resp.corpo);
            break;
          }
          if (itens.length <= 8) {
            // Até 8 itens: usa botões inline
            const botoes = itens.map(it => ({ id: it.id, label: it.titulo || it.id }));
            await tgEnviarBotoes(chatId, resp.corpo || 'Selecione uma opção:', botoes);
          } else {
            // Muitos itens: texto numerado
            const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
            const linhas = itens.slice(0,10).map((it, i) => `${emojis[i]||`${i+1}.`} ${it.titulo||it.id}`).join('\n');
            await tgEnviarTexto(chatId, `${resp.corpo || 'Selecione uma opção:'}\n\n${linhas}\n\nDigite o *número* da opção:`);
          }
          break;
        }
        case 'cta':
          if (resp.corpo) await tgEnviarTexto(chatId, `${resp.corpo}\n\n🔗 [${resp.label || 'Acessar'}](${resp.url})`); break;
        case 'imagem':
          if (resp.url) await tgEnviarImagem(chatId, resp.url, resp.legenda); break;
        default:
          if (resp.texto) await tgEnviarTexto(chatId, resp.texto); break;
      }
    } else {
      // ── Envio via Evolution API (WhatsApp) ───────────────────
      if (!instancia) return;
      switch (resp.tipo) {
        case 'texto':
          await evolutionEnviarTexto(instancia, chatId, resp.texto); break;
        case 'cta':
          await evolutionEnviarCTA(instancia, chatId, resp); break;
        case 'botoes':
          if (resp.botoes?.length) await evolutionEnviarBotoes(instancia, chatId, resp);
          break;
        case 'lista':
          if (resp.itens?.length) await evolutionEnviarLista(instancia, chatId, resp);
          break;
        case 'imagem':
          if (resp.url) await evolutionEnviarImagem(instancia, chatId, resp); break;
        case 'audio':
          if (resp.url) await evolutionEnviarAudio(instancia, chatId, resp); break;
        case 'arquivo':
          if (resp.url) await evolutionEnviarArquivo(instancia, chatId, resp); break;
      }
    }
  } catch (err) {
    console.error(`[Motor] Envio ${conversa.canal} falhou:`, err.message);
  }
}

// ── HELPERS ───────────────────────────────────────────────────────
const avancar = (saida) => ({ tipo: 'avancar', saida: saida || 'saida' });
const aguardar = () => ({ tipo: 'aguardar_input' });
const fim = () => ({ tipo: 'fim' });

function parseDados(fluxo) {
  let nodes = [], edges = [];

  if (fluxo.dados) {
    const d = typeof fluxo.dados === 'string' ? JSON.parse(fluxo.dados) : fluxo.dados;
    if (d?.nodes) {
      nodes = d.nodes;
      edges = d.edges || [];
    }
  } else {
    // Fallback para formato antigo
    nodes = typeof fluxo.nos      === 'string' ? JSON.parse(fluxo.nos      || '[]') : (fluxo.nos      || []);
    edges = typeof fluxo.conexoes === 'string' ? JSON.parse(fluxo.conexoes || '[]') : (fluxo.conexoes || []);
  }

  // Normaliza nodes: garante campo tipo e config no nível raiz
  nodes = nodes.map(n => ({
    ...n,
    tipo:   n.tipo   || n.type   || n.data?.tipo   || '',
    config: n.config || n.data?.config || {},
  }));

  return { nodes, edges };
}

function encontrarProximo(noId, saida, edges) {
  if (!edges?.length) return null;
  // Suporta formato {from, to, port} (editor) e {source, target, sourceHandle} (legado)
  const edge =
    edges.find(e => (e.from || e.source) === noId && (e.port || e.sourceHandle || 'saida') === saida) ||
    edges.find(e => (e.from || e.source) === noId && (e.port || e.sourceHandle) === 'saida') ||
    edges.find(e => (e.from || e.source) === noId);
  return edge?.to || edge?.target || null;
}

function interpolar(texto, ctx) {
  if (!texto) return '';
  const c = ctx.estado.contexto;
  return texto
    .replace(/\{\{cliente\.(\w+)\}\}/g, (_, k) => c.cliente?.[k] || '')
    .replace(/\{\{boleto\.(\w+)\}\}/g,  (_, k) => c.boleto?.[k]  || '')
    .replace(/\{\{chamado\.(\w+)\}\}/g, (_, k) => c.chamado?.[k] || '')
    .replace(/\{\{promessa\.(\w+)\}\}/g,(_, k) => c.promessa?.[k]|| '')
    .replace(/\{\{planos\.(\w+)\}\}/g,  (_, k) => c.planos?.[k]  || '')
    .replace(/\{\{(\w+)\}\}/g,          (_, k) => c[k] || ctx.conversa[k] || '');
}

function getCtxVal(ctx, caminho) {
  const partes = caminho.split('.');
  let v = ctx.estado.contexto;
  for (const p of partes) v = v?.[p];
  return v ?? ctx.conversa[caminho] ?? '';
}

function avaliarCondicao(val, op, esperado) {
  const v = String(val || '').toLowerCase();
  const e = String(esperado || '').toLowerCase();
  switch (op) {
    case '==': case 'igual':     return v === e;
    case '!=': case 'diferente': return v !== e;
    case '>':  case 'maior':     return Number(val) > Number(esperado);
    case '<':  case 'menor':     return Number(val) < Number(esperado);
    case 'contem':               return v.includes(e);
    case 'nao_contem':           return !v.includes(e);
    case 'vazio':                return !val || val === '';
    case 'nao_vazio':            return !!(val && val !== '');
    default:                     return v === e;
  }
}

async function getPromptSistema(db) {
  const kv = await db('sistema_kv').where({ chave: 'prompt_ia' }).first().catch(() => null);
  return kv?.valor ? (typeof kv.valor === 'string' ? JSON.parse(kv.valor) : kv.valor)
    : 'Você é um assistente de atendimento. Seja cordial e objetivo.';
}

async function obterHistorico(conversaId, db, limit = 8) {
  return db('mensagens').where({ conversa_id: conversaId, apagada: false })
    .whereIn('origem', ['cliente', 'ia', 'agente'])
    .orderBy('criado_em', 'desc').limit(limit)
    .then(rows => rows.reverse()).catch(() => []);
}

async function verificarHorario(db) {
  const kv = await db('sistema_kv').where({ chave: 'horario' }).first().catch(() => null);
  if (!kv?.valor) return { dentro: true };
  const h = typeof kv.valor === 'string' ? JSON.parse(kv.valor) : kv.valor;
  if (!h?.ativo) return { dentro: true };
  const now = new Date();
  const dia = now.getDay();
  const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const dentro = (h.dias || []).includes(dia) && hhmm >= (h.inicio || '08:00') && hhmm <= (h.fim || '18:00');
  return { dentro };
}

// Limpa estado de conversa encerrada
export function limparEstado(conversaId) {
  estadosExecucao.delete(conversaId);
}
