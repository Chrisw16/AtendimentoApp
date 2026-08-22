/**
 * 002_tabelas_adicionais.js
 * Tabelas para: zonas de cobertura, equipamentos de rede, alertas
 */

/**
 * Substitui `db.schema.createTableIfNotExists`, que é deprecado no knex e
 * ENGANOSO: ele emite o `CREATE TABLE IF NOT EXISTS`, mas dispara
 * `ADD CONSTRAINT` e `CREATE INDEX` INCONDICIONALMENTE. Rodar a migration de
 * novo sobre um schema já pronto estourava com "relation already exists".
 *
 * O runner rastreia por NOME DE ARQUIVO — renomear esta migration a faz rodar
 * de novo, e migration que falha no boot pula os monitores de SLA e da
 * supervisora. Aqui, se a tabela existe, nada é executado.
 */
async function criarTabela(db, nome, definicao) {
  if (await db.schema.hasTable(nome)) return;
  await db.schema.createTable(nome, definicao);
}

export async function up(db) {
  // ── ZONAS DE COBERTURA ────────────────────────────────────────
  await criarTabela(db, 'zonas_cobertura', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('nome').notNullable();
    t.string('tipo').defaultTo('cobertura'); // 'cobertura' | 'expansao' | 'sem_sinal'
    t.jsonb('geojson').notNullable();
    t.jsonb('planos_ids').defaultTo('[]');   // planos disponíveis nesta zona
    t.boolean('ativo').defaultTo(true);
    t.timestamp('criado_em').defaultTo(db.fn.now());
    t.timestamp('atualizado').defaultTo(db.fn.now());

    t.index(['tipo']);
  });

  // ── EQUIPAMENTOS DE REDE ──────────────────────────────────────
  await criarTabela(db, 'equipamentos_rede', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('nome');
    t.string('ip').notNullable().unique();
    t.string('tipo').defaultTo('generico');  // 'switch' | 'roteador' | 'olt' | 'onu' | 'generico'
    t.string('localizacao');
    t.string('status').defaultTo('unknown'); // 'online' | 'offline' | 'degradado' | 'unknown'
    t.integer('latencia_ms');
    t.timestamp('ultima_verificacao');
    t.jsonb('meta').defaultTo('{}');

    t.index(['status']);
    t.index(['tipo']);
  });

  // ── ALERTAS DE REDE ───────────────────────────────────────────
  await criarTabela(db, 'alertas_rede', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('equipamento');
    t.string('tipo').defaultTo('warning');   // 'warning' | 'critical'
    t.text('mensagem').notNullable();
    t.boolean('resolvido').defaultTo(false);
    t.timestamp('criado_em').defaultTo(db.fn.now());

    t.index(['criado_em']);
    t.index(['resolvido']);
  });

  // ── ORDENS DE SERVIÇO ─────────────────────────────────────────
  await criarTabela(db, 'ordens_servico', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('numero').unique();
    t.string('titulo').notNullable();
    t.text('descricao');
    t.string('tipo');               // 'instalacao' | 'manutencao' | 'retirada' | 'visita'
    t.string('status').defaultTo('aberta');
    t.string('prioridade').defaultTo('normal');
    t.uuid('agente_id').references('id').inTable('agentes').onDelete('SET NULL');
    t.uuid('conversa_id').references('id').inTable('conversas').onDelete('SET NULL');
    t.string('contrato_id');
    t.string('endereco');
    t.decimal('latitude',  10, 8);
    t.decimal('longitude', 11, 8);
    t.timestamp('agendado_para');
    t.timestamp('iniciado_em');
    t.timestamp('concluido_em');
    t.timestamp('criado_em').defaultTo(db.fn.now());
    t.timestamp('atualizado').defaultTo(db.fn.now());
    t.jsonb('meta').defaultTo('{}');

    t.index(['status']);
    t.index(['agendado_para']);
    t.index(['agente_id']);
  });

  // ── CONSULTAS DE COBERTURA (log) ──────────────────────────────
  await criarTabela(db, 'consultas_cobertura', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.decimal('latitude',  10, 8);
    t.decimal('longitude', 11, 8);
    t.string('endereco');
    t.boolean('tem_cobertura').defaultTo(false);
    t.string('canal');
    t.uuid('conversa_id').references('id').inTable('conversas').onDelete('SET NULL');
    t.timestamp('criado_em').defaultTo(db.fn.now());

    t.index(['criado_em']);
    t.index(['tem_cobertura']);
  });
}

export async function down(db) {
  const tables = [
    'consultas_cobertura', 'ordens_servico',
    'alertas_rede', 'equipamentos_rede', 'zonas_cobertura',
  ];
  for (const t of tables) await db.schema.dropTableIfExists(t);
}
