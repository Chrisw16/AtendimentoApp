/**
 * 015 — `audit_log` (§119 do plano): quem fez o quê, inclusive a IA.
 *
 * `actor_type` separa os três mundos: `human` (agente logado), `ai` (tool de
 * escrita executada pela IA num atendimento) e `system` (limiter, seed, boot).
 *
 * `before`/`after` guardam o diff relevante — NUNCA valores de credencial:
 * quem audita mudança do sysconfig grava só os NOMES das chaves alteradas.
 *
 * Sem FK para agentes/conversas de propósito: auditoria não pode sumir quando
 * o recurso auditado for apagado, nem impedir o apagamento.
 */
export async function up(db) {
  const jaTem = await db.schema.hasTable('audit_log');
  if (jaTem) {
    console.log('  ✓ Tabela audit_log já existe');
    return;
  }
  await db.schema.createTable('audit_log', t => {
    t.bigIncrements('id').primary();
    t.string('actor_type').notNullable();   // human | ai | system
    t.string('actor_id');                   // agente.id, nome da tool, ou null
    t.string('action').notNullable();       // login_ok, login_falha, sysconfig_alterado, ...
    t.string('resource');                   // rota/tabela/tool atingida
    t.jsonb('before');
    t.jsonb('after');
    t.uuid('conversa_id');
    t.string('ip');
    t.timestamp('criado_em').defaultTo(db.fn.now());

    t.index(['action']);
    t.index(['actor_type', 'actor_id']);
    t.index(['criado_em']);
  });
  console.log('  ✓ Tabela audit_log criada');
}

export async function down(db) {
  await db.schema.dropTableIfExists('audit_log');
}
