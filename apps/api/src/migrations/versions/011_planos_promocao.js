/**
 * Adiciona promoção ao catálogo de planos.
 *
 * `valor` continua sendo o preço mensal NORMAL (depois da promoção).
 *   - `valor_promocional` — preço dos primeiros meses (null = sem promoção)
 *   - `promo_meses`       — por quantos meses vale o preço promocional (0 = sem promoção)
 *
 * Ex.: valor=84.90, valor_promocional=69.90, promo_meses=3
 *      → "R$ 69,90 nos primeiros 3 meses, depois R$ 84,90/mês"
 */
export async function up(db) {
  const jaTem = await db.schema.hasColumn('planos', 'valor_promocional');
  if (jaTem) {
    console.log('  ✓ Colunas de promoção já existem em planos');
    return;
  }
  await db.schema.alterTable('planos', t => {
    t.decimal('valor_promocional', 10, 2); // preço promocional dos primeiros meses
    t.integer('promo_meses').defaultTo(0);  // duração da promoção em meses
  });
  console.log('  ✓ Colunas de promoção (valor_promocional, promo_meses) adicionadas em planos');
}

export async function down(db) {
  await db.schema.alterTable('planos', t => {
    t.dropColumn('valor_promocional');
    t.dropColumn('promo_meses');
  });
}
