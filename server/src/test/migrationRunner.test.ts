import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  files: {} as Record<string, string>,
  ledger: [] as Array<{ name: string; checksum: string }>,
  calls: [] as Array<{ sql: string; params?: unknown[] }>,
  migrationExecutions: [] as string[],
  transactionEvents: [] as string[],
  readFiles: [] as string[],
  failSql: null as string | null,
  client: {
    query: vi.fn(),
    release: vi.fn(),
  },
}));

vi.mock('node:fs', () => ({
  readdirSync: () => Object.keys(state.files),
  readFileSync: (path: string) => {
    const name = path.split(/[\\/]/).pop() ?? '';
    state.readFiles.push(name);
    if (!(name in state.files)) throw new Error('Unexpected migration file read.');
    return state.files[name];
  },
  existsSync: () => false,
}));

vi.mock('../config/env', () => ({
  env: {
    databaseUrl: 'postgres://isolated-test.invalid/database',
    databaseSsl: false,
    databaseSslCaPath: undefined,
    databaseSslCa: undefined,
  },
}));

vi.mock('pg', () => ({
  Pool: class {
    on() {
      return this;
    }

    async connect() {
      return state.client;
    }

    async end() {}
  },
}));

import { closePool } from '../db/pool';
import { runMigrations } from '../db/migrationRunner';

const historicalChecksum = '94bab7ac366215d29fd7346ed61ffb929a9858acb8cf2a6e58f5b8055080e94c';
const availableMigrations: Record<string, string> = {
  '001_core.sql': "SELECT '001';",
  '002_modules.sql': "SELECT '002';",
  '003_vehicle_details.sql': "SELECT '003';",
  '004_vessels.sql': "SELECT '004';",
  '007_volunteer_applications.sql': "SELECT '007';",
  '006_volunteer_approval.sql.disabled': "SELECT '006 must never run';",
};

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

function appliedCoreMigrations(): Array<{ name: string; checksum: string }> {
  return Object.entries(availableMigrations)
    .filter(([name]) => /^00[1-4]_/.test(name))
    .map(([name, sql]) => ({ name, checksum: checksum(sql) }));
}

function expectRollback(): void {
  expect(state.transactionEvents).toEqual(['BEGIN', 'ROLLBACK']);
  expect(state.client.release).toHaveBeenCalledOnce();
}

beforeEach(() => {
  state.files = { ...availableMigrations };
  state.ledger = [];
  state.calls = [];
  state.migrationExecutions = [];
  state.transactionEvents = [];
  state.readFiles = [];
  state.failSql = null;
  state.client.query.mockReset().mockImplementation(async (statement: string, params?: unknown[]) => {
    const sql = String(statement);
    state.calls.push({ sql, params });
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      state.transactionEvents.push(sql);
    }
    if (sql.includes("to_regclass('app.schema_migrations')")) {
      return { rows: [{ table_name: 'app.schema_migrations' }] };
    }
    if (sql === 'SELECT name, checksum FROM app.schema_migrations') {
      return { rows: state.ledger };
    }
    if (sql === 'INSERT INTO app.schema_migrations(name, checksum) VALUES ($1, $2)') {
      return { rows: [], rowCount: 1 };
    }
    if (Object.values(state.files).includes(sql)) {
      state.migrationExecutions.push(sql);
      if (state.failSql === sql) throw new Error('simulated migration failure');
    }
    return { rows: [], rowCount: 1 };
  });
  state.client.release.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await closePool();
});

describe('migration runner historical 005 reconciliation', () => {
  it('accepts only the exact applied 005 ledger checksum and runs pending migrations transactionally', async () => {
    state.files['008_followup.sql'] = "SELECT '008';";
    state.ledger = [
      ...appliedCoreMigrations(),
      { name: '005_functions.sql', checksum: historicalChecksum },
    ];

    await runMigrations('up');

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(
      'accepted applied 005_functions.sql from its verified ledger checksum'
    ));
    expect(state.migrationExecutions).toEqual([
      availableMigrations['007_volunteer_applications.sql'],
      "SELECT '008';",
    ]);
    expect(state.calls).toContainEqual({
      sql: 'INSERT INTO app.schema_migrations(name, checksum) VALUES ($1, $2)',
      params: ['007_volunteer_applications.sql', checksum(availableMigrations['007_volunteer_applications.sql'])],
    });
    expect(state.readFiles).not.toContain('006_volunteer_approval.sql.disabled');
    expect(state.calls.some(call => /\b(UPDATE|DELETE)\b/i.test(call.sql))).toBe(false);
    expect(state.transactionEvents).toEqual(['BEGIN', 'COMMIT']);
    expect(state.client.release).toHaveBeenCalledOnce();
  });

  it('rejects a missing 005 ledger record before applying any pending migration', async () => {
    state.ledger = appliedCoreMigrations();

    await expect(runMigrations('up')).rejects.toThrow(
      'Missing migration 005_functions.sql is not recorded as applied in the database ledger.'
    );

    expect(state.migrationExecutions).toEqual([]);
    expectRollback();
  });

  it('rejects a mismatched 005 checksum and rolls back', async () => {
    state.ledger = [
      ...appliedCoreMigrations(),
      { name: '005_functions.sql', checksum: '0'.repeat(64) },
    ];

    await expect(runMigrations('up')).rejects.toThrow(
      'Missing applied migration 005_functions.sql has an unexpected ledger checksum.'
    );

    expect(state.migrationExecutions).toEqual([]);
    expectRollback();
  });

  it('rejects any other applied migration whose file is missing and rolls back', async () => {
    state.ledger = [
      ...appliedCoreMigrations(),
      { name: '005_functions.sql', checksum: historicalChecksum },
      { name: '006_retired_migration.sql', checksum: '1'.repeat(64) },
    ];

    await expect(runMigrations('up')).rejects.toThrow(
      'Applied migration missing from repository: 006_retired_migration.sql'
    );

    expect(state.migrationExecutions).toEqual([]);
    expectRollback();
  });

  it('checks available applied migration checksums before applying pending SQL', async () => {
    state.ledger = [
      ...appliedCoreMigrations().map(row => row.name === '004_vessels.sql'
        ? { ...row, checksum: '2'.repeat(64) }
        : row),
      { name: '005_functions.sql', checksum: historicalChecksum },
    ];

    await expect(runMigrations('up')).rejects.toThrow('Applied migration changed: 004_vessels.sql');

    expect(state.migrationExecutions).toEqual([]);
    expectRollback();
  });

  it('rolls back pending migration SQL failures within the existing transaction', async () => {
    state.ledger = [
      ...appliedCoreMigrations(),
      { name: '005_functions.sql', checksum: historicalChecksum },
    ];
    state.failSql = availableMigrations['007_volunteer_applications.sql'];

    await expect(runMigrations('up')).rejects.toThrow('simulated migration failure');

    expect(state.transactionEvents).toEqual(['BEGIN', 'ROLLBACK']);
    expect(state.client.release).toHaveBeenCalledOnce();
  });

  it('reports pending migration status without executing pending SQL', async () => {
    state.ledger = [
      ...appliedCoreMigrations(),
      { name: '005_functions.sql', checksum: historicalChecksum },
    ];

    await runMigrations('status');

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(
      'original SQL is unavailable for source comparison'
    ));
    expect(console.info).toHaveBeenCalledWith('pending 007_volunteer_applications.sql');
    expect(state.migrationExecutions).toEqual([]);
    expect(state.calls.some(call => /\b(UPDATE|DELETE)\b/i.test(call.sql))).toBe(false);
    expect(state.transactionEvents).toEqual(['BEGIN', 'COMMIT']);
  });
});
