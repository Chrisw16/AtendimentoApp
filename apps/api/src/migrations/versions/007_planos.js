/**
 * Tabela `planos` — catálogo local de planos vinculados ao SGP.
 *
 * O ID do plano no SGP é o que vai no campo `plano_id` do POST /api/precadastro/F.
 * Cadastrando aqui, a IA sabe quais planos oferecer e qual ID usar quando o
 * cliente escolher (via tool `listar_planos_ativos`).
 */
export async function up(db) {
  const exists = await db.schema.hasTable('planos');
  if (exists) {
    console.log('  ✓ Tabela planos já existe');
    return;
  }
  await db.schema.createTable('planos', t => {
    t.increments('id').primary();                    // PK interna
    t.integer('plano_id_sgp').notNullable();         // ID no SGP (vai pro precadastro)
    t.string('nome').notNullable();                  // ex: "Essencial 300M"
    t.decimal('valor', 10, 2);                       // ex: 59.90
    t.string('velocidade');                          // ex: "300M"
    t.string('cidade');                              // ex: "Natal" / "Macaíba" / "São Miguel do Gostoso"
    t.integer('fidelidade_meses').defaultTo(0);      // 0 = sem fidelidade
    t.boolean('ativo').defaultTo(true);              // permite desativar sem apagar
    t.integer('ordem').defaultTo(0);                 // ordenação manual no painel
    t.text('descricao');                             // texto livre opcional
    t.timestamp('criado').defaultTo(db.fn.now());
    t.timestamp('atualizado').defaultTo(db.fn.now());
  });
  console.log('  ✓ Tabela planos criada');
}

export async function down(db) {
  await db.schema.dropTableIfExists('planos');
}
