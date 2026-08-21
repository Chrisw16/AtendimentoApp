/**
 * Adiciona benefícios inclusos ao catálogo de planos.
 *
 * `beneficios` — texto livre, um benefício por linha (ou separados por vírgula).
 *   Ex.: "Globoplay\nDeezer\nQualifica"
 * A tool `listar_planos_ativos` cita esses benefícios junto com o plano,
 * e o painel mostra como chips. (Apenas nomes — sem logos.)
 */
export async function up(db) {
  const jaTem = await db.schema.hasColumn('planos', 'beneficios');
  if (jaTem) {
    console.log('  ✓ Coluna beneficios já existe em planos');
    return;
  }
  await db.schema.alterTable('planos', t => {
    t.text('beneficios'); // um por linha ou separados por vírgula
  });
  console.log('  ✓ Coluna beneficios adicionada em planos');
}

export async function down(db) {
  await db.schema.alterTable('planos', t => {
    t.dropColumn('beneficios');
  });
}
