import { getDb } from '../config/db.js';
import { readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function ensureMigrationsTable(db) {
  // Usa raw SQL para evitar o bug do knex com createTableIfNotExists
  await db.raw(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      executed_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // Adiciona unique só se não existir (evita erro de constraint duplicada)
  await db.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_migrations_name_unique') THEN
        ALTER TABLE _migrations ADD CONSTRAINT _migrations_name_unique UNIQUE (name);
      END IF;
    END $$;
  `).catch(() => {});
}

async function getExecuted(db) {
  const rows = await db('_migrations').select('name');
  return new Set(rows.map(r => r.name));
}

export async function runMigrations() {
  const db = getDb();
  await ensureMigrationsTable(db);

  const executed = await getExecuted(db);
  const dir = resolve(__dirname, 'versions');
  const files = readdirSync(dir).filter(f => f.endsWith('.js')).sort();

  let ran = 0;
  for (const file of files) {
    if (executed.has(file)) continue;
    console.log(`  ▶ ${file}`);
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
  console.log(ran === 0 ? '  ✓ Nenhuma migration pendente' : `  ✓ ${ran} migration(s)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => { console.log('✅ OK'); process.exit(0); })
    .catch(err => { console.error('❌', err.message); process.exit(1); });
}
