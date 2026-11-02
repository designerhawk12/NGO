import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { closePool, withTransaction } from './pool';

const migrationDirectory = existsSync(resolve(process.cwd(), 'db/migrations'))
  ? resolve(process.cwd(), 'db/migrations')
  : resolve(__dirname, '../../db/migrations');
const mode = process.argv[2];
if (mode !== 'up' && mode !== 'status') throw new Error('Use migrate.ts up or migrate.ts status.');

async function main() {
  await withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(29017, 1)');
    if (mode === 'up') {
      await client.query('CREATE SCHEMA IF NOT EXISTS app');
      await client.query(`CREATE TABLE IF NOT EXISTS app.schema_migrations (
        name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    }
    const hasTable = await client.query<{ table_name: string | null }>("SELECT to_regclass('app.schema_migrations') AS table_name");
    const applied = hasTable.rows[0].table_name
      ? await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM app.schema_migrations')
      : { rows: [] as { name: string; checksum: string }[] };
    const existing = new Map(applied.rows.map(row => [row.name, row.checksum]));
    const files = readdirSync(migrationDirectory).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
    for (const name of files) {
      const sql = readFileSync(resolve(migrationDirectory, name), 'utf8').replace(/\r\n/g, '\n');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (existing.has(name)) {
        if (existing.get(name) !== checksum) throw new Error(`Applied migration changed: ${name}`);
        console.info(`applied ${name}`);
      } else if (mode === 'up') {
        await client.query(sql);
        await client.query('INSERT INTO app.schema_migrations(name, checksum) VALUES ($1, $2)', [name, checksum]);
        console.info(`applied ${name}`);
      } else console.info(`pending ${name}`);
    }
    for (const name of existing.keys()) if (!files.includes(name)) throw new Error(`Applied migration missing from repository: ${name}`);
  });
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => closePool());
