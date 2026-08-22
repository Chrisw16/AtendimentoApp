/**
 * 020_ia_runtime.js — AI Runtime V1 (FASE 9).
 *
 * Duas tabelas, e a segunda existe por uma razão específica: hoje o desfecho de
 * um atendimento por IA só existe como PORTA do fluxo (`resolvido`,
 * `transferir`, `max_turnos`). Isso basta para o motor andar e não basta para
 * ninguém responder "por que a IA transferiu?" — §71 é explícito: não
 * considerar `resolvido` só porque a IA terminou de escrever.
 *
 * O handoff (§74) mora DENTRO de `ia_execucoes`, como jsonb, em vez de virar
 * tabela própria: ele é o desfecho de uma execução que terminou em
 * transferência, não uma entidade com vida independente.
 */
export async function up(db) {
  // §66 — um perfil junta o que hoje é reconfigurado nó a nó.
  if (!await db.schema.hasTable('ia_perfis')) {
    await db.schema.createTable('ia_perfis', t => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.string('slug').notNullable().unique();   // é o que o nó grava em cfg.perfil
      t.string('nome').notNullable();
      t.text('descricao');
      t.string('prompt_slug');                   // prompts_ia.slug — base e estilo
      t.string('playbook_slug');                 // playbooks.slug
      t.jsonb('tools').defaultTo('[]');          // tools permitidas (vazio = padrão do motor)
      t.integer('max_turnos').defaultTo(6);
      t.uuid('knowledge_categoria_id');          // escopo da base de conhecimento
      t.string('goal');                          // §70 — objetivo estruturado
      t.text('regras_transferencia');
      t.boolean('ativo').defaultTo(true);
      t.timestamp('criado_em').defaultTo(db.fn.now());
      t.timestamp('atualizado').defaultTo(db.fn.now());
    });
    console.log('  ✓ ia_perfis');
  }

  // §70/§71/§73/§74 — desfecho estruturado de cada passagem pelo `ia_responde`.
  if (!await db.schema.hasTable('ia_execucoes')) {
    await db.schema.createTable('ia_execucoes', t => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.uuid('conversa_id').notNullable();
      t.string('no_id');                         // qual nó do fluxo
      t.string('perfil_slug');
      t.string('goal');
      t.string('desfecho');                      // resolvido | transferido | max_turnos | erro
      t.string('motivo');                        // §73 — valor estruturado, nunca texto livre
      t.integer('turnos').defaultTo(0);
      t.jsonb('tools_usadas').defaultTo('[]');
      t.jsonb('handoff');                        // §74 — só quando desfecho = transferido
      t.timestamp('criado_em').defaultTo(db.fn.now());
      t.index(['conversa_id']);
      t.index(['desfecho']);
      t.index(['motivo']);
    });
    console.log('  ✓ ia_execucoes');
  }
}

export async function down(db) {
  await db.schema.dropTableIfExists('ia_execucoes');
  await db.schema.dropTableIfExists('ia_perfis');
}
