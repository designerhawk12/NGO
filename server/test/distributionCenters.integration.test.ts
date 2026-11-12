import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// PostgreSQL-backed checks for migration 014 Distribution Centers: CRUD, archive rules,
// server-enforced destination selection, address snapshots and authorization.

const { actor } = vi.hoisted(() => ({ actor: { id: '', role: 'ADMIN' } }));
vi.mock('../src/auth/supabase', () => ({
  verifySupabaseToken: vi.fn(async () => ({ authUserId: 'b0000000-0000-4000-8000-0000000000bb', email: 'admin@example.test' })),
}));
vi.mock('../src/auth/appUsers', () => ({
  findOrCreateAppUser: vi.fn(async () => ({ id: actor.id, authUserId: 'b0000000-0000-4000-8000-0000000000bb', role: actor.role, displayName: 'Integration user' })),
}));

import { app } from '../src/app';
import { closePool, getPool } from '../src/db/pool';

const testUrl = process.env.TEST_DATABASE_URL;
let dbName = '';
try { dbName = testUrl ? decodeURIComponent(new URL(testUrl).pathname.slice(1)) : ''; } catch { /* never enables mutation */ }
const enabled = dbName.endsWith('_test') && process.env.ALLOW_TEST_DATABASE_MUTATION === 'true' && process.env.DATABASE_URL === testUrl;
if (process.env.CI && !enabled) throw new Error('CI integration tests require a dedicated _test database and ALLOW_TEST_DATABASE_MUTATION=true.');

const auth = { Authorization: 'Bearer integration-test-token' };
const future = (minutes: number) => new Date(Date.now() + minutes * 60_000);
const q = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await getPool().query<T>(sql, params)).rows;
const ids = { users: [] as string[], donors: [] as string[], foods: [] as string[], centers: [] as string[], pickups: [] as string[] };

async function approvedFood(): Promise<string> {
  const donorUser = (await q<{ id: string }>("INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, 'DONOR') RETURNING id", [randomUUID()]))[0].id;
  ids.users.push(donorUser);
  const donor = (await q<{ id: string }>('INSERT INTO app.donors(app_user_id) VALUES ($1) RETURNING id', [donorUser]))[0].id;
  ids.donors.push(donor);
  const food = (await q<{ id: string }>(`
    INSERT INTO app.food_requests(donor_id, source_name, source_type, pickup_address, prepared_at, ready_at, pickup_deadline,
      donor_safety_declaration, safety_review, safety_reviewed_by, safety_reviewed_at, contact_name, contact_phone_e164)
    VALUES ($1, 'Center test kitchen', 'Event', 'Donor street', now(), now(), $2, true, 'APPROVED', $3, now(), 'Coordinator', '+919123456780')
    RETURNING id`, [donor, future(1000), actor.id]))[0].id;
  ids.foods.push(food);
  await q("INSERT INTO app.food_items(food_request_id, food_type, quantity, unit) VALUES ($1, 'Rice', 10, 'KG')", [food]);
  return food;
}
const schedule = (foodRequestId: string, extra: Record<string, unknown>) => request(app).post('/api/v1/pickups').set(auth)
  .send({ foodRequestId, windowStartsAt: future(120).toISOString(), windowEndsAt: future(180).toISOString(), ...extra });

