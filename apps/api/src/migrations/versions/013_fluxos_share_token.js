/**
 * Link público de teste por fluxo.
 *
 * `share_token` — token aleatório do link `/teste/<token>` (null = sem link).
 * O link abre só o chat (sem login) e roda o motor em modo sandbox
 * (SGP/IA reais, escritas simuladas). Revogável: regenerar troca o token;
 * apagar (null) desativa o link.
 */
export async function up(db) {
  const jaTem = await db.schema.hasColumn('fluxos', 'share_token');
  if (jaTem) {
    console.log('  ✓ Coluna share_token já existe em fluxos');
    return;
  }
  await db.schema.alterTable('fluxos', t => {
    t.string('share_token').unique(); // null = link desativado (Postgres permite múltiplos NULL)
  });
  console.log('  ✓ Coluna share_token adicionada em fluxos');
}

export async function down(db) {
  await db.schema.alterTable('fluxos', t => {
    t.dropColumn('share_token');
  });
}
