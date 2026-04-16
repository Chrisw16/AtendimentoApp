/**
 * 003_fluxos_dados.js
 * Adiciona coluna `dados` (jsonb) na tabela fluxos para armazenar
 * o grafo completo do editor visual (nodes + edges do React Flow)
 */

export async function up(db) {
  const hasCol = await db.schema.hasColumn('fluxos', 'dados');
  if (!hasCol) {
    await db.schema.alterTable('fluxos', t => {
      t.jsonb('dados').defaultTo(JSON.stringify({ nodes: [], edges: [] }));
    });
    console.log('  ✓ Coluna dados adicionada à tabela fluxos');
  } else {
    console.log('  ✓ Coluna dados já existe');
  }

  // Também adiciona publicado/versao se não existir (compatibilidade com editor)
  const hasPub = await db.schema.hasColumn('fluxos', 'publicado');
  if (!hasPub) {
    await db.schema.alterTable('fluxos', t => {
      t.boolean('publicado').defaultTo(false);
      t.integer('versao').defaultTo(1);
      t.text('descricao');
    });
  }
}

export async function down(db) {
  await db.schema.alterTable('fluxos', t => {
    t.dropColumn('dados');
    t.dropColumn('publicado');
    t.dropColumn('versao');
    t.dropColumn('descricao');
  });
}
