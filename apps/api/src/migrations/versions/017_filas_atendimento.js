/**
 * 017_filas_atendimento.js — FASE 5: filas de atendimento humano.
 *
 * "Equipe" e "fila" viraram a MESMA tabela. Um provedor com 6 agentes não tem
 * equipe que não seja também fila, e a associação agente→equipe→fila seria uma
 * indireção sem nenhuma pergunta do produto por trás. Quem quiser equipe depois
 * põe `equipe_id` em `filas` — o caminho continua aberto.
 *
 * ⚠️ Não confundir com `inbox`/`outbox`/`jobs` (016, "filas" de mensageria) nem
 * com a rota `/api/filas`, que é daquelas. Estas são de gente, e vivem em
 * `/api/atendimento/filas`.
 *
 * Idempotente (o runner rastreia por NOME DE ARQUIVO — ver 001).
 */
export async function up(db) {
  if (!await db.schema.hasTable('filas')) {
    await db.schema.createTable('filas', t => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.string('nome').notNullable();
      t.string('slug').notNullable().unique();   // é o que o nó do fluxo grava em cfg.fila
      t.text('descricao');
      t.string('cor').defaultTo('#2050B8');
      t.boolean('ativa').defaultTo(true);
      t.integer('ordem').defaultTo(0);
      t.integer('sla_atencao_min').defaultTo(5);
      t.integer('sla_critico_min').defaultTo(15);
      // null = herda o horário global (`sistema_kv.horario`). Objeto vazio NÃO
      // é o mesmo que null aqui: `{ativo:false}` também libera — ver filasHelpers.
      t.jsonb('horario');
      t.timestamp('criado_em').defaultTo(db.fn.now());
      t.timestamp('atualizado').defaultTo(db.fn.now());
    });
    console.log('  ✓ Tabela filas criada');
  }

  if (!await db.schema.hasTable('agentes_filas')) {
    await db.schema.createTable('agentes_filas', t => {
      t.uuid('agente_id').notNullable().references('id').inTable('agentes').onDelete('CASCADE');
      t.uuid('fila_id').notNullable().references('id').inTable('filas').onDelete('CASCADE');
      t.boolean('supervisor').defaultTo(false);
      t.primary(['agente_id', 'fila_id']);
    });
    console.log('  ✓ Tabela agentes_filas criada');
  }

  // Capacidade simultânea por agente. 0 = ilimitado, que é o comportamento de
  // hoje — por isso o default NÃO é 5: subir a migration não pode passar a
  // recusar assunção para ninguém.
  if (!await db.schema.hasColumn('agentes', 'capacidade')) {
    await db.schema.alterTable('agentes', t => t.integer('capacidade').defaultTo(0));
    console.log('  ✓ agentes.capacidade');
  }

  if (!await db.schema.hasColumn('conversas', 'fila_id')) {
    await db.schema.alterTable('conversas', t => {
      t.uuid('fila_id').references('id').inTable('filas').onDelete('SET NULL');
    });
    console.log('  ✓ conversas.fila_id');
  }

  // O índice que a assunção usa: parcial em quem espera, na MESMA ordem do
  // `ORDER BY` do claim (prioridade desc, mais antigo primeiro).
  await db.raw(`
    CREATE INDEX IF NOT EXISTS idx_conv_fila_espera
    ON conversas(fila_id, prioridade DESC, aguardando_desde ASC)
    WHERE status = 'aguardando'
  `);
}

export async function down(db) {
  // ⚠️ Como a 008 e a 014: derruba o índice que a assunção concorrente usa e a
  // coluna que liga conversa→fila. Não rode em produção.
  await db.raw('DROP INDEX IF EXISTS idx_conv_fila_espera');
  if (await db.schema.hasColumn('conversas', 'fila_id')) {
    await db.schema.alterTable('conversas', t => t.dropColumn('fila_id'));
  }
  if (await db.schema.hasColumn('agentes', 'capacidade')) {
    await db.schema.alterTable('agentes', t => t.dropColumn('capacidade'));
  }
  await db.schema.dropTableIfExists('agentes_filas');
  await db.schema.dropTableIfExists('filas');
}
