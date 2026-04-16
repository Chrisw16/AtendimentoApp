import Knex from 'knex';

let _db = null;

export function getDb() {
  if (_db) return _db;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não definida');
  }

  _db = Knex({
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: false,
    },
    pool: {
      min: 2,
      max: 10,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 8000,
    },
    acquireConnectionTimeout: 8000,
  });

  _db.raw('SELECT 1').catch(err => {
    console.error('❌ DB connection failed:', err.message);
  });

  return _db;
}

// Atalho para uso direto
export const db = new Proxy({}, {
  get: (_, prop) => getDb()[prop].bind(getDb()),
});

export default getDb;