describe.runIf(enabled)('Distribution Centers (PostgreSQL)', () => {
  beforeAll(async () => {
    const admin = (await q<{ id: string }>("INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, 'ADMIN') RETURNING id", [randomUUID()]))[0].id;
    ids.users.push(admin); actor.id = admin; actor.role = 'ADMIN';
  });
  afterAll(async () => {
    if (ids.pickups.length || ids.foods.length) {
      await q('DELETE FROM app.pickup_status_events WHERE pickup_id IN (SELECT id FROM app.pickups WHERE food_request_id = ANY($1::uuid[]))', [ids.foods]);
      await q('DELETE FROM app.pickups WHERE food_request_id = ANY($1::uuid[])', [ids.foods]);
    }
    await q('DELETE FROM app.food_items WHERE food_request_id = ANY($1::uuid[])', [ids.foods]);
    await q('DELETE FROM app.food_requests WHERE id = ANY($1::uuid[])', [ids.foods]);
    await q('DELETE FROM app.donors WHERE id = ANY($1::uuid[])', [ids.donors]);
    await q('DELETE FROM app.distribution_centers WHERE id = ANY($1::uuid[])', [ids.centers]);
    await q('DELETE FROM app.app_users WHERE id = ANY($1::uuid[])', [ids.users]);
    await closePool();
  });

  it('rejects every unauthorized operation', async () => {
    actor.role = 'DONOR';
    try {
      expect((await request(app).get('/api/v1/distribution-centers').set(auth)).status).toBe(403);
      expect((await request(app).post('/api/v1/distribution-centers').set(auth).send({ address: '1 Unauthorized Road, Bengaluru' })).status).toBe(403);
      expect((await request(app).patch(`/api/v1/distribution-centers/${randomUUID()}`).set(auth).send({ isActive: false })).status).toBe(403);
    } finally { actor.role = 'ADMIN'; }
    expect((await request(app).get('/api/v1/distribution-centers')).status).toBe(401);
    expect((await q('SELECT 1 FROM app.distribution_centers WHERE address LIKE $1', ['%Unauthorized Road%'])).length).toBe(0);
  });

  it('adds, edits and archives a center, and validates input', async () => {
    expect((await request(app).post('/api/v1/distribution-centers').set(auth).send({ name: 'No address' })).status).toBe(400);
    const add = await request(app).post('/api/v1/distribution-centers').set(auth).send({ name: 'Indiranagar', address: '100 Feet Road, Indiranagar, Bengaluru' });
    expect(add.status).toBe(201);
    expect(add.body.data).toMatchObject({ name: 'Indiranagar', address: '100 Feet Road, Indiranagar, Bengaluru', isActive: true });
    ids.centers.push(add.body.data.id);
    const edit = await request(app).patch(`/api/v1/distribution-centers/${add.body.data.id}`).set(auth).send({ address: '200 Feet Road, Indiranagar, Bengaluru', name: null });
    expect(edit.body.data).toMatchObject({ address: '200 Feet Road, Indiranagar, Bengaluru', name: null, isActive: true });
    expect((await request(app).patch(`/api/v1/distribution-centers/${add.body.data.id}`).set(auth).send({})).status).toBe(400);
    expect((await request(app).patch(`/api/v1/distribution-centers/${randomUUID()}`).set(auth).send({ isActive: false })).status).toBe(404);
    const archive = await request(app).patch(`/api/v1/distribution-centers/${add.body.data.id}`).set(auth).send({ isActive: false });
    expect(archive.body.data.isActive).toBe(false);
    const active = (await request(app).get('/api/v1/distribution-centers').set(auth)).body.data.items.map((c: { id: string }) => c.id);
    const all = (await request(app).get('/api/v1/distribution-centers?includeInactive=true').set(auth)).body.data.items.map((c: { id: string }) => c.id);
    expect(active).not.toContain(add.body.data.id);
    expect(all).toContain(add.body.data.id);
  });

  it('stores a destination snapshot, keeps it after edits, and blocks missing, unknown and archived centers', async () => {
    const center = (await request(app).post('/api/v1/distribution-centers').set(auth).send({ address: '12 MG Road, Bengaluru' })).body.data;
    ids.centers.push(center.id);

    const noCenter = await schedule(await approvedFood(), { deliveryAddress: 'Typed by hand' });
    expect(noCenter.status).toBe(400);
    expect(noCenter.body.error.code).toBe('DISTRIBUTION_CENTER_REQUIRED');
    expect((await schedule(await approvedFood(), { distributionCenterId: randomUUID() })).body.error.code).toBe('DISTRIBUTION_CENTER_INVALID');

    const first = await schedule(await approvedFood(), { distributionCenterId: center.id, deliveryAddress: 'Ignored client text' });
    expect(first.status).toBe(201);
    expect(first.body.data.deliveryAddress).toBe('12 MG Road, Bengaluru');
    const stored = (await q<{ delivery_address: string; distribution_center_id: string }>('SELECT delivery_address, distribution_center_id FROM app.pickups WHERE id = $1', [first.body.data.id]))[0];
    expect(stored).toMatchObject({ delivery_address: '12 MG Road, Bengaluru', distribution_center_id: center.id });

    await request(app).patch(`/api/v1/distribution-centers/${center.id}`).set(auth).send({ address: '99 New Address, Bengaluru' });
    const reloaded = await request(app).get(`/api/v1/pickups/${first.body.data.id}`).set(auth);
    expect(reloaded.body.data.deliveryAddress).toBe('12 MG Road, Bengaluru');

    await request(app).patch(`/api/v1/distribution-centers/${center.id}`).set(auth).send({ isActive: false });
    const archived = await schedule(await approvedFood(), { distributionCenterId: center.id });
    expect(archived.status).toBe(409);
    expect(archived.body.error.code).toBe('DISTRIBUTION_CENTER_INACTIVE');
    expect((await request(app).get(`/api/v1/pickups/${first.body.data.id}`).set(auth)).body.data.deliveryAddress).toBe('12 MG Road, Bengaluru');
  });

  it('keeps historical pickups with a typed address and no center readable', async () => {
    const food = await approvedFood();
    const legacy = (await q<{ id: string }>(
      "INSERT INTO app.pickups(food_request_id, window_starts_at, window_ends_at, delivery_address, status, version) VALUES ($1, $2, $3, 'Legacy typed hub', 'PLANNED', 0) RETURNING id",
      [food, future(120), future(180)]))[0].id;
    ids.pickups.push(legacy);
    const response = await request(app).get(`/api/v1/pickups/${legacy}`).set(auth);
    expect(response.status).toBe(200);
    expect(response.body.data.deliveryAddress).toBe('Legacy typed hub');
  });
});
