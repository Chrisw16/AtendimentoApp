/**
 * motorFluxo.js — Motor de execução de fluxos de atendimento
 * Suporta todos os 30+ tipos de nó do editor visual
 * Credenciais lidas do banco via integrations.js
 */
import { getDb }          from '../config/db.js';
import { conversaRepo }   from '../repositories/conversaRepository.js';
import { mensagemRepo }   from '../repositories/mensagemRepository.js';
import { broadcast }      from './sseManager.js';
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
  if (!dados.nodes?.length) return processarIADireta(conversa, mensagemCliente);

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
    if (!no) break;

    let resultado;
    try {
      resultado = await processarNo(no, ctx);
    } catch (err) {
      console.error(`[Motor] Erro no nó ${no.tipo}:`, err.message);
      ctx.respostas.push({ tipo: 'texto', texto: `⚠️ Erro interno: ${err.message.slice(0, 100)}` });
      resultado = { tipo: 'fim' };
    }

    if (resultado.tipo === 'aguardar_input') {
      estadosExecucao.set(conversa.id, ctx.estado);
      break;
    }
    if (resultado.tipo === 'avancar') {
      const proxId = encontrarProximo(no.id, resultado.saida, dados.edges);
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
      const itens = cfg.itens || [];
      if (ctx.estado.aguardando === no.id) {
        ctx.estado.aguardando = null;
        const inp = ctx.mensagem.texto?.trim() || '';
        const match = itens.find(it => inp.toLowerCase() === (it.titulo||'').toLowerCase() || inp === it.id);
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
      if (!contrato) {
        ctx.respostas.push({ tipo: 'texto', texto: 'Contrato não identificado.' });
        return avancar('nao_encontrado');
      }
      try {
        const data    = await sgpBuscarBoletos(contrato);
        const boletos = Array.isArray(data) ? data : (data.data || data.boletos || []);
        if (!boletos.length) {
          if (cfg.mensagem_sem_boleto) ctx.respostas.push({ tipo: 'texto', texto: cfg.mensagem_sem_boleto });
          return avancar('nao_encontrado');
        }
        const b = boletos[0];
        ctx.estado.contexto.boleto = { valor: b.valor || b.amount, vencimento: b.vencimento || b.due_date, link: b.link || b.url || b.boleto_url || '', pix: b.pix || b.pix_copia_cola || '' };
        const msg = interpolar(cfg.mensagem_boleto || '📄 Valor: R$ {{boleto.valor}}\n📅 Venc: {{boleto.vencimento}}\n🔗 {{boleto.link}}', ctx);
        ctx.respostas.push({ tipo: 'texto', texto: msg });
        return avancar('encontrado');
      } catch (err) {
        console.error('[Motor] consultar_boleto:', err.message);
        return avancar('nao_encontrado');
      }
    }

    case 'verificar_status': {
      const contrato = getCtxVal(ctx, 'cliente.contrato');
      if (!contrato) return avancar('erro');
      try {
        const data   = await sgpVerificarStatus(contrato);
        const status = (data.status || '').toLowerCase();
        ctx.estado.contexto.cliente.status = status;
        // Mapeamento oficial SGP: ativo, inativo, cancelado, suspenso, inviabilidade técnica, novo, ativo vel. reduzida
        if (status.includes('ativo vel') || status.includes('reduzida')) return avancar('reduzido');
        if (status === 'ativo')                   return avancar('ativo');
        if (status === 'suspenso')                return avancar('suspenso');
        if (status === 'inativo')                 return avancar('inativo');
        if (status === 'cancelado')               return avancar('cancelado');
        if (status.includes('inviabilidade'))     return avancar('inviabilidade');
        if (status === 'novo')                    return avancar('novo');
        return avancar('inativo');
      } catch (err) {
        console.error('[Motor] verificar_status:', err.message);
        return avancar('erro');
      }
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
        const data = await sgpListarPlanos(cidade);
        const planos = Array.isArray(data) ? data : (data.data || data.planos || []);
        ctx.estado.contexto.planos = { lista: planos.map((p, i) => `${i+1}. ${p.nome || p.descricao} — R$ ${p.valor || p.preco}`).join('\n') };
        return avancar('saida');
      } catch (err) {
        console.error('[Motor] listar_planos:', err.message);
        ctx.estado.contexto.planos = { lista: 'Não foi possível listar os planos no momento.' };
        return avancar('saida');
      }
    }

    case 'consultar_historico':
      ctx.estado.contexto.historico = { resumo: 'Histórico não disponível.' };
      return avancar('saida');

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
  const cfg = no.config || {};
  const turnos = (ctx.estado.contexto[`_turnos_${no.id}`] || 0) + 1;
  ctx.estado.contexto[`_turnos_${no.id}`] = turnos;

  if (turnos > (cfg.max_turns || 5)) {
    ctx.estado.contexto[`_turnos_${no.id}`] = 0;
    return avancar('max_turnos');
  }

  const promptBase = await getPromptSistema(ctx.db);
  const contextoStr = JSON.stringify(ctx.estado.contexto.cliente || {});
  const system = `${cfg.prompt || promptBase}\n\nContexto do cliente: ${contextoStr}\nAssunto: ${cfg.contexto || 'geral'}`;

  const historico = await obterHistorico(ctx.conversa.id, ctx.db);
  const messages = [
    ...historico.map(m => ({ role: m.origem === 'cliente' ? 'user' : 'assistant', content: m.texto || '' })),
    { role: 'user', content: ctx.mensagem.texto || '' },
  ].filter(m => m.content);

  try {
    const ai = await getAnthropicClient();
    const response = await ai.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system,
      messages,
    });

    const texto = response.content.find(b => b.type === 'text')?.text || '';
    if (texto) ctx.respostas.push({ tipo: 'texto', texto });

    const lwr = texto.toLowerCase();
    if (lwr.includes('transferi') || lwr.includes('atendente') || lwr.includes('humano')) {
      ctx.estado.contexto[`_turnos_${no.id}`] = 0;
      return avancar('transferir');
    }
    if (lwr.includes('tchau') || lwr.includes('obrigad') || lwr.includes('encerrando')) {
      ctx.estado.contexto[`_turnos_${no.id}`] = 0;
      return avancar('resolvido');
    }
  } catch (err) {
    console.error('[Motor] ia_responde:', err.message);
    ctx.respostas.push({ tipo: 'texto', texto: 'Desculpe, ocorreu um erro. Tente novamente.' });
  }

  return aguardar();
}

