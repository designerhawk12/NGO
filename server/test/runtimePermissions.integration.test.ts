import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, getPool, withTransaction } from '../src/db/pool';

const url = process.env.TEST_DATABASE_URL;
let enabled = false;
try {
  const target = new URL(url ?? '');
  enabled = process.env.FINAL_PILOT_SCHEMA_TEST === 'true'
    && target.hostname === '127.0.0.1' && target.pathname.endsWith('_test')
    && process.env.DATABASE_URL === url && process.env.ALLOW_TEST_DATABASE_MUTATION === 'true';
} catch { /* No hosted or unverified database mutations. */ }
const suite = enabled ? describe : describe.skip;
afterAll(async () => { if (enabled) await closePool(); });

suite('dedicated Express runtime permissions', () => {
  it('has no login, administrative attributes, RLS bypass or client membership', async () => {
    const role = await getPool().query("SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='aaharaconnect_api'");
    expect(role.rows).toHaveLength(1);
    expect(Object.values(role.rows[0])).toEqual([false,false,false,false,false,false]);
    for (const client of ['anon','authenticated']) {
      expect((await getPool().query("SELECT pg_has_role($1,'aaharaconnect_api','MEMBER') member",[client])).rows[0].member).toBe(false);
    }
  });

  it('can use private outbox through RLS without owning tables', async () => {
    const key = `runtime-test:${randomUUID()}`;
    await withTransaction(async tx => {
      await tx.query('SET LOCAL ROLE aaharaconnect_api');
      const inserted = await tx.query("INSERT INTO app.notification_outbox(event_key,template_key,parameters) VALUES($1,'donation_received','[]') RETURNING id",[key]);
      const updated = await tx.query('UPDATE app.notification_outbox SET attempts=1 WHERE id=$1 RETURNING attempts',[inserted.rows[0].id]);
      expect(updated.rows[0].attempts).toBe(1);
      for (const table of ['volunteer_identity_documents','identity_review_events','vehicle_locations','vehicle_tracking_consents','volunteer_applications','distribution_centers']) {
        await tx.query(`SELECT * FROM app.${table} LIMIT 1`);
      }
    });
    await getPool().query('DELETE FROM app.notification_outbox WHERE event_key=$1',[key]);
  });

  it('cannot read the migration ledger, create tables, truncate data or rewrite audit events', async () => {
    for (const sql of [
      'SELECT * FROM app.schema_migrations',
      'CREATE TABLE app.runtime_must_not_create(id integer)',
      'TRUNCATE app.notification_outbox',
      'UPDATE app.identity_review_events SET action=action WHERE false',
      'DELETE FROM app.identity_review_events WHERE false',
    ]) {
      await expect(withTransaction(async tx => {
        await tx.query('SET LOCAL ROLE aaharaconnect_api');
        await tx.query(sql);
      })).rejects.toMatchObject({code:'42501'});
    }
  });
});
