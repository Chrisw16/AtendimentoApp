/**
 * motorLoop.js — o loop de execução do motor, extraído como função pura.
 *
 * Espelha exatamente o laço de `processarConversa` (motorFluxo.js): teto de 15
 * iterações, `aguardar_input` pausa, `avancar` resolve a próxima porta,
 * `fim` encerra. Recebe `processarNo` injetado, então roda sem banco/IA — é o
 * que torna o simulador e os testes de "trava/limbo/cliente perdido" possíveis.
 *
 * Diferença em relação ao motor: aqui o desfecho é CLASSIFICADO (status), o que
 * o motor não faz (ele só pausa ou encerra). O control-flow e o roteamento de
 * porta (`encontrarProximo`) são cópias byte-a-byte do motor, então este loop
 * está PRONTO para religar no `processarConversa` e remover o código duplicado.
 *
 * ⚠️ DIVERGÊNCIA a partir da FASE 1 (2026-08-21): o laço real virou assíncrono
 * na persistência do estado (`await estados.set/delete` num `finally`, grafo
 * congelado em `estado._grafo`, `fim({manter})` para a transferência ao humano).
 * NADA disso está aqui. Este arquivo — e o `motorSimulador.js` que roda em cima
 * dele — espelham o laço PRÉ-FASE-1. Religar exige portar essas mudanças
 * primeiro; até lá, "espelho byte-a-byte" vale só para a lógica de travessia
 * (qual nó vem depois), não para o ciclo de vida da execução.
 * Esse religamento foi deixado como passo seguinte porque exige validação
 * rodando (o motor puxa knex/IA e não importa em teste neste ambiente).
 */
import { noTermina } from './fluxoValidador.js';

export const TETO_ITERACOES = 15;

/** Cópia byte-a-byte do encontrarProximo do motorFluxo: exata → "saida" → 1ª aresta → null. */
export function encontrarProximo(noId, saida, edges) {
  if (!edges?.length) return null;
  const edge =
    edges.find(e => (e.from || e.source) === noId && (e.port || e.sourceHandle || 'saida') === saida) ||
    edges.find(e => (e.from || e.source) === noId && (e.port || e.sourceHandle) === 'saida') ||
    edges.find(e => (e.from || e.source) === noId);
  return edge?.to || edge?.target || null;
}

/**
 * @param ctx   { dados:{nodes,edges}, estado:{noAtual,...}, respostas:[] }
 * @param deps  { processarNo(no,ctx)->{tipo,saida}, onPasso?({no,resultado}) }
 * @returns { status, noId?, porta?, iteracoes, motivo? }
 *   status: 'aguardando' | 'concluido' | 'perdido' | 'travado' | 'erro'
 */
export async function executarLoop(ctx, deps) {
  const { processarNo, onPasso = () => {}, encontrarProximo: resolver = encontrarProximo } = deps;
  const { nodes, edges } = ctx.dados;

  let iteracoes = 0;
  while (iteracoes < TETO_ITERACOES) {
    iteracoes++;
    const no = nodes.find(n => n.id === ctx.estado.noAtual);
    if (!no) {
      // Motor: "Nó não encontrado — encerrando" (break). Aqui sinalizamos como perdido.
      return { status: 'perdido', motivo: 'no_inexistente', noId: ctx.estado.noAtual, iteracoes };
    }

    let resultado;
    try {
      resultado = await processarNo(no, ctx);
    } catch (err) {
      // Motor: empilha resposta de erro e trata como fim().
      ctx.respostas.push({ tipo: 'texto', texto: `⚠️ Erro interno: ${String(err.message).slice(0, 100)}` });
      onPasso({ no, resultado: { tipo: 'fim' }, erro: err });
      return { status: 'erro', noId: no.id, iteracoes, motivo: err.message };
    }

    onPasso({ no, resultado });

    if (resultado.tipo === 'aguardar_input') {
      return { status: 'aguardando', noId: no.id, iteracoes };
    }

    if (resultado.tipo === 'avancar') {
      const target = resolver(no.id, resultado.saida, edges);
      if (!target) {
        // Motor: sem próximo nó → estado apagado + break (conversa acaba).
        // Classificamos: nó terminal = fim legítimo; senão = cliente perdido.
        return {
          status: noTermina(no) ? 'concluido' : 'perdido',
          noId: no.id,
          porta: resultado.saida,
          iteracoes,
        };
      }
      ctx.estado.noAtual = target;
      continue;
    }

    if (resultado.tipo === 'fim') {
      return { status: 'concluido', noId: no.id, iteracoes };
    }

    // Resultado desconhecido → motor faz break.
    return { status: 'concluido', noId: no.id, iteracoes };
  }

  // Estourou o teto sem pausar nem encerrar → trava (a conversa não responde).
  return { status: 'travado', iteracoes };
}
