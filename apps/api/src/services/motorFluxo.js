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
  // As funções evolutionEnviar* saíram daqui: o envio por canal mora em
  // `canais/evolution.js`, que as recebe por injeção.
} from './integrations.js';
import { resolverTipoChamado, avaliarNps, montarSystemPrompt, camposLista, camposIaResponde, TOOLS_PADRAO, montarFichaColetada, normalizarNomeCampo, CAMPOS_RESERVADOS } from './fluxoHelpers.js';
import { dentroDoHorario } from './filasHelpers.js';
import { criarFilaPorChave } from './filaPorChave.js';
import { estadoStore, ehUuid } from './estadoStore.js';

// Serializa o processamento por conversa. Sem isto, duas mensagens seguidas do
// mesmo cliente intercalam nos `await` de SGP/IA e corrompem o estado
// (é lido no começo e só gravado no fim).
// Exportada para o shutdown gracioso saber se ainda há turno em voo.
export const filaConversa = criarFilaPorChave();

// ── ENTRY POINT ───────────────────────────────────────────────────
export function processarConversa(conversa, mensagemCliente, opts = {}) {
  // Sandbox/teste traz o PRÓPRIO Map de estados: o estado é isolado e não toca
  // o `flow_executions` de produção, então não precisa da fila — e não deve
  // entrar nela. A rota pública de teste usa um id fixo por fluxo
  // (`share:<id>`), de modo que serializar ali colocaria TODOS os visitantes
  // numa fila só, cada um esperando o round-trip de IA/SGP do anterior.
  //
  // O guard é `opts.sandbox`, NÃO `opts.estados`: era a presença de `estados`
  // que desligava a fila, então injetar um store por `opts.estados` em produção
  // mataria a serialização em silêncio e a race de 2026-08-21 voltaria.
  if (opts.sandbox) return processarConversaInterno(conversa, mensagemCliente, opts);

  // Produção: uma conversa por vez, senão duas mensagens seguidas do mesmo
  // cliente intercalam nos `await` e corrompem o estado compartilhado.
  return filaConversa(conversa.id, () => processarConversaInterno(conversa, mensagemCliente, opts));
}

