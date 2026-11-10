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
  '005_vehicle_assigned_driver.sql': "SELECT '005 vehicle';",
  '006_vehicle_photo.sql': "SELECT '006 vehicle';",
  '007_vessel_photo.sql': "SELECT '007 vessel';",
  '008_volunteer_applications.sql': "SELECT '008 applications';",
  '006_volunteer_approval.sql.disabled': "SELECT '006 must never run';",
};

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

function productionLedger(): Array<{ name: string; checksum: string }> {
  return Object.entries(availableMigrations)
    .filter(([name]) => /^00[1-7]_/.test(name) && name.endsWith('.sql'))
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

describe('migration runner ledger reconciliation', () => {
  it('runs maintenance hooks on the migration-owning client before commit', async () => {
    const order: string[] = [];
    await runMigrations('up', {
      before: async client => { expect(client).toBe(state.client); order.push('locked'); },
      after: async client => {
        expect(client).toBe(state.client);
        expect(state.transactionEvents).toEqual(['BEGIN']);
        expect(state.migrationExecutions.length).toBeGreaterThan(0);
        order.push('verified');
      },
    });
    expect(order).toEqual(['locked', 'verified']);
    expect(state.transactionEvents).toEqual(['BEGIN', 'COMMIT']);
  });

  it('fails closed before SQL when the approved pending set differs', async () => {
    await expect(runMigrations('up', { expectedPending: { '015_final_pilot.sql': '0'.repeat(64) } }))
      .rejects.toThrow('Pending migration set/checksum differs');
    expect(state.migrationExecutions).toEqual([]);
    expectRollback();
  });

  it('rolls back migration when preservation verification fails', async () => {
    await expect(runMigrations('up', { after: async () => { throw Error('preservation failed'); } }))
      .rejects.toThrow('preservation failed');
    expectRollback();
  });

  it('does not execute migrations when maintenance acquisition fails', async () => {
    await expect(runMigrations('up', { before: async () => { throw Error('lock lost'); } }))
      .rejects.toThrow('lock lost');
    expect(state.migrationExecutions).toEqual([]);
    expectRollback();
  });

  it('bootstraps a fresh ledger without inventing a historical 005 record', async () => {
    await runMigrations('up');

    expect(state.migrationExecutions).toEqual(Object.entries(availableMigrations)
      .filter(([name]) => name.endsWith('.sql'))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, sql]) => sql));
    expect(state.calls.filter(call => call.sql.startsWith('INSERT INTO app.schema_migrations')))
      .toHaveLength(8);
    expect(state.calls.some(call => call.params?.includes('005_functions.sql'))).toBe(false);
    expect(state.readFiles).not.toContain('006_volunteer_approval.sql.disabled');
    expect(state.transactionEvents).toEqual(['BEGIN', 'COMMIT']);
  });

  it('accepts the exact historical 005 checksum while applying only pending 008', async () => {
    state.ledger = [
      ...productionLedger(),
      { name: '005_functions.sql', checksum: historicalChecksum },
    ];

    await runMigrations('up');

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(
      'accepted applied 005_functions.sql from its verified ledger checksum'
    ));
    expect(state.migrationExecutions).toEqual([availableMigrations['008_volunteer_applications.sql']]);
    expect(state.transactionEvents).toEqual(['BEGIN', 'COMMIT']);
  });

  it('accepts the seven-file Production ledger and records pending 008 by its new filename', async () => {
    state.ledger = productionLedger();

    await runMigrations('up');

    expect(state.migrationExecutions).toEqual([availableMigrations['008_volunteer_applications.sql']]);
    expect(state.calls).toContainEqual({
      sql: 'INSERT INTO app.schema_migrations(name, checksum) VALUES ($1, $2)',
      params: ['008_volunteer_applications.sql', checksum(availableMigrations['008_volunteer_applications.sql'])],
    });
    expect(console.warn).not.toHaveBeenCalled();
    expect(state.transactionEvents).toEqual(['BEGIN', 'COMMIT']);
  });

  it('rejects a mismatched historical 005 checksum before executing SQL', async () => {
    state.ledger = [
      ...productionLedger(),
      { name: '005_functions.sql', checksum: '0'.repeat(64) },
    ];

    await expect(runMigrations('up')).rejects.toThrow(
      'Missing applied migration 005_functions.sql has an unexpected ledger checksum.'
    );
    expect(state.migrationExecutions).toEqual([]);
    expectRollback();
  });

  it('rejects duplicate active numeric prefixes before reading or running SQL', async () => {
    state.files['007_other.sql'] = "SELECT 'duplicate';";

    await expect(runMigrations('up')).rejects.toThrow(
      'Duplicate migration number 007: 007_other.sql, 007_vessel_photo.sql'
    );
    expect(state.readFiles).toEqual([]);
    expect(state.migrationExecutions).toEqual([]);
    expectRollback();
  });

  it('rejects another applied migration whose file is missing', async () => {
    state.ledger = [
      ...productionLedger(),
      { name: '009_retired_migration.sql', checksum: '1'.repeat(64) },
    ];

    await expect(runMigrations('up')).rejects.toThrow(
      'Applied migration missing from repository: 009_retired_migration.sql'
    );
    expect(state.migrationExecutions).toEqual([]);
    expectRollback();
  });

  it('rejects changed checksums of present applied migrations', async () => {
    state.ledger = productionLedger().map(row => row.name === '004_vessels.sql'
      ? { ...row, checksum: '2'.repeat(64) }
      : row);

    await expect(runMigrations('up')).rejects.toThrow('Applied migration changed: 004_vessels.sql');
    expect(state.migrationExecutions).toEqual([]);
    expectRollback();
  });

  it('rolls back a failed pending migration within the existing transaction', async () => {
    state.ledger = productionLedger();
    state.failSql = availableMigrations['008_volunteer_applications.sql'];

    await expect(runMigrations('up')).rejects.toThrow('simulated migration failure');
    expectRollback();
  });

  it('fails safely when an environment recorded the legacy application filename', async () => {
    state.ledger = [
      ...productionLedger(),
      { name: '007_volunteer_applications.sql', checksum: checksum(availableMigrations['008_volunteer_applications.sql']) },
    ];

    await expect(runMigrations('up')).rejects.toThrow(
      'Applied legacy 007_volunteer_applications.sql is absent from source; reconcile this database before using 008_volunteer_applications.sql.'
    );
    expect(state.migrationExecutions).toEqual([]);
    expectRollback();
  });

  it('reports pending 008 in status mode without executing it', async () => {
    state.ledger = productionLedger();

    await runMigrations('status');

    expect(console.info).toHaveBeenCalledWith('pending 008_volunteer_applications.sql');
    expect(state.migrationExecutions).toEqual([]);
    expect(state.calls.some(call => /\b(UPDATE|DELETE|INSERT)\b/i.test(call.sql))).toBe(false);
    expect(state.transactionEvents).toEqual(['BEGIN', 'COMMIT']);
  });

  it('reports an empty fresh ledger as pending without executing SQL', async () => {
    await runMigrations('status');

    expect(console.info).toHaveBeenCalledWith('pending 001_core.sql');
    expect(console.info).toHaveBeenCalledWith('pending 008_volunteer_applications.sql');
    expect(state.migrationExecutions).toEqual([]);
    expect(state.transactionEvents).toEqual(['BEGIN', 'COMMIT']);
  });
});
