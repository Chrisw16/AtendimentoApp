/**
 * saude.js — o estado das dependências, para gente (FASE 13, §134/§140).
 *
 * O princípio: **o sinal honesto de "o sistema está atendendo" não é ping em
 * provedor — é a profundidade e a IDADE da fila**. Inbox com 40 pendentes há 4
 * minutos diz mais que qualquer `SELECT 1`.
 *
 * Por isso quase tudo aqui é PASSIVO: o status do SGP e da IA vem do tráfego
 * real (telemetria da FASE 12), não de uma chamada extra. Chamar o ERP para
 * responder um health é DoS pago por nós — uma tela aberta com refresh de 30 s
 * viraria 120 consultas/hora ao mesmo ERP que atende o cliente.
 */
import { getDb } from '../config/db.js';
import { estadoDisjuntorSGP } from './integrations.js';

const CACHE_MS = 20_000;
let cache = { em: 0, dados: null };

/** Histerese simples: 1 falha isolada não pinta a tela de vermelho. */
function vereditoIntegracao({ chamadas = 0, erros = 0, ultimoErroEm = null }) {
  if (!chamadas) return { estado: 'sem_dados', detalhe: 'Nenhuma chamada na última hora.' };
  const taxa = Math.round((erros / chamadas) * 100);
  if (erros === 0) return { estado: 'ok', detalhe: `${chamadas} chamadas, nenhuma falha.` };
  if (taxa >= 50)  return { estado: 'ruim', detalhe: `${erros} de ${chamadas} falharam.`, ultimoErroEm };
  return { estado: 'atencao', detalhe: `${erros} de ${chamadas} falharam (${taxa}%).`, ultimoErroEm };
}

export async function dependencias({ agora = Date.now() } = {}) {
  if (cache.dados && agora - cache.em < CACHE_MS) return { ...cache.dados, cache: true };

  const db = getDb();
  const seguro = (p, padrao) => p.catch(() => padrao);
  const hora = `criado_em > now() - interval '1 hour'`;

  const [banco, filas, telem, migr] = await Promise.all([
    seguro(db.raw('SELECT 1').then(() => ({ ok: true })), { ok: false }),
    // ⚠️ `inbox` usa `recebido_em`; `outbox` e `jobs` usam `criado_em`. Escrever
    // `criado_em` para os três faz o Postgres recusar a query inteira — e o
    // `seguro()` devolveria lista vazia em SILÊNCIO, com a tela dizendo "fila
    // normal" enquanto a DLQ enche. Foi assim que o teste pegou.
    seguro(db.raw(`
      SELECT 'inbox' AS fila, count(*) FILTER (WHERE status='pendente')::int AS pendentes,
             count(*) FILTER (WHERE status='falha')::int AS dlq,
             EXTRACT(EPOCH FROM (now() - min(recebido_em) FILTER (WHERE status='pendente')))::int AS idade_seg
        FROM inbox
      UNION ALL SELECT 'outbox', count(*) FILTER (WHERE status='pendente')::int,
             count(*) FILTER (WHERE status='falha')::int,
             EXTRACT(EPOCH FROM (now() - min(criado_em) FILTER (WHERE status='pendente')))::int FROM outbox
      UNION ALL SELECT 'jobs', count(*) FILTER (WHERE status='pendente')::int,
             count(*) FILTER (WHERE status='falha')::int,
             EXTRACT(EPOCH FROM (now() - min(criado_em) FILTER (WHERE status='pendente')))::int FROM jobs
    `).then(r => r.rows), []),
    seguro(db('telemetria').whereRaw(hora).groupBy('tipo').select('tipo')
      .count('id as chamadas')
      .select(db.raw('count(*) FILTER (WHERE NOT ok) as erros'))
      .select(db.raw('max(criado_em) FILTER (WHERE NOT ok) as ultimo_erro_em')), []),
    seguro(db('_migrations').orderBy('id', 'desc').first().then(m => ({ ultima: m?.name || null })), null),
  ]);

  const porTipo = Object.fromEntries(telem.map(t => [t.tipo, {
    chamadas: Number(t.chamadas), erros: Number(t.erros), ultimoErroEm: t.ultimo_erro_em,
  }]));

  const dlq = filas.reduce((s, f) => s + (f.dlq || 0), 0);
  const pendentes = filas.reduce((s, f) => s + (f.pendentes || 0), 0);
  const maisAntiga = Math.max(0, ...filas.map(f => f.idade_seg || 0));

  const dados = {
    ts: new Date().toISOString(),
    banco: { estado: banco.ok ? 'ok' : 'ruim' },
    migrations: migr,
    redis: { estado: process.env.REDIS_URL ? 'ok' : 'degradado',
             detalhe: process.env.REDIS_URL ? null : 'Sem REDIS_URL — SSE fica local a esta instância.' },
    filas: {
      // Este é o cartão que o operador de verdade usa.
      estado: dlq > 0 ? 'atencao' : maisAntiga > 120 ? 'atencao' : 'ok',
      pendentes, dlq, mais_antiga_seg: maisAntiga, por_fila: filas,
    },
    sgp: {
      ...vereditoIntegracao(porTipo.tool || {}),
      disjuntor: estadoDisjuntorSGP()?.estado || 'fechado',
    },
    ia: vereditoIntegracao(porTipo.llm || {}),
  };

  cache = { em: agora, dados };
  return dados;
}

/** §140 — o veredito de uma frase, para quem não é técnico. */
export function veredito(d) {
  if (!d) return { estado: 'desconhecido', frase: 'Não foi possível verificar.' };
  if (d.banco.estado !== 'ok') return { estado: 'parado', frase: 'Atendimento interrompido — o banco não está respondendo.' };
  if (d.filas.dlq > 0)         return { estado: 'limitado', frase: `Atendendo com limitações — ${d.filas.dlq} mensagem(ns) não entregue(s).` };
  if (d.sgp.disjuntor === 'aberto') return { estado: 'limitado', frase: 'Atendendo com limitações — consultas ao sistema do provedor pausadas automaticamente.' };
  if (d.filas.mais_antiga_seg > 120) return { estado: 'limitado', frase: 'Atendendo com atraso — há mensagens esperando processamento.' };
  if (d.ia.estado === 'ruim')  return { estado: 'limitado', frase: 'Atendendo com limitações — a IA está falhando; conversas vão para atendente.' };
  return { estado: 'normal', frase: 'Atendimento normal.' };
}
