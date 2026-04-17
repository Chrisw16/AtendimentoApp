/**
 * 004_chat_melhorias.js
 * Adiciona colunas necessárias para o sistema de fila e chat completo
 */
export async function up(db) {
  // canal_instancia — qual instância Evolution deve ser usada para enviar
  const hasCanalInstancia = await db.schema.hasColumn('conversas', 'canal_instancia');
  if (!hasCanalInstancia) {
    await db.schema.alterTable('conversas', t => {
      t.string('canal_instancia');            // nome da instância Evolution
      t.integer('pos_na_fila').defaultTo(0);  // posição calculada na fila
      t.text('palavras_criticas');            // palavras críticas detectadas
      t.timestamp('assumido_em');             // quando agente assumiu
      t.timestamp('primeira_msg_agente_em'); // primeiro reply do agente
      t.timestamp('ultima_msg_agente_em');   // última msg do agente (SLA)
    });
    console.log('  ✓ Colunas de chat e fila adicionadas');
  }

  // Índice para performance da fila
  await db.raw(`
    CREATE INDEX IF NOT EXISTS idx_conv_aguardando_fila
    ON conversas(aguardando_desde, prioridade)
    WHERE status = 'aguardando'
  `).catch(() => {});

  // Tabela satisfacao (NPS inline nos fluxos)
  const hasSatisfacao = await db.schema.hasTable('satisfacao');
  if (!hasSatisfacao) {
    await db.schema.createTable('satisfacao', t => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.uuid('conversa_id').references('id').inTable('conversas').onDelete('SET NULL');
      t.integer('nota').notNullable();
      t.text('comentario');
      t.string('canal');
      t.timestamp('criado_em').defaultTo(db.fn.now());
    });
    console.log('  ✓ Tabela satisfacao criada');
  }
}

export async function down(db) {
  await db.schema.alterTable('conversas', t => {
    t.dropColumn('canal_instancia');
    t.dropColumn('pos_na_fila');
    t.dropColumn('palavras_criticas');
    t.dropColumn('assumido_em');
    t.dropColumn('primeira_msg_agente_em');
    t.dropColumn('ultima_msg_agente_em');
  });
  await db.schema.dropTableIfExists('satisfacao');
}
