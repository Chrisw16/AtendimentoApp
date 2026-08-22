/**
 * 021_copiloto.js — Copiloto do atendente (FASE 10).
 *
 * Uma tabela só, e ela é de MÉTRICA (§87), não de conteúdo. O motivo: a
 * sugestão em si não precisa sobreviver — ela vive segundos, entre ser gerada e
 * ser aceita, editada ou ignorada. O que precisa sobreviver é **o que o
 * atendente fez com ela**, porque é isso que responde "o copiloto está
 * ajudando ou atrapalhando?".
 *
 * `texto` guarda a sugestão só quando o evento a torna interessante (foi
 * editada, foi enviada) — guardar toda sugestão gerada encheria a tabela de
 * texto que ninguém vai ler, e sugestão carrega o que o cliente contou.
 */
export async function up(db) {
  if (!await db.schema.hasTable('copiloto_eventos')) {
    await db.schema.createTable('copiloto_eventos', t => {
      t.bigIncrements('id').primary();
      t.uuid('conversa_id').notNullable();
      t.uuid('agente_id').references('id').inTable('agentes').onDelete('SET NULL');
      // sugestao_gerada | inserida | editada | enviada | ignorada
      // | acao_recomendada | acao_executada | feedback
      t.string('evento').notNullable();
      t.string('acao');            // qual tool/próxima ação, quando o evento é de ação
      t.string('feedback');        // positivo | negativo
      t.text('motivo');            // motivo do feedback (§86)
      t.text('texto');             // só quando o evento justifica guardar
      t.integer('ms');             // quanto tempo a sugestão levou para sair
      t.timestamp('criado_em').defaultTo(db.fn.now());
      t.index(['conversa_id']);
      t.index(['evento']);
      t.index(['criado_em']);
    });
    console.log('  ✓ copiloto_eventos');
  }
}

export async function down(db) {
  await db.schema.dropTableIfExists('copiloto_eventos');
}