// ── IA ROTEADOR ───────────────────────────────────────────────────
async function processarIARoteador(no, ctx) {
  const cfg   = no.config || {};
  const rotas = Array.isArray(cfg.rotas) ? cfg.rotas : [];

  if (cfg.mensagem && !ctx.estado.contexto[`_roteador_enviou_${no.id}`]) {
    ctx.respostas.push({ tipo: 'texto', texto: interpolar(cfg.mensagem, ctx) });
    ctx.estado.contexto[`_roteador_enviou_${no.id}`] = true;
    ctx.estado.aguardando = no.id;
    return aguardar();
  }

  const texto = ctx.mensagem.texto || '';
  if (!rotas.length) return avancar('nao_entendeu');

  // Usa IA para classificar a intenção
  const opcoes = rotas.map((r, i) => `${i+1}. ${r.id} — ${r.descricao || r.label}`).join('\n');
  const system = `Você é um classificador de intenção. Dado o texto do usuário, responda APENAS com o ID da rota mais adequada das opções abaixo, ou "nao_entendeu" se não encaixar em nenhuma, ou "encerrar" se o usuário quer encerrar.\n\nRotas disponíveis:\n${opcoes}`;

  try {
    const ai = await getAnthropicClient();
    const response = await ai.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 50,
      system,
      messages:   [{ role: 'user', content: texto }],
    });
    const porta = (response.content[0]?.text || '').trim().toLowerCase().replace(/\s+/g, '_');
    const rotaValida = rotas.find(r => r.id === porta);
    ctx.estado.contexto[`_roteador_enviou_${no.id}`] = false;
    return avancar(rotaValida ? porta : porta === 'encerrar' ? 'encerrar' : 'nao_entendeu');
  } catch (err) {
    console.error('[Motor] ia_roteador:', err.message);
    return avancar('nao_entendeu');
  }
}

// ── IA DIRETA (sem fluxo ativo) ───────────────────────────────────
async function processarIADireta(conversa, mensagemCliente) {
  const db      = getDb();
  const prompt  = await getPromptSistema(db);
  const hist    = await obterHistorico(conversa.id, db);
  const messages = [
    ...hist.map(m => ({ role: m.origem === 'cliente' ? 'user' : 'assistant', content: m.texto || '' })),
    { role: 'user', content: mensagemCliente.texto || '' },
  ].filter(m => m.content);

  try {
    const ai = await getAnthropicClient();
    const response = await ai.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, system: prompt, messages });
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

  // Envia para WhatsApp via Evolution API
  const num = conversa.telefone;
  if (!num || !instancia) return;

  try {
    switch (resp.tipo) {
      case 'texto':
        await evolutionEnviarTexto(instancia, num, resp.texto); break;
      case 'cta':
        await evolutionEnviarCTA(instancia, num, resp); break;
      case 'botoes':
        if (resp.botoes?.length) await evolutionEnviarBotoes(instancia, num, resp);
        break;
      case 'lista':
        if (resp.itens?.length) await evolutionEnviarLista(instancia, num, resp);
        break;
      case 'imagem':
        if (resp.url) await evolutionEnviarImagem(instancia, num, resp); break;
      case 'audio':
        if (resp.url) await evolutionEnviarAudio(instancia, num, resp); break;
      case 'arquivo':
        if (resp.url) await evolutionEnviarArquivo(instancia, num, resp); break;
    }
  } catch (err) {
    console.error('[Motor] Evolution envio falhou:', err.message);
  }
}

// ── HELPERS ───────────────────────────────────────────────────────
const avancar = (saida) => ({ tipo: 'avancar', saida: saida || 'saida' });
const aguardar = () => ({ tipo: 'aguardar_input' });
const fim = () => ({ tipo: 'fim' });

function parseDados(fluxo) {
  if (fluxo.dados) {
    const d = typeof fluxo.dados === 'string' ? JSON.parse(fluxo.dados) : fluxo.dados;
    if (d?.nodes) return d;
  }
  // Fallback para formato antigo
  const nos      = typeof fluxo.nos      === 'string' ? JSON.parse(fluxo.nos      || '[]') : (fluxo.nos      || []);
  const conexoes = typeof fluxo.conexoes === 'string' ? JSON.parse(fluxo.conexoes || '[]') : (fluxo.conexoes || []);
  return { nodes: nos, edges: conexoes };
}

function encontrarProximo(noId, saida, edges) {
  if (!edges?.length) return null;
  // Tenta porta exata, depois porta 'saida', depois qualquer saída do nó
  const match = edges.find(e => e.source === noId && e.sourceHandle === saida)
    || edges.find(e => e.source === noId && e.sourceHandle === 'saida')
    || edges.find(e => e.source === noId);
  return match?.target || null;
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
