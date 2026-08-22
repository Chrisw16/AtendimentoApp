/**
 * 019_playbooks.js — Playbook Engine (FASE 8).
 *
 * Playbook é a fonte oficial de COMO executar um procedimento (§58), e o mesmo
 * playbook precisa servir três consumidores: a IA Atendente (agora), o Copiloto
 * (FASE 10) e a Quality AI (FASE 11). Por isso a etapa não é texto solto: ela
 * declara `tools`, e é isso que permite medir execução sem depender de a IA
 * dizer que fez.
 *
 * O workflow aqui é `rascunho → teste → publicado → arquivado` — repare que é
 * DIFERENTE do Knowledge (`rascunho → revisao → publicado → arquivado`). Não é
 * descuido: procedimento se valida RODANDO (estado `teste`), texto se valida
 * LENDO (estado `revisão`). Os dois vivem em máquinas de estado separadas.
 */
export async function up(db) {
  if (!await db.schema.hasTable('playbooks')) {
    await db.schema.createTable('playbooks', t => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.string('nome').notNullable();
      t.string('slug').notNullable().unique();  // é o que o nó `ia_responde` grava em cfg.playbook
      t.string('dominio').defaultTo('suporte'); // suporte | comercial | financeiro | retencao
      t.text('objetivo');
      t.jsonb('gatilhos').defaultTo('[]');      // intenções que sugerem este playbook (§59)
      t.text('criterios_sucesso');
      t.text('criterios_transferencia');
      t.text('excecoes');                       // §61 — o playbook NÃO é checklist burro
      t.string('status').defaultTo('rascunho'); // rascunho | teste | publicado | arquivado
      t.integer('versao').defaultTo(1);
      t.uuid('criado_por').references('id').inTable('agentes').onDelete('SET NULL');
      t.timestamp('publicado_em');
      t.timestamp('criado_em').defaultTo(db.fn.now());
      t.timestamp('atualizado').defaultTo(db.fn.now());
      t.index(['status']);
      t.index(['dominio']);
    });
    console.log('  ✓ playbooks');
  }

  if (!await db.schema.hasTable('playbook_etapas')) {
    await db.schema.createTable('playbook_etapas', t => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.uuid('playbook_id').notNullable().references('id').inTable('playbooks').onDelete('CASCADE');
      t.integer('ordem').notNullable();
      t.string('titulo').notNullable();
      t.text('descricao');
      // obrigatoria | opcional | condicional (§59). A diferença importa: só a
      // obrigatória pendente impede considerar o procedimento cumprido.
      t.string('obrigatoriedade').defaultTo('obrigatoria');
      t.text('condicao');                        // quando `condicional`, o que a ativa
      // Tools que EVIDENCIAM esta etapa. É o coração do rastreamento: chamou a
      // tool, cumpriu a etapa — sem depender de a IA se auto-reportar.
      t.jsonb('tools').defaultTo('[]');
      t.uuid('subplaybook_id').references('id').inTable('playbooks').onDelete('SET NULL'); // §63
      t.unique(['playbook_id', 'ordem']);
    });
    console.log('  ✓ playbook_etapas');
  }

  // §64 — execuções e auditorias antigas preservam a versão utilizada. O
  // snapshot é o playbook INTEIRO (com etapas) no momento da publicação:
  // reconstruir a partir das tabelas vivas mostraria o procedimento de hoje,
  // não o que estava valendo no atendimento auditado.
  if (!await db.schema.hasTable('playbook_versoes')) {
    await db.schema.createTable('playbook_versoes', t => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.uuid('playbook_id').notNullable().references('id').inTable('playbooks').onDelete('CASCADE');
      t.integer('versao').notNullable();
      t.jsonb('snapshot').notNullable();
      t.uuid('criado_por').references('id').inTable('agentes').onDelete('SET NULL');
      t.timestamp('criado_em').defaultTo(db.fn.now());
      t.unique(['playbook_id', 'versao']);
    });
    console.log('  ✓ playbook_versoes');
  }

  if (!await db.schema.hasTable('playbook_execucoes')) {
    await db.schema.createTable('playbook_execucoes', t => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.uuid('conversa_id').notNullable();
      t.uuid('playbook_id').notNullable().references('id').inTable('playbooks').onDelete('CASCADE');
      t.integer('versao').notNullable();
      // Ids das etapas cumpridas, com como foram cumpridas ({etapa_id, via, em}).
      t.jsonb('etapas_feitas').defaultTo('[]');
      t.string('resultado');                      // em_andamento | concluido | transferido | abandonado
      t.timestamp('iniciado_em').defaultTo(db.fn.now());
      t.timestamp('concluido_em');
      // Uma execução viva por (conversa, playbook): o cliente que volta ao mesmo
      // procedimento continua de onde parou em vez de recomeçar do zero.
      t.unique(['conversa_id', 'playbook_id']);
      t.index(['playbook_id']);
    });
    console.log('  ✓ playbook_execucoes');
  }
}

export async function down(db) {
  await db.schema.dropTableIfExists('playbook_execucoes');
  await db.schema.dropTableIfExists('playbook_versoes');
  await db.schema.dropTableIfExists('playbook_etapas');
  await db.schema.dropTableIfExists('playbooks');
}
