/**
 * filaDb.js — reivindicação de linha em fila no Postgres.
 *
 * As três filas da FASE 4 (`inbox`, `outbox`, `jobs`) têm a mesma mecânica e
 * as mesmas duas armadilhas, então a mecânica mora aqui uma vez só:
 *
 *  - `FOR UPDATE SKIP LOCKED` impede que dois ticks (ou dois containers) peguem
 *    a mesma linha. É o padrão de fila em SQL e evita transação longa;
 *  - `reivindicado_em` é **lease**: `SKIP LOCKED` não protege contra SIGKILL —
 *    a linha marcada `processando` por um worker morto ficaria presa para
 *    sempre. `reclamarLeases` é o que a devolve.
 *
 * `tentativas` é incrementado NA REIVINDICAÇÃO, não na falha: SIGKILL não passa
 * pelo caminho de falha, então uma linha que derruba o processo toda vez (um
 * payload venenoso) rodaria para sempre se só o `catch` contasse.
 *
 * ponytail: nomes de tabela/coluna entram interpolados. São literais do nosso
 * próprio código (`inbox`/`outbox`/`jobs`), nunca entrada de usuário — os
 * `binds` cuidam dos valores. Se um dia vier de fora, valide contra allowlist.
 */
import { destinoLease, LEASE_MS } from './politicaRetry.js';

const TABELAS = new Set(['inbox', 'outbox', 'jobs']);

function checar(tabela) {
  if (!TABELAS.has(tabela)) throw new Error(`filaDb: tabela não permitida: ${tabela}`);
  return tabela;
}

/**
 * Marca até `limite` linhas `pendente` como `processando` e as devolve.
 *
 * @param {object} db      knex
 * @param {string} tabela  inbox | outbox | jobs
 * @param {object} opts    { onde: SQL extra, binds, ordem, limite }
 */
export async function reivindicar(db, tabela, { onde = 'TRUE', binds = [], ordem = 'criado_em', limite = 10 } = {}) {
  checar(tabela);
  const { rows } = await db.raw(
    `UPDATE ${tabela} SET status = 'processando', reivindicado_em = now(), tentativas = tentativas + 1
      WHERE id IN (
        SELECT id FROM ${tabela}
         WHERE status = 'pendente' AND (${onde})
         ORDER BY ${ordem}
         LIMIT ${Number(limite) | 0}
         FOR UPDATE SKIP LOCKED
      )
      RETURNING *`,
    binds,
  );
  return rows;
}

/**
 * Devolve à fila (ou manda para a DLQ) o que ficou preso em `processando`.
 *
 * O destino vem de `destinoLease`: envio pode retentar, turno de motor não
 * (reprocessar um turno que já chamou `criar_chamado` abre um segundo chamado
 * no SGP — §23, e as tools ainda não têm chave de idempotência).
 *
 * Não incrementa `tentativas`: a reivindicação já contou esta passada.
 */
export async function reclamarLeases(db, tabela) {
  checar(tabela);
  const destino = destinoLease(tabela);
  const { rows } = await db.raw(
    `UPDATE ${tabela}
        SET status = ?, reivindicado_em = NULL,
            ultimo_erro = 'lease expirado (worker morreu processando)'
      WHERE status = 'processando'
        AND reivindicado_em < now() - (? || ' milliseconds')::interval
      RETURNING id, status`,
    [destino, LEASE_MS],
  );
  return rows;
}

/**
 * Devolve à fila um lote reivindicado que não vai mais ser processado —
 * o dreno do SIGTERM. Sem isto, todo deploy deixa linhas presas até o reclaim.
 */
export async function liberar(db, tabela, ids) {
  checar(tabela);
  if (!ids?.length) return 0;
  return db(tabela).whereIn('id', ids).where({ status: 'processando' })
    .update({ status: 'pendente', reivindicado_em: null });
}
