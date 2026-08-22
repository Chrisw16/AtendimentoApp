/**
 * 026_observabilidade.js — error tracking (FASE 13, §139).
 *
 * Sentry como SaaS está fora: exigiria serviço externo e o payload de erro
 * carrega PII (o corpo de erro do SGP é ficha de assinante). O equivalente
 * local é **uma tabela com deduplicação por assinatura** — e é a deduplicação
 * que a torna barata: 10 mil ocorrências do mesmo defeito viram **uma linha**
 * com contador, em vez de 10 mil linhas que ninguém lê.
 *
 * `fingerprint` é `sha256(nome + mensagem NORMALIZADA + primeiro frame nosso)`.
 * "Normalizada" = números, UUIDs e ids trocados por `#`; sem isso cada
 * ocorrência tem uma mensagem ligeiramente diferente e a dedup nunca casa.
 */
export async function up(db) {
  if (!await db.schema.hasTable('erros_app')) {
    await db.schema.createTable('erros_app', t => {
      t.bigIncrements('id').primary();
      t.string('fingerprint').notNullable().unique();
      t.string('nivel').defaultTo('error');
      t.string('origem');                    // rota | worker | motor | processo
      t.string('rota');
      t.text('mensagem');                    // redigida
      t.text('stack');                       // só os frames do nosso código
      t.integer('ocorrencias').defaultTo(1);
      t.string('correlation_id');
      t.uuid('conversa_id');
      t.string('status').defaultTo('novo');  // novo | visto | ignorado
      t.timestamp('primeiro_em').defaultTo(db.fn.now());
      t.timestamp('ultimo_em').defaultTo(db.fn.now());
      t.index(['status', 'ultimo_em']);
      t.index(['ultimo_em']);
    });
    console.log('  ✓ erros_app');
  }
}

export async function down(db) {
  await db.schema.dropTableIfExists('erros_app');
}
