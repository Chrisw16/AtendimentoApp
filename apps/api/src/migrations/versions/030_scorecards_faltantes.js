/**
 * 030_scorecards_faltantes.js — os scorecards de suporte e comercial nunca
 * existiram em produção.
 *
 * Medido no banco de produção em 2026-09-05, logo depois do deploy da 029:
 * `SELECT count(*) FROM quality_scorecards` devolvia **1** — o financeiro, que
 * a 029 tinha acabado de inserir. Os dois que a FASE 11 entregou não estavam
 * lá.
 *
 * A causa é uma ordem de migration: a **022** semeia os catálogos e a **023**
 * cria `quality_scorecards`. Quando a 022 rodou, a tabela ainda não existia, e
 * `semearCatalogos` protege cada bloco com `hasTable` justamente para não
 * derrubar o boot — então ela pulou os scorecards **em silêncio** e nada nunca
 * voltou para semeá-los. É exatamente o defeito que a 022 foi criada para
 * resolver, repetido uma casa adiante: catálogo entregue, tela abrindo vazia, e
 * nada acusando.
 *
 * A guarda que faltava não é um `if` melhor: é este teste, em
 * `tests/integracao/financeiro-catalogos.test.js`, exigindo que os TRÊS estejam
 * no banco depois das migrations.
 *
 * Idempotente por `onConflict('slug').ignore()`: o financeiro que já está lá
 * não é tocado, e o que o operador editar não é desfeito pelo próximo deploy.
 */
import { SCORECARDS } from '../../dadosIniciais.js';

export async function up(db) {
  if (!await db.schema.hasTable('quality_scorecards')) return;

  let inseridos = 0;
  for (const sc of SCORECARDS) {
    const r = await db('quality_scorecards')
      .insert({ ...sc, criterios: JSON.stringify(sc.criterios) })
      .onConflict('slug').ignore().returning('slug');
    inseridos += r.length;
  }
  // Contagem de inserções DE VERDADE: `semearCatalogos` devolve
  // `SCORECARDS.length` mesmo tendo inserido zero, e o operador lê o log do
  // deploy como confirmação de que semeou.
  console.log(`  ✓ Scorecards: ${inseridos} inserido(s) de ${SCORECARDS.length} (0 = já existiam)`);
}

export async function down() {
  // Sem `down`: apagar scorecard levaria junto o histórico de auditoria que
  // aponta para ele.
}
