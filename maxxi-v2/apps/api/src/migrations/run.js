/**
 * Sistema de migrations versionadas
 * Cada migration é um arquivo com up() e down()
 * Nunca mais ALTER TABLE inline no startup
 */
import { getDb } from '../config/db.js';
import { readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function ensureMigrationsTable(db) {
  await db.schema.createTableIfNotExists('_migrations', (t) => {
    t.increments('id');
    t.string('name').notNullable().unique();
    t.timestamp('executed_at').defaultTo(db.fn.now());
  });
}

async function getExecuted(db) {
  const rows = await db('_migrations').select('name');
  return new Set(rows.map(r => r.name));
}

export async function runMigrations() {
  const db = getDb();
  await ensureMigrationsTable(db);

  const executed = await getExecuted(db);
  const dir      = resolve(__dirname, 'versions');

  const files = readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (executed.has(file)) continue;

    console.log(`  ▶ Running migration: ${file}`);
    const mod = await import(resolve(dir, file));

    const trx = await db.transaction();
    try {
      await mod.up(trx);
      await trx('_migrations').insert({ name: file });
      await trx.commit();
      ran++;
      console.log(`  ✓ ${file}`);
    } catch (err) {
      await trx.rollback();
      console.error(`  ✗ ${file}:`, err.message);
      throw err;
    }
  }

  if (ran === 0) {
    console.log('  ✓ Nenhuma migration pendente');
  } else {
    console.log(`  ✓ ${ran} migration(s) executada(s)`);
  }
}

// Execução direta: node src/migrations/run.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => { console.log('✅ Migrations concluídas'); process.exit(0); })
    .catch(err => { console.error('❌ Erro:', err); process.exit(1); });
}
