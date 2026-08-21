/**
 * `satisfacao.escala` — guarda em que escala a nota foi dada.
 *
 * O nó `nps_inline` aceita escala 1-5 ou 0-10, mas gravava só a nota crua. O
 * dashboard assumia 0-10 para tudo, então numa escala de 5 a nota máxima (5)
 * caía na faixa de detrator (<=6) e o NPS travava em -100.
 *
 * Guardar a escala junto da nota preserva a resposta original (sem converter
 * nada) e deixa a classificação para `agregarNps`, fonte única das faixas.
 * Linhas antigas ficam com 10 — que é o que o sistema já assumia.
 */
export async function up(db) {
  const existe = await db.schema.hasColumn('satisfacao', 'escala');
  if (existe) {
    console.log('  ✓ Coluna satisfacao.escala já existe');
    return;
  }
  await db.schema.alterTable('satisfacao', t => {
    t.integer('escala').notNullable().defaultTo(10);
  });
  console.log('  ✓ Coluna satisfacao.escala criada (default 10)');
}

export async function down(db) {
  const existe = await db.schema.hasColumn('satisfacao', 'escala');
  if (existe) await db.schema.alterTable('satisfacao', t => t.dropColumn('escala'));
}