async function processarConversaInterno(conversa, mensagemCliente, opts = {}) {
  const db      = opts.db      || getDb();
  const estados = opts.estados || estadoStore;      // sandbox/teste injeta um Map isolado
  const enviar  = opts.enviar  || enviarResposta;   // sandbox captura em vez de enviar no WhatsApp
  const sandbox = !!opts.sandbox;

  let estado = await estados.get(conversa.id);
  const retomando = !!estado;
  if (!estado) estado = { noAtual: null, contexto: { cliente: {} }, historico: [], aguardando: null };

  // Versão fixa por conversa (§12). A execução congela o grafo ao nascer e passa
  // a rodar sobre a própria cópia: publicar uma versão nova — ou ativar OUTRO
  // fluxo, que troca `ativo` inteiro — não move mais quem está no meio do
  // atendimento. `opts.fluxo` mantém precedência absoluta: é o que faz o botão
  // "Testar fluxo" exercitar o rascunho e não a versão publicada.
  let fluxo = opts.fluxo;
  if (!fluxo && estado._grafo) fluxo = { id: estado._fluxoId, nome: estado._fluxoNome, dados: estado._grafo };
  if (!fluxo) fluxo = await db('fluxos').where({ ativo: true }).first();
  if (!fluxo) return sandbox ? undefined : processarIADireta(conversa, mensagemCliente);

  const dados = parseDados(fluxo);
  console.log(`[Motor] Fluxo "${fluxo.nome}": ${dados.nodes?.length || 0} nós, ${dados.edges?.length || 0} edges${retomando ? ' (retomando)' : ''}`);
  if (!dados.nodes?.length) {
    console.warn('[Motor] Fluxo sem nós — caindo para IA direta');
    return sandbox ? undefined : processarIADireta(conversa, mensagemCliente);
  }

  // Se não tem nó atual, começa pelo nó de início — e é aqui que o grafo congela.
  if (!estado.noAtual) {
    const noInicio = dados.nodes.find(n => n.tipo === 'inicio' || n.tipo === 'gatilho_keyword');
    estado.noAtual = noInicio?.id;
    // No sandbox NÃO congela: `opts.fluxo` já manda em todo turno (é o rascunho
    // que a tela quer testar) e o estado volta ao navegador no corpo da
    // resposta — congelar ali jogaria o grafo inteiro pela rede a cada turno.
    if (!sandbox) {
      estado._fluxoId   = fluxo.id;
      estado._fluxoNome = fluxo.nome;
      estado._grafo     = dados;
    }
  }
  if (!estado.noAtual) return sandbox ? undefined : processarIADireta(conversa, mensagemCliente);

  const ctx = {
    conversa, mensagem: mensagemCliente,
    dados, estado, db, respostas: [],
    estados, sandbox,
    instancia: conversa.canal_instancia || conversa.canal || 'default',
    numero:    conversa.telefone,
  };

  // `viva` responde "esta execução continua?" — o `finally` grava ou apaga a
  // linha uma vez, no fim do turno. Antes o único `set` estava no
  // `aguardar_input`: tudo que a travessia acumulava (ficha do SGP, contadores
  // da IA, `salvar_dado`) sumia se o processo morresse antes da pausa.
  let viva = true;
  try {
    let iteracoes = 0;
    while (iteracoes++ < 15) {
      const no = dados.nodes.find(n => n.id === ctx.estado.noAtual);
      if (!no) {
        // Não pode persistir uma execução apontando para o vazio: em memória isso
        // se curava no restart, em tabela travaria a conversa para sempre.
        console.warn(`[Motor] Nó não encontrado: ${ctx.estado.noAtual} — encerrando`);
        viva = false;
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

      if (resultado.tipo === 'aguardar_input') break;
      if (resultado.tipo === 'avancar') {
        const proxId = encontrarProximo(no.id, resultado.saida, dados.edges);
        console.log(`[Motor] Próximo nó: ${proxId || 'NENHUM (fim do fluxo)'}`);
        if (!proxId) { viva = false; break; }
        ctx.estado.noAtual = proxId;
        continue;
      }
      if (resultado.tipo === 'fim') {
        // `manter` = a execução continua viva esperando alguém de fora (hoje só
        // `transferir_agente`, que precisa do estado para devolver à automação).
        viva = !!resultado.manter;
        break;
      }
      break;
    }
  } finally {
    if (viva) await estados.set(conversa.id, ctx.estado);
    else      await estados.delete(conversa.id);
  }

  console.log(`[Motor] Respostas geradas: ${ctx.respostas.length}`);
  for (const resp of ctx.respostas) {
    await enviar(conversa, resp, ctx.instancia);
  }
  return { respostas: ctx.respostas, estado: viva ? ctx.estado : null };
}

/**
 * Devolve a conversa do humano para a automação (§13).
 *
 * `transferir_agente` gravou `_retomarNo` — o destino da porta `transferido` —
 * antes de entregar ao agente. Sem essa porta ligada no fluxo não há execução
 * viva e isto não faz nada, que é o comportamento de sempre.
 *
 * Vive aqui, e não na rota, para ser testável sem subir HTTP + auth.
 *
 * @returns {Promise<boolean>} true se a automação foi de fato retomada.
 */
export async function retomarAutomacao(conversa, opts = {}) {
  // Tudo dentro da fila: ler-mutar-gravar cru aqui deixaria dois cliques em
  // "Devolver para IA" (ou dois agentes na mesma conversa) apontarem `noAtual`
  // para o nó de retomada duas vezes e o cliente receberia a mensagem em dobro.
  return filaConversa(conversa.id, async () => {
    const estado = await estadoStore.get(conversa.id);
    if (!estado?._retomarNo) return false;

    estado.noAtual    = estado._retomarNo;
    estado._retomarNo = null;
    estado.aguardando = null;
    await estadoStore.set(conversa.id, estado);

    // Mensagem sintética: numa devolução não há fala do cliente. O `ia_responde`
    // reconhece `tipo: 'sistema'` e pausa em vez de chamar a IA com histórico
    // vazio — ver a guarda lá.
    await processarConversaInterno(conversa, { texto: '', tipo: 'sistema' }, opts);
    return true;
  });
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
      ctx.respostas.push({ tipo: 'lista', corpo: interpolar(cfg.corpo || '', ctx), ...camposLista(cfg), itens });
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
      const variavel = cfg.variavel || 'resposta';
      if (ctx.estado.aguardando === no.id) {
        // FASE 4: o job de timeout entrega `tipo:'timer'`. Sem esta guarda ele
        // cairia no ramo de baixo e gravaria `contexto[variavel] = ''` — a
        // resposta VAZIA viraria a resposta do cliente. Corrupção, não no-op.
        // Contador POR NÓ: um só (`_espera_tentativas`) seria compartilhado por
        // todos os `aguardar_resposta` do fluxo e o segundo já nasceria gasto.
        const chaveTentativas = `_espera_${no.id}`;
        if (ctx.mensagem?.tipo === 'timer') {
          const tentativas = (ctx.estado.contexto[chaveTentativas] || 0) + 1;
          const max = Number(cfg.max_tentativas) || 0;   // 0 = sem teto
          limparEspera(ctx.estado);
          if (max && tentativas >= max) {
            delete ctx.estado.contexto[chaveTentativas];
            return avancar('max_tentativas');
          }
          ctx.estado.contexto[chaveTentativas] = tentativas;
          return avancar('timeout');
        }
        limparEspera(ctx.estado);
        delete ctx.estado.contexto[chaveTentativas];
        ctx.estado.contexto[variavel] = ctx.mensagem.texto || '';
        await cancelarTimer(no, ctx);                  // o job vira desnecessário
        return avancar('saida');
      }
      if (cfg.mensagem) ctx.respostas.push({ tipo: 'texto', texto: interpolar(cfg.mensagem, ctx) });
      ctx.estado.aguardando = no.id;
      // `timeout` em segundos: sem ele o nó espera para sempre, como sempre fez.
      const espera = Number(cfg.timeout) || 0;
      if (espera > 0) await agendarTimer('wait_timeout', no, ctx, espera);
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
      const seg = Math.max(1, Number(cfg.segundos) || 60);

      // Sandbox mantém o comportamento antigo: a tela "Testar fluxo" precisa de
      // resultado imediato, não de espera real. (E o id `sandbox:<uuid>` não é
      // uuid — a linha em `jobs` nem entraria.)
      if (ctx.sandbox) {
        console.log(`[Motor] aguardar_tempo: ${seg}s (sandbox: avança na hora)`);
        return avancar('saida');
      }

      // Campo PRÓPRIO, nunca `aguardando`: este é o único mecanismo de retomada
      // do motor e não distingue quem acordou o fluxo. Reusá-lo faria a
      // mensagem do cliente ser consumida como se fosse o timer.
      if (ctx.estado.aguardandoTimer === no.id) {
        if (ctx.mensagem?.tipo === 'timer') {
          limparEspera(ctx.estado);
          return avancar('saida');
        }
        // Cliente escreveu durante a espera: segue parado e NÃO reagenda
        // (senão cada mensagem dele criaria outro job).
        return aguardar();
      }

      const agendou = await agendarTimer('flow_resume', no, ctx, seg);
      // Agendamento falhou (tabela ausente, banco fora): avança na hora, que é
      // o comportamento de antes desta fase. Cliente parado para sempre é pior.
      if (!agendou) return avancar('saida');

      ctx.estado.aguardandoTimer = no.id;
      return aguardar();
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
            fone:     data.fone || '',
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
      if (ctx.sandbox) {
        ctx.estado.contexto.chamado = { protocolo: 'TESTE-0000', aberto: true, cliente: '' };
        return avancar('sucesso');
      }
      try {
        // criarChamado(contrato, tipo, descricao) — fiel ao erp.js original
        const data = await criarChamado(
          contrato,
          resolverTipoChamado(cfg),
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
      if (ctx.sandbox) {
        ctx.estado.contexto.promessa = { dias: 3, data: '(simulado)', protocolo: 'TESTE-0000' };
        ctx.respostas.push({ tipo: 'texto', texto: interpolar(cfg.mensagem_sucesso || '✅ Promessa registrada! (simulado)', ctx) });
        return avancar('sucesso');
      }
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
      // No sandbox não se toca no banco de filas: `cfg.fila` só é resolvida
      // para saber o horário, e mesmo isso é leitura (permitida em sandbox).
      const fila    = await resolverFila(ctx.db, cfg.fila);
      const horario = await verificarHorario(ctx.db, fila);
      if (!horario.dentro) {
        const msg = cfg.msg_fora || 'Fora do horário de atendimento.';
        ctx.respostas.push({ tipo: 'texto', texto: msg });
        return avancar('fora_horario');
      }
      if (!ctx.sandbox) {
        await conversaRepo.atualizar(ctx.conversa.id, { status: 'aguardando', aguardando_desde: new Date().toISOString(), agente_id: null, fila_id: fila?.id || null });
        broadcast('conversa_atualizada', await conversaRepo.porId(ctx.conversa.id));
      }
      // Ponto de retorno para quando o agente devolver a conversa à automação
      // (§13). Usa a porta `transferido`, que já existe em `nodeTypes.js` e é
      // ligável na tela hoje — sem porta ligada, encerra como sempre encerrou.
      const retomarNo = encontrarProximo(no.id, 'transferido', ctx.dados.edges);
      ctx.estado._retomarNo = retomarNo || null;
      // No sandbox não existe humano para devolver a conversa: segue terminal,
      // que é o que a tela de teste sempre mostrou.
      return fim({ manter: !ctx.sandbox && !!retomarNo });
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
      if (!ctx.sandbox) await mensagemRepo.criar({ conversa_id: ctx.conversa.id, origem: 'sistema', tipo: 'nota', texto: interpolar(cfg.nota || '', ctx) }).catch(() => {});
      return avancar('saida');

    case 'enviar_email':
      // TODO: integrar com serviço de e-mail
      console.log('[Motor] enviar_email (não implementado):', cfg.para);
      return avancar('saida');

    case 'nps_inline': {
      if (ctx.estado.aguardando === no.id) {
        ctx.estado.aguardando = null;
        const aval = avaliarNps(ctx.mensagem.texto, cfg.escala);
        if (aval.valida) {
          const nota = parseInt(ctx.mensagem.texto, 10);
          // Grava a escala junto: sem ela o dashboard assume 0-10 e a nota
          // máxima de uma escala 1-5 cai na faixa de detrator.
          const escala = parseInt(cfg.escala, 10) === 5 ? 5 : 10;
          if (!ctx.sandbox) await ctx.db('satisfacao').insert({ conversa_id: ctx.conversa.id, nota, escala, canal: ctx.conversa.canal }).catch(() => {});
          return avancar(aval.porta);
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
      if (!ctx.sandbox) {
        await conversaRepo.encerrar(ctx.conversa.id).catch(() => {});
        broadcast('conversa_atualizada', await conversaRepo.porId(ctx.conversa.id).catch(() => ({})));
      }
      return fim();
    }

    default:
      console.warn(`[Motor] Nó desconhecido: ${no.tipo}`);
      return avancar('saida');
  }
}

// ── IA RESPONDE — com suporte a tool calls (igual ao sistema de inspiração) ──
async function processarIAResponde(no, ctx) {
  const cfg       = no.config || {};
  // Retomada vinda do humano (§13) chega com a mensagem sintética
  // `{texto:'', tipo:'sistema'}`. Sem esta guarda o histórico sai vazio, a
  // Anthropic recusa (`at least one message is required`), o catch devolve
  // `avancar('transferir')` e a conversa volta para o humano num laço.
  //
  // O gate é o TIPO, não o texto vazio: áudio e imagem sem legenda chegam do
  // cliente sem `texto` nenhum (ver `extrairConteudoEvolution`) e precisam
  // continuar chamando a IA com o histórico que já existe — travar neles
  // deixaria o cliente no silêncio.
  // 'timer' entra aqui pelo mesmo motivo que 'sistema': não há fala do cliente.
  // IA falar sozinha depois de um timer é geração proativa — feature do AI
  // Runtime (FASE 9), não consequência de um job. Teto declarado da FASE 4:
  // `aguardar_tempo → ia_responde` não é suportado; use `→ enviar_texto`.
  if (ctx.mensagem?.tipo === 'sistema' || ctx.mensagem?.tipo === 'timer') return aguardar();

  const slug      = cfg.contexto || 'outros';
  // Fonte única dos dois campos com alias — ver `camposIaResponde`.
  const { instrucao, maxTurnos } = camposIaResponde(cfg);
  const turnosKey = `_ia_turnos_${no.id}`;
  const histKey   = `_ia_hist_${no.id}`;

  // Controla turnos
  const turnosUsados = ctx.estado.contexto[turnosKey] || 0;
  if (turnosUsados >= maxTurnos) {
    ctx.estado.contexto[turnosKey] = 0;
    ctx.estado.contexto[histKey]   = [];
    return avancar('max_turnos');
  }

  // Carrega prompt do banco
  const { system: systemBase, modelo, provedor, temperatura } = await resolverPrompt(
    slug, ctx.estado.contexto.cliente || {}
  );

  // Dados do cliente para contexto
  const ctxCliente = Object.entries(ctx.estado.contexto.cliente || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `cliente.${k}: ${v}`)
    .join('\n');

  // Ficha de dados já coletados (reinjetada todo turno para a IA não re-perguntar).
  const ficha = montarFichaColetada(ctx.estado.contexto);

  // FASE 8: o procedimento oficial entra no prompt TODO TURNO, com as etapas já
  // cumpridas marcadas. Injetar só na primeira passagem faria a IA esquecer o
  // roteiro no segundo turno, que é exatamente quando ela começa a improvisar.
  const { prepararParaIA } = await import('./playbook.js');
  const pb = cfg.playbook
    ? await prepararParaIA(cfg.playbook, { conversaId: ctx.conversa.id, sandbox: ctx.sandbox }).catch(err => {
        console.error('[Playbook] falhou, seguindo sem procedimento:', err.message);
        return null;
      })
    : null;

  const system = montarSystemPrompt({
    systemBase,
    instrucao,
    ctxCliente,
    ficha,
    playbook: pb?.bloco || '',
    regrasTools: `## REGRAS CRÍTICAS DE FERRAMENTAS
- Você tem acesso a ferramentas reais (tool_use). Use-as diretamente — NUNCA escreva o nome delas no texto.
- ERRADO: "Deixa eu verificar... verificar_conexao"
- CERTO: [executa a tool silenciosamente e responde com o resultado]
- Execute a ferramenta PRIMEIRO, depois responda ao cliente com o resultado.
- Não peça dados que já estão no contexto acima.
- Não diga "vou verificar" ou "aguarde" — apenas execute e responda.
- NUNCA invente ou suponha números de contrato, CPF ou protocolo. Use APENAS os dados do contexto acima.
- Ao chamar criar_chamado, NÃO passe o campo "contrato" no input — ele é preenchido automaticamente pelo sistema com o contrato correto do cliente.`,
  });

  // Histórico
  //
  // Áudio e imagem sem legenda chegam SEM `texto` (ver `extrairConteudoEvolution`)
  // — e nota de voz é o input mais comum em suporte de ISP. Filtrar por conteúdo
  // vazio deixaria `messages: []` na primeira entrada do nó, a Anthropic recusa
  // (`at least one message is required`) e o cliente recebe "ocorreu um erro" +
  // transferência. Um marcador descreve o que chegou e deixa a IA responder.
  const MARCADOR_MIDIA = {
    audio: '[o cliente enviou um áudio]',
    imagem: '[o cliente enviou uma imagem]',
    video: '[o cliente enviou um vídeo]',
    doc: '[o cliente enviou um documento]',
  };
  const falaCliente = ctx.mensagem.texto || MARCADOR_MIDIA[ctx.mensagem.tipo] || '';

  const histSessao = ctx.estado.contexto[histKey] || [];
  const messages   = [
    ...histSessao,
    { role: 'user', content: falaCliente },
  ].filter(m => m.content);

  // Carrega tools disponíveis
  const { IA_TOOLS, executarTool } = await import('./iaTools.js');
  // Lista padrão (suporte/atendimento). Tools sensíveis como `precadastrar_cliente`
  // ficam fora do default — devem ser ativadas explicitamente em cfg.tools_ativas
  // (ex.: no nó IA Responde do fluxo comercial).
  const toolsAtivas = cfg.tools_ativas || TOOLS_PADRAO;
  // salvar_dado sempre disponível — memória não pode ser desligada por config de nó.
  // Só os campos que a API da Anthropic aceita — os metadados de risco da FASE 2
  // (`is_write`, `allowed_in_sandbox`) são nossos e um campo desconhecido na
  // definição da tool derruba a chamada com 400.
  const tools = IA_TOOLS
    .filter(t => toolsAtivas.includes(t.name) || t.name === 'salvar_dado')
    // FASE 8: sem procedimento ativo, `concluir_etapa_playbook` não tem o que
    // concluir. Deixá-la na lista convida o modelo a chamá-la e gastar um turno
    // para receber "nenhum procedimento ativo" — tool inútil na lista é ruído
    // que compete com a tool certa.
    .filter(t => t.name !== 'concluir_etapa_playbook' || !!pb)
    .map(({ name, description, input_schema }) => ({ name, description, input_schema }));

  try {
    const ai = await getAnthropicClient();
    let texto = '';
    let faladoNoTurno = '';   // tudo que a IA falou neste turno (p/ histórico coerente)
    let transferiu = false;
    let resolveu = false;

    // ── Loop agentico: IA pode chamar múltiplas tools antes de responder ──
    let loopMessages = [...messages];
    let loopCount = 0;

    while (loopCount++ < 5) {
      const res = await ai.messages.create({
        model:      modelo || 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system,
        tools,
        messages:   loopMessages,
      });

      // Verifica stop reason
      if (res.stop_reason === 'end_turn') {
        texto = res.content.find(b => b.type === 'text')?.text || '';
        break;
      }

      if (res.stop_reason === 'tool_use') {
        // A IA pode mandar texto JUNTO de um tool_use (ex.: "confirmo seus dados,
        // posso finalizar?" + salvar_dado). Sem empilhar aqui, essa fala se perde e a
        // conversa trava esperando um "sim" que o cliente nunca viu (Respostas geradas: 0).
        const textoJunto = res.content.find(b => b.type === 'text')?.text?.trim();
        if (textoJunto) {
          ctx.respostas.push({ tipo: 'texto', texto: textoJunto });
          faladoNoTurno = faladoNoTurno ? `${faladoNoTurno}\n${textoJunto}` : textoJunto;
        }

        // Processa todos os tool_use do bloco
        const toolUses = res.content.filter(b => b.type === 'tool_use');
        const toolResults = [];

        for (const tu of toolUses) {
          // salvar_dado é tratada aqui (não no executarTool) porque precisa mutar
          // o estado do fluxo, que o executarTool(name,input,{cliente,conversa,sandbox}) não vê.
          if (tu.name === 'salvar_dado') {
            const dados = tu.input?.dados || {};
            const salvos = [];
            for (const [campo, valor] of Object.entries(dados)) {
              const chave = normalizarNomeCampo(campo);
              if (!chave || CAMPOS_RESERVADOS.has(chave)) continue;
              ctx.estado.contexto[chave] = String(valor ?? '');
              salvos.push(`${chave}=${ctx.estado.contexto[chave]}`);
            }
            // Só os NOMES dos campos: os valores são os dados pessoais do
            // assinante (CPF, nome, endereço) que a IA acabou de coletar.
            // `salvos` segue com os valores porque o tool_result volta pra IA.
            const nomes = salvos.map(s => s.split('=')[0]);
            console.log(`[IA] salvar_dado →`, nomes.length ? nomes.join(', ') : '(nada salvo)');
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: salvos.length ? `✓ Salvei: ${salvos.join(', ')}` : 'Nenhum dado para salvar.',
            });
            continue;
          }
          // FASE 8: etapa conversacional não tem tool que a prove — a IA marca.
          // Fica aqui (e não no `executarTool`) pelo mesmo motivo do
          // `salvar_dado`: precisa da execução do playbook deste turno.
          if (tu.name === 'concluir_etapa_playbook') {
            // Sem `exec` (sandbox) a etapa não é registrada, mas a IA precisa
            // receber uma confirmação — senão ela tenta de novo, e o teste de
            // fluxo deixa de espelhar o comportamento real.
            let conteudo = pb ? '✓ Etapa concluída (simulado — sem registro no sandbox).'
                              : 'Nenhum procedimento ativo neste atendimento.';
            if (pb?.exec) {
              const { concluirEtapa } = await import('./playbook.js');
              const r = await concluirEtapa(pb.exec, pb.etapas, tu.input?.etapa);
              if (r.erro) conteudo = `Etapa "${tu.input?.etapa}" não existe neste procedimento.`;
              else { pb.exec = r.exec; conteudo = `✓ Etapa concluída: ${r.etapa.titulo}`; }
            }
            toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: conteudo });
            continue;
          }

          // Sem `tu.input`: consultar_cliente/precadastrar_cliente carregam CPF
          // e ficha completa do assinante.
          console.log(`[IA] Executando tool: ${tu.name} (${Object.keys(tu.input || {}).join(',') || 'sem args'})`);
          const result = await executarTool(tu.name, tu.input || {}, {
            cliente: ctx.estado.contexto.cliente || {},
            conversa: ctx.conversa,
            sandbox: ctx.sandbox,
          }).catch(e => `Erro ao executar ${tu.name}: ${e.message}`);

          // A etapa é dada por cumprida pela tool que a EVIDENCIA, não pelo que
          // a IA diz ter feito — é o único sinal que a auditoria pode conferir.
          if (pb?.exec) {
            const { registrarTool } = await import('./playbook.js');
            pb.exec = await registrarTool(pb.exec, pb.etapas, tu.name).catch(() => pb.exec);
          }

          // Detecta ações especiais
          if (typeof result === 'string' && result.startsWith('__TRANSFERIR__')) {
            transferiu = true;
            texto = result.replace('__TRANSFERIR__:', '').trim();
          } else if (typeof result === 'string' && result.startsWith('__ENCERRAR__')) {
            resolveu = true;
            texto = result.replace('__ENCERRAR__:', '').trim();
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: typeof result === 'string' ? result : JSON.stringify(result),
          });
        }

        // Adiciona assistant turn + tool results e continua o loop
        loopMessages = [
          ...loopMessages,
          { role: 'assistant', content: res.content },
          { role: 'user',      content: toolResults },
        ];
        continue;
      }

      // Fallback: extrai texto se houver
      texto = res.content.find(b => b.type === 'text')?.text || '';
      break;
    }

    if (texto) ctx.respostas.push({ tipo: 'texto', texto });

    // Atualiza histórico (últimas 50 mensagens ≈ 25 trocas — cadastro comercial
    // longo precisa lembrar cidade/plano/dados coletados no começo da conversa)
    ctx.estado.contexto[turnosKey] = turnosUsados + 1;
    ctx.estado.contexto[histKey]   = [
      ...histSessao,
      { role: 'user',      content: ctx.mensagem.texto || '' },
      { role: 'assistant', content: [faladoNoTurno, texto].filter(Boolean).join('\n') },
    ].slice(-50);

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

    // Heurística de roteamento pelo texto (fallback)
    const lwr = texto.toLowerCase();
    if (lwr.includes('transferir') || lwr.includes('atendente humano')) {
      ctx.estado.contexto[turnosKey] = 0;
      ctx.estado.contexto[histKey]   = [];
      return avancar('transferir');
    }
    if (lwr.includes('mais alguma coisa') || lwr.includes('foi um prazer') || lwr.includes('até mais')) {
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
  const destino = { numero: chatId, instancia };

  // ── Write-ahead (FASE 4, §126) ────────────────────────────────
  // Persiste a INTENÇÃO de envio antes de enviar. Morte de processo não lança
  // exceção: sem esta linha, morrer entre gravar o estado e despachar deixava
  // o banco dizendo "aguardando o menu" com o cliente sem ter visto o menu.
  // O envio segue INLINE — a latência é a de sempre; o outbox é o log.
  let registro = null;
  if (ehUuid(conversa.id)) {
    try {
      const { registrar } = await import('./outbox.js');
      // `mensagemId`: é por ele que o outbox conta à TELA quando a entrega não
      // acontece — a mensagem já foi persistida e broadcastada acima.
      registro = await registrar(conversa, resp, destino, { mensagemId: msg?.id });
    } catch (err) {
      console.error('[Motor] outbox indisponível — envio direto:', err.message);
    }
  }

  if (registro) {
    // Ordem por conversa: `enviarResposta` engole o erro e o laço continua, então
    // uma resposta que falha seguida de outra que passa entregaria o menu antes
    // da saudação. Havendo saída anterior não entregue, esta espera a vez no worker.
    if (registro.esperar) {
      console.log(`[Motor] saída anterior pendente — ${resp.tipo} vai pelo outbox, em ordem`);
      return;
    }
    const { entregar } = await import('./outbox.js');
    await entregar(registro.linha);
    return;
  }

  try {
    // Caminho sem outbox (id sintético ou tabela fora): o envio direto de antes.
    const { enviarPorCanal } = await import('./canais/index.js');
    await enviarPorCanal(conversa.canal, destino, resp);
  } catch (err) {
    console.error(`[Motor] Envio ${conversa.canal} falhou:`, err.message);
  }
}

// ── ESPERA COM RELÓGIO (FASE 4) ───────────────────────────────────

/** Margem entre a hora do job e a expiração do estado: o worker roda em tick. */
const FOLGA_PARK_MS = 15 * 60_000;

function limparEspera(estado) {
  estado.aguardando      = null;
  estado.aguardandoTimer = null;
  // Sem limpar `_parkedAte`, o TTL normal de 2h nunca volta a valer para esta
  // execução e a conversa fica viva até o teto de 72h.
  estado._parkedAte      = null;
}

/**
 * Agenda a retomada e segura o estado até lá (`_parkedAte`).
 * @returns {Promise<boolean>} false se não deu para agendar — quem chama decide.
 */
async function agendarTimer(tipo, no, ctx, segundos) {
  if (ctx.sandbox) return false;
  try {
    const { agendar } = await import('./jobs.js');
    const executarEm = new Date(Date.now() + segundos * 1000);
    await agendar({ tipo, conversaId: ctx.conversa.id, noId: no.id, executarEm });
    ctx.estado._parkedAte = new Date(executarEm.getTime() + FOLGA_PARK_MS).toISOString();
    return true;
  } catch (err) {
    console.error(`[Motor] não consegui agendar ${tipo} para o nó ${no.id}:`, err.message);
    return false;
  }
}

/**
 * O cliente respondeu antes da hora: o job vira lixo.
 *
 * `await` obrigatório. Solto, o DELETE pode cair DEPOIS do upsert do próximo
 * job — no fluxo que volta ao mesmo `aguardar_resposta` para repergunta, isso
 * apaga o timer recém-agendado e o cliente fica parado para sempre.
 */
async function cancelarTimer(no, ctx) {
  if (ctx.sandbox) return;
  try {
    const { cancelar } = await import('./jobs.js');
    await cancelar(ctx.conversa.id, no.id);
  } catch (err) {
    console.error('[Motor] cancelar timer falhou:', err.message);
  }
}

/**
 * Retomada por RELÓGIO — o worker de jobs entra por aqui (§127).
 *
 * Gêmea de `retomarAutomacao`, e pelos mesmos motivos: entra na `filaConversa`
 * (dois ticks sobrepostos não podem processar a mesma conversa) e chama
 * `processarConversaInterno`, nunca a versão externa — que enfileiraria atrás
 * de si mesma e travaria.
 *
 * No-op silencioso é o caso NORMAL: cliente respondeu antes, estado expirou,
 * a conversa foi encerrada ou um humano assumiu. Só não é no-op quando a
 * execução ainda está parada exatamente naquele nó.
 *
 * @returns {Promise<boolean>} true se o fluxo foi de fato retomado.
 */
export async function retomarTimer(conversaId, noId, opts = {}) {
  const conversa = await conversaRepo.porId(conversaId);
  if (!conversa) return false;

  // Humano assumiu no meio da espera: jogar a automação por cima seria a IA
  // falando em cima do agente.
  if (conversa.status !== 'ia') {
    console.log(`[Motor] timer de ${conversaId} ignorado: conversa está '${conversa.status}'`);
    return false;
  }

  return filaConversa(conversa.id, async () => {
    const estado = await estadoStore.get(conversa.id);
    if (!estado) return false;
    if (estado.aguardandoTimer !== noId && estado.aguardando !== noId) return false;

    await processarConversaInterno(conversa, { texto: '', tipo: 'timer' }, opts);
    return true;
  });
}

// ── HELPERS ───────────────────────────────────────────────────────
const avancar = (saida) => ({ tipo: 'avancar', saida: saida || 'saida' });
const aguardar = () => ({ tipo: 'aguardar_input' });
const fim = (opts = {}) => ({ tipo: 'fim', manter: !!opts.manter });

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

/**
 * FASE 5: o horário da FILA manda; sem fila — ou fila sem horário próprio — vale
 * o global do `sistema_kv`. `?? ` e não `||` de propósito: `{ativo:false}` é uma
 * escolha ("esta fila não fecha"), não ausência de configuração.
 *
 * A regra em si mora em `filasHelpers.dentroDoHorario`, que é puro e testado —
 * aqui sobrou só a leitura do banco.
 */
async function verificarHorario(db, fila = null) {
  if (fila?.horario != null) return { dentro: dentroDoHorario(fila.horario) };
  const kv = await db('sistema_kv').where({ chave: 'horario' }).first().catch(() => null);
  return { dentro: dentroDoHorario(kv?.valor) };
}

/** `cfg.fila` guarda o SLUG da fila (é o que a tela grava); aceita id por via das dúvidas. */
async function resolverFila(db, ref) {
  if (!ref) return null;
  const col  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref) ? 'id' : 'slug';
  const fila = await db('filas').where({ [col]: ref }).first().catch(() => null);
  // Fila apagada/renomeada não pode engolir a transferência: degrada para "sem
  // fila", que é visível para todos os agentes.
  if (!fila) console.warn(`[Motor] fila "${ref}" não existe — transferindo sem fila`);
  return fila || null;
}

