/**
 * Adiciona coluna aguardando_avaliacao à tabela conversas.
 * Usada para identificar conversas que aguardam resposta de nota do cliente.
 */
export async function up(db) {
  const hasCol = await db.schema.hasColumn('conversas', 'aguardando_avaliacao');
  if (hasCol) {
    console.log('  ✓ Coluna aguardando_avaliacao já existe');
    return;
  }
  await db.schema.alterTable('conversas', t => {
    t.boolean('aguardando_avaliacao').defaultTo(false);
  });
  console.log('  ✓ Coluna aguardando_avaliacao adicionada');
}

export async function down(db) {
  await db.schema.alterTable('conversas', t => {
    t.dropColumn('aguardando_avaliacao');
  });
}
