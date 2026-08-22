/**
 * 023_quality_ai.js — Quality AI V1 (FASE 11).
 *
 * Duas tabelas. Os CRITÉRIOS ficam em `jsonb` dentro do scorecard, e não em
 * tabela própria como as etapas de playbook — a diferença é real: etapa de
 * playbook é referenciada de fora (`playbook_execucoes.etapas_feitas` guarda o
 * id dela), critério não é. A auditoria guarda a própria cópia do que avaliou,
 * então um critério nunca precisa de identidade que sobreviva por conta.
 *
 * `ai_score`, `human_score` e `final_score` são colunas separadas por exigência
 * do §98: quando o supervisor discorda, o que a IA achou **não** é apagado —
 * é justamente a divergência que ensina a calibrar o scorecard.
 */
export async function up(db) {
  if (!await db.schema.hasTable('quality_scorecards')) {
    await db.schema.createTable('quality_scorecards', t => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.string('slug').notNullable().unique();
      t.string('nome').notNullable();
      t.string('perfil').defaultTo('suporte');   // suporte | comercial
      t.text('descricao');
      // [{ id, nome, descricao, peso, instrucao, evidencias, critico }]  (§91)
      t.jsonb('criterios').defaultTo('[]');
      t.boolean('ativo').defaultTo(false);       // nasce desligado: auditar custa IA
      t.integer('versao').defaultTo(1);
      t.timestamp('criado_em').defaultTo(db.fn.now());
      t.timestamp('atualizado').defaultTo(db.fn.now());
      t.index(['perfil', 'ativo']);
    });
    console.log('  ✓ quality_scorecards');
  }

  if (!await db.schema.hasTable('quality_auditorias')) {
    await db.schema.createTable('quality_auditorias', t => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.uuid('conversa_id').notNullable();
      t.uuid('agente_id').references('id').inTable('agentes').onDelete('SET NULL');
      t.uuid('scorecard_id').references('id').inTable('quality_scorecards').onDelete('SET NULL');
      t.integer('scorecard_versao');
      t.string('perfil');

      // §98 — os três convivem. `final` é o humano quando houve revisão.
      t.integer('ai_score');
      t.integer('human_score');
      t.integer('final_score');

      // [{ criterio_id, nota, justificativa, evidencias[] }]  (§97)
      t.jsonb('avaliacoes').defaultTo('[]');
      t.jsonb('violacoes').defaultTo('[]');      // §96 — mecanismo separado
      t.jsonb('oportunidades').defaultTo('[]');  // §93 — oportunidade perdida
      t.jsonb('aderencia');                      // §95 — playbook esperado × executado
      t.text('resumo');
      t.text('coaching');                        // §99 — o que treinar neste atendimento

      t.uuid('revisado_por').references('id').inTable('agentes').onDelete('SET NULL');
      t.timestamp('revisado_em');
      t.text('observacao_humana');

      t.string('origem').defaultTo('automatica'); // automatica | manual
      t.timestamp('criado_em').defaultTo(db.fn.now());

      // Uma auditoria por conversa: reauditar SUBSTITUI, senão o dashboard soma
      // a mesma conversa várias vezes e a média mente.
      t.unique(['conversa_id']);
      t.index(['agente_id']);
      t.index(['criado_em']);
    });
    console.log('  ✓ quality_auditorias');
  }
}

export async function down(db) {
  await db.schema.dropTableIfExists('quality_auditorias');
  await db.schema.dropTableIfExists('quality_scorecards');
}
