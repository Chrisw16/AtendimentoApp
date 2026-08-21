/**
 * Ambiente dos testes de integração — os que precisam de um Postgres de verdade.
 *
 * A suíte principal (`npm test`) é pura e roda em qualquer máquina, sem serviço
 * nenhum. Os testes deste diretório são a exceção: existem justamente para
 * provar o que só o banco pode provar (constraints, ON CONFLICT, transações).
 *
 * Contrato: sem `DATABASE_URL_TEST` no ambiente, eles se PULAM em vez de
 * falhar. Assim `npm test` continua verde numa máquina sem Postgres e
 * `npm run test:integracao` exige o banco explicitamente.
 *
 * ⚠️ Aponte SEMPRE para um banco descartável. O preparo TRUNCA tabelas.
 */

export const URL_TESTE = process.env.DATABASE_URL_TEST || null;

/** Motivo do skip, ou `false` quando há banco. Usar como `{ skip: motivoSkip() }`. */
export function motivoSkip() {
  return URL_TESTE ? false : 'sem DATABASE_URL_TEST — teste de integração pulado';
}

/**
 * Conecta e garante o schema.
 *
 * `config/db.js` lê `DATABASE_URL` no primeiro `getDb()` e memoiza o pool, então
 * a env precisa estar posta ANTES do import — por isso os imports aqui são
 * dinâmicos e este helper deve ser chamado de dentro do `before()`.
 */
export async function prepararBanco({ migrar = true } = {}) {
  if (!URL_TESTE) throw new Error('prepararBanco() sem DATABASE_URL_TEST');
  process.env.DATABASE_URL = URL_TESTE;

  const { getDb } = await import('../../src/config/db.js');
  if (migrar) {
    const { runMigrations } = await import('../../src/migrations/run.js');
    const log = console.log;
    console.log = () => {};           // o runner é verboso; silencia só aqui
    try { await runMigrations(); } finally { console.log = log; }
  }
  return getDb();
}

/** Esvazia as tabelas indicadas respeitando as FKs. */
export async function limpar(db, tabelas) {
  if (!tabelas.length) return;
  const lista = tabelas.map(t => `"${t}"`).join(', ');
  await db.raw(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`);
}

/** Conversa mínima válida — `canal` é a única coluna obrigatória sem default. */
export async function criarConversa(db, dados = {}) {
  const [conversa] = await db('conversas')
    .insert({ canal: 'whatsapp', ...dados })
    .returning('*');
  return conversa;
}

/**
 * ⚠️ Os testes deste diretório compartilham UM banco e cada arquivo aplica as
 * migrations no `before()`. Rodá-los em paralelo faz dois processos criarem
 * `_migrations` ao mesmo tempo e o schema sai pela metade. Por isso o script
 * `test:integracao` usa `--test-concurrency=1`. Ao adicionar um arquivo aqui,
 * não o rode fora desse script.
 */
