/**
 * Toda migration precisa sobreviver a rodar duas vezes.
 *
 * O runner rastreia o que já rodou **por nome de arquivo** (`_migrations`).
 * Renomear uma migration já aplicada — ou perder a linha dela — faz o runner
 * executá-la de novo contra um banco que já tem o schema. Se o `up()` não for
 * idempotente, o boot falha; e migration que falha no boot **pula a
 * inicialização dos monitores de SLA e da supervisora** (`server.js`).
 *
 * Medido em 2026-08-21 (FASE 0): 10 das 12 sobreviviam. `001` e `002` não,
 * porque usavam `createTableIfNotExists` do knex — deprecado, e enganoso: ele
 * emite o `CREATE TABLE IF NOT EXISTS` mas dispara `ADD CONSTRAINT` e
 * `CREATE INDEX` **incondicionalmente**, que estouram na segunda passada.
 *
 * Este teste existe para que isso não volte em silêncio na próxima migration.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motivoSkip, prepararBanco } from './_ambiente.js';

const DIR_VERSOES = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/migrations/versions');
const ARQUIVOS = readdirSync(DIR_VERSOES).filter(f => f.endsWith('.js')).sort();

describe('migrations são idempotentes (replay-safe)', { skip: motivoSkip() }, () => {
  let db;

  // prepararBanco() já aplica tudo — o `up()` de cada teste é, portanto, a
  // segunda passada sobre um schema completo. É exatamente o cenário do bug.
  before(async () => { db = await prepararBanco(); });
  after(async () => { await db.destroy(); });

  for (const arquivo of ARQUIVOS) {
    test(`${arquivo} roda de novo sobre schema já aplicado`, async () => {
      const mod = await import(resolve(DIR_VERSOES, arquivo));

      // Transação com rollback garantido: DDL no Postgres é transacional, então
      // o teste detecta o erro sem deixar resíduo para o próximo arquivo.
      const trx = await db.transaction();
      const log = console.log;
      console.log = () => {};
      try {
        await mod.up(trx);
      } catch (err) {
        assert.fail(`${arquivo} não é idempotente: ${err.message}`);
      } finally {
        console.log = log;
        await trx.rollback();
      }
    });
  }

  test('todos os arquivos de versão foram cobertos', () => {
    assert.ok(ARQUIVOS.length >= 12, `esperava ao menos 12 migrations, achei ${ARQUIVOS.length}`);
  });
});
