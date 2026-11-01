import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { withTransaction } from './pool';

export type MigrationMode = 'up' | 'status';

const migrationDirectory = resolve(process.cwd(), 'db/migrations');
const verifiedHistoricalMigration = {
  name: '005_functions.sql',
  checksum: '94bab7ac366215d29fd7346ed61ffb929a9858acb8cf2a6e58f5b8055080e94c',
} as const;

export async function runMigrations(mode: MigrationMode): Promise<void> {
  await withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(29017, 1)');
    if (mode === 'up') {
      await client.query('CREATE SCHEMA IF NOT EXISTS app');
      await client.query(
        'CREATE TABLE IF NOT EXISTS app.schema_migrations (' +
        'name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())'
      );
    }

    const hasTable = await client.query<{ table_name: string | null }>(
      "SELECT to_regclass('app.schema_migrations') AS table_name"
    );
    const applied = hasTable.rows[0].table_name
      ? await client.query<{ name: string; checksum: string }>(
          'SELECT name, checksum FROM app.schema_migrations'
        )
      : { rows: [] as { name: string; checksum: string }[] };
    const existing = new Map(applied.rows.map(row => [row.name, row.checksum]));
    const files = readdirSync(migrationDirectory)
      .filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    const migrationContents = new Map<string, { sql: string; checksum: string }>();

    for (const name of files) {
      const sql = readFileSync(resolve(migrationDirectory, name), 'utf8');
      migrationContents.set(name, {
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      });
    }

    for (const [name, checksum] of existing) {
      const localMigration = migrationContents.get(name);
      if (!localMigration) {
        if (
          name === verifiedHistoricalMigration.name &&
          checksum === verifiedHistoricalMigration.checksum
        ) {
          console.warn(
            'WARNING: accepted applied 005_functions.sql from its verified ledger checksum; ' +
            'the original SQL is unavailable for source comparison.'
          );
          continue;
        }
        if (name === verifiedHistoricalMigration.name) {
          throw new Error(
            'Missing applied migration 005_functions.sql has an unexpected ledger checksum.'
          );
        }
        throw new Error('Applied migration missing from repository: ' + name);
      }
      if (localMigration.checksum !== checksum) {
        throw new Error('Applied migration changed: ' + name);
      }
    }

    if (
      !migrationContents.has(verifiedHistoricalMigration.name) &&
      !existing.has(verifiedHistoricalMigration.name)
    ) {
      throw new Error(
        'Missing migration 005_functions.sql is not recorded as applied in the database ledger.'
      );
    }

    for (const name of files) {
      const migration = migrationContents.get(name)!;
      if (existing.has(name)) {
        console.info('applied ' + name);
      } else if (mode === 'up') {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO app.schema_migrations(name, checksum) VALUES ($1, $2)',
          [name, migration.checksum]
        );
        console.info('applied ' + name);
      } else {
        console.info('pending ' + name);
      }
    }
  });
}
