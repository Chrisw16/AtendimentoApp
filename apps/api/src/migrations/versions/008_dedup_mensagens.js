/**
 * Unique em `mensagens.external_id` — dedup de reentrega de webhook.
 *
 * A 001 criou só um índice NÃO-único. Os webhooks fazem "checa porExternalId →
 * insere", um TOCTOU: numa reentrega concorrente da Evolution as duas execuções
 * passam pela checagem antes de qualquer insert → a mensagem duplica, o motor
 * roda 2x e a IA responde (e cobra) em dobro.
 *
 * O banco passa a ser a autoridade. NULLs continuam permitidos e distintos no
 * Postgres — mensagens de agente/sistema/IA não têm external_id e seguem normais.
 *
 * ⚠️ Esta migration APAGA linhas (duplicatas). Em produção as migrations rodam
 * sozinhas no boot, e uma falha aqui pula a inicialização dos monitores de SLA
 * e da supervisora (server.js) — por isso ela conta e loga antes de agir, e é
 * idempotente (pode rodar de novo sem estragar nada).
 */
export async function up(db) {
  // 1. Quantas duplicatas existem? Fica no log do deploy como registro do que foi feito.
  const contagem = await db.raw(`
    SELECT COUNT(*)::int AS excedentes
    FROM (
      SELECT external_id, COUNT(*) - 1 AS extras
      FROM mensagens
      WHERE external_id IS NOT NULL
      GROUP BY external_id
      HAVING COUNT(*) > 1
    ) grupos
  `);
  const excedentes = contagem?.rows?.[0]?.excedentes ?? 0;

  if (excedentes > 0) {
    console.log(`  ⚠️  ${excedentes} external_id(s) com duplicata — mantendo a mensagem mais antiga de cada`);

    // 2. Remove as excedentes, preservando a primeira que chegou.
    const del = await db.raw(`
      DELETE FROM mensagens m
      USING mensagens anterior
      WHERE m.external_id IS NOT NULL
        AND m.external_id = anterior.external_id
        AND (m.criado_em > anterior.criado_em
             OR (m.criado_em = anterior.criado_em AND m.id > anterior.id))
    `);
    console.log(`  ✓ ${del?.rowCount ?? 0} linha(s) duplicada(s) removida(s)`);
  } else {
    console.log('  ✓ Nenhuma duplicata a limpar');
  }

  // 3. Troca o índice não-único pelo único.
  await db.raw('DROP INDEX IF EXISTS mensagens_external_id_index');
  await db.raw('CREATE UNIQUE INDEX IF NOT EXISTS mensagens_external_id_unique ON mensagens (external_id)');
  console.log('  ✓ Unique em mensagens.external_id criada');
}

export async function down(db) {
  await db.raw('DROP INDEX IF EXISTS mensagens_external_id_unique');
  await db.raw('CREATE INDEX IF NOT EXISTS mensagens_external_id_index ON mensagens (external_id)');
}
