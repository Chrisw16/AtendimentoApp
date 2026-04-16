/**
 * 001_schema_inicial.js
 * Schema base do Maxxi v2
 */

export async function up(db) {
  // ── SISTEMA KV ───────────────────────────────────────────────
  await db.schema.createTableIfNotExists('sistema_kv', t => {
    t.string('chave').primary();
    t.jsonb('valor').notNullable();
    t.timestamp('atualizado').defaultTo(db.fn.now());
  });

  // ── AGENTES ──────────────────────────────────────────────────
  await db.schema.createTableIfNotExists('agentes', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('nome').notNullable();
    t.string('login').notNullable().unique();
    t.string('senha_hash').notNullable();
    t.string('avatar').defaultTo('🧑');
    t.string('role').defaultTo('agente');  // 'admin' | 'agente'
    t.boolean('ativo').defaultTo(true);
    t.boolean('online').defaultTo(false);
    t.jsonb('permissoes').defaultTo('{}');
    t.timestamp('criado_em').defaultTo(db.fn.now());
    t.timestamp('atualizado').defaultTo(db.fn.now());
  });

  // ── CANAIS ────────────────────────────────────────────────────
  await db.schema.createTableIfNotExists('canais', t => {
    t.string('tipo').primary();
    t.string('nome').notNullable();
    t.string('icone');
    t.boolean('ativo').defaultTo(false);
    t.jsonb('config').defaultTo('{}');
    t.timestamp('atualizado').defaultTo(db.fn.now());
  });

  // ── CONVERSAS ─────────────────────────────────────────────────
  await db.schema.createTableIfNotExists('conversas', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('canal').notNullable();          // 'whatsapp' | 'telegram' | 'widget' | 'email' | 'voip' | 'sms'
    t.string('telefone');
    t.string('nome');
    t.string('email');
    t.string('foto_perfil');
    t.string('cidade');
    t.string('status').defaultTo('ia');       // 'ia' | 'aguardando' | 'ativa' | 'encerrada'
    t.uuid('agente_id').references('id').inTable('agentes').onDelete('SET NULL');
    t.text('ultima_mensagem');
    t.integer('nao_lidas').defaultTo(0);
    t.integer('prioridade').defaultTo(0);
    t.string('protocolo').unique();
    t.string('contrato_id');
    t.string('cpf');
    t.timestamp('aguardando_desde');
    t.timestamp('criado_em').defaultTo(db.fn.now());
    t.timestamp('atualizado').defaultTo(db.fn.now());
    t.jsonb('meta').defaultTo('{}');

    // Índices
    t.index(['status']);
    t.index(['canal']);
    t.index(['telefone']);
    t.index(['atualizado']);
  });

  // ── MENSAGENS ─────────────────────────────────────────────────
  await db.schema.createTableIfNotExists('mensagens', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.uuid('conversa_id').notNullable().references('id').inTable('conversas').onDelete('CASCADE');
    t.string('origem').notNullable();         // 'cliente' | 'agente' | 'ia' | 'sistema'
    t.uuid('agente_id').references('id').inTable('agentes').onDelete('SET NULL');
    t.string('tipo').defaultTo('texto');      // 'texto' | 'imagem' | 'audio' | 'video' | 'doc' | 'nota'
    t.text('texto');
    t.string('url');
    t.string('mime');
    t.boolean('lida').defaultTo(false);
    t.jsonb('reacoes').defaultTo('{}');
    t.boolean('apagada').defaultTo(false);
    t.string('external_id');                  // ID na plataforma de origem (WhatsApp, etc)
    t.timestamp('criado_em').defaultTo(db.fn.now());
    t.jsonb('meta').defaultTo('{}');

    t.index(['conversa_id', 'criado_em']);
    t.index(['external_id']);
  });

  // ── NOTAS INTERNAS ────────────────────────────────────────────
  await db.schema.createTableIfNotExists('notas', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.uuid('conversa_id').notNullable().references('id').inTable('conversas').onDelete('CASCADE');
    t.uuid('agente_id').references('id').inTable('agentes').onDelete('SET NULL');
    t.text('texto').notNullable();
    t.timestamp('criado_em').defaultTo(db.fn.now());
  });

  // ── RESPOSTAS RÁPIDAS ─────────────────────────────────────────
  await db.schema.createTableIfNotExists('respostas_rapidas', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('titulo').notNullable();
    t.text('texto').notNullable();
    t.string('atalho');
    t.uuid('agente_id').references('id').inTable('agentes').onDelete('SET NULL');
    t.timestamp('criado_em').defaultTo(db.fn.now());
  });

  // ── FLUXOS ───────────────────────────────────────────────────
  await db.schema.createTableIfNotExists('fluxos', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('nome').notNullable();
    t.boolean('ativo').defaultTo(false);
    t.jsonb('nos').defaultTo('[]');
    t.jsonb('conexoes').defaultTo('[]');
    t.string('gatilho');
    t.timestamp('criado_em').defaultTo(db.fn.now());
    t.timestamp('atualizado').defaultTo(db.fn.now());
  });

  // ── AGENDAMENTOS ──────────────────────────────────────────────
  await db.schema.createTableIfNotExists('agendamentos', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.uuid('conversa_id').notNullable().references('id').inTable('conversas').onDelete('CASCADE');
    t.uuid('agente_id').references('id').inTable('agentes').onDelete('SET NULL');
    t.timestamp('data_hora').notNullable();
    t.string('motivo');
    t.boolean('executado').defaultTo(false);
    t.timestamp('criado_em').defaultTo(db.fn.now());
  });

  // ── TAREFAS ───────────────────────────────────────────────────
  await db.schema.createTableIfNotExists('tarefas', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('titulo').notNullable();
    t.text('descricao');
    t.uuid('agente_id').references('id').inTable('agentes').onDelete('SET NULL');
    t.uuid('conversa_id').references('id').inTable('conversas').onDelete('SET NULL');
    t.string('status').defaultTo('aberta');   // 'aberta' | 'em_andamento' | 'concluida'
    t.string('prioridade').defaultTo('normal');
    t.timestamp('prazo');
    t.timestamp('criado_em').defaultTo(db.fn.now());
    t.timestamp('atualizado').defaultTo(db.fn.now());
  });

  // ── SATISFAÇÃO (NPS) ──────────────────────────────────────────
  await db.schema.createTableIfNotExists('avaliacoes', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.uuid('conversa_id').references('id').inTable('conversas').onDelete('SET NULL');
    t.uuid('agente_id').references('id').inTable('agentes').onDelete('SET NULL');
    t.integer('nota').notNullable();          // 1–5 ou 1–10
    t.text('comentario');
    t.timestamp('criado_em').defaultTo(db.fn.now());
  });

  // ── OCORRÊNCIAS ───────────────────────────────────────────────
  await db.schema.createTableIfNotExists('ocorrencias', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('titulo').notNullable();
    t.text('descricao');
    t.string('tipo');
    t.string('status').defaultTo('aberta');
    t.string('prioridade').defaultTo('normal');
    t.uuid('agente_id').references('id').inTable('agentes').onDelete('SET NULL');
    t.uuid('conversa_id').references('id').inTable('conversas').onDelete('SET NULL');
    t.string('contrato_id');
    t.timestamp('criado_em').defaultTo(db.fn.now());
    t.timestamp('atualizado').defaultTo(db.fn.now());
    t.jsonb('meta').defaultTo('{}');

    t.index(['status']);
    t.index(['tipo']);
  });

  // ── LOGS DE AUDITORIA ─────────────────────────────────────────
  await db.schema.createTableIfNotExists('auditoria', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.uuid('agente_id').references('id').inTable('agentes').onDelete('SET NULL');
    t.string('acao').notNullable();
    t.string('recurso');
    t.string('recurso_id');
    t.jsonb('detalhe').defaultTo('{}');
    t.string('ip');
    t.timestamp('criado_em').defaultTo(db.fn.now());

    t.index(['criado_em']);
    t.index(['agente_id']);
  });
}

export async function down(db) {
  const tables = [
    'auditoria', 'avaliacoes', 'tarefas', 'agendamentos',
    'notas', 'ocorrencias', 'mensagens', 'conversas',
    'respostas_rapidas', 'fluxos', 'canais', 'agentes', 'sistema_kv',
  ];
  for (const t of tables) {
    await db.schema.dropTableIfExists(t);
  }
}
