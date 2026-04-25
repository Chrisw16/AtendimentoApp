export async function up(db) {
  // Campos de análise de sentimento e resumo da conversa
  const cols = [
    ['sentimento', () => db.schema.hasColumn('conversas','sentimento'), t => t.string('sentimento')],
    ['topico',     () => db.schema.hasColumn('conversas','topico'),     t => t.string('topico')],
    ['resumo_ia',  () => db.schema.hasColumn('conversas','resumo_ia'),  t => t.text('resumo_ia')],
  ];
  for (const [col, has, add] of cols) {
    if (!(await has())) {
      await db.schema.alterTable('conversas', add);
      console.log(`  ✓ Coluna ${col} adicionada`);
    }
  }
}
export async function down(db) {
  await db.schema.alterTable('conversas', t => {
    t.dropColumn('sentimento');
    t.dropColumn('topico');
    t.dropColumn('resumo_ia');
  });
}
