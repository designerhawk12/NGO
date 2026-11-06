import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// NGO employee driver sign-in and jobs (migration 013), end to end against a dedicated _test database.
// Only Supabase is mocked: a bearer token is treated as the verified Auth user ID, and invitations
// return a fresh Auth identity. Roles are resolved by the real server code from PostgreSQL.

const { inviteMock } = vi.hoisted(() => ({ inviteMock: vi.fn() }));
vi.mock('../src/auth/supabase', () => ({
  verifySupabaseToken: vi.fn(async (token: string) => ({ authUserId: token, email: `${token}@example.test` })),
  inviteSupabaseUserByEmail: inviteMock,
  getSupabaseUserEmail: vi.fn(async () => 'applicant@example.test'),
}));

import { app } from '../src/app';
import { HttpError } from '../src/middleware/errorHandler';
import { closePool, getPool } from '../src/db/pool';

const testUrl = process.env.TEST_DATABASE_URL;
let testDatabaseName = '';
try { testDatabaseName = testUrl ? decodeURIComponent(new URL(testUrl).pathname.slice(1)) : ''; }
catch { /* A malformed test URL never enables database mutation. */ }
const enabled = testDatabaseName.endsWith('_test')
  && process.env.ALLOW_TEST_DATABASE_MUTATION === 'true'
  && process.env.DATABASE_URL === testUrl;
if (process.env.CI && !enabled) {
  throw new Error('CI driver app integration tests require the dedicated _test database settings.');
}

const tag = randomUUID().slice(0, 6).toUpperCase();
const adminAuth = randomUUID();
const volunteerAuth = randomUUID();
const invited: Record<string, string> = {};
const created = { vehicles: [] as string[], drivers: [] as string[], people: [] as string[], appUsers: [] as string[], foodRequests: [] as string[], vessels: [] as string[], donors: [] as string[], volunteers: [] as string[] };
const as = (authUserId: string) => ({ Authorization: `Bearer ${authUserId}` });
const future = (minutes: number) => new Date(Date.now() + minutes * 60_000);
const phone = () => '+919' + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0');
const q = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await getPool().query<T>(sql, params)).rows;

let adminId = '';
let volunteerId = '';
let vehicleA = '';
let vehicleB = '';
let vehicleC = '';
let driverA = '';
let driverAAuth = '';
let driverBAuth = '';
let pickupId = '';
let assignmentId = '';

async function registerVehicle(suffix: string) {
  const response = await request(app).post('/api/v1/vehicles').set(as(adminAuth))
    .send({ registrationNumber: `KA${tag}${suffix}`, kind: 'Mini truck', capacityKg: 800, indicativeMaxVessels: 4 });
  expect(response.status).toBe(201);
  created.vehicles.push(response.body.data.id);
  return response.body.data.id as string;
}

async function registerDriver(vehicleId: string, email: string) {
  const response = await request(app).post('/api/v1/drivers').set(as(adminAuth)).send({
    name: `App Driver ${randomUUID().slice(0, 4)}`, phoneE164: phone(), licenceNumber: `KA02${Math.floor(Math.random() * 1e11)}`,
    licenceExpiresOn: '2099-12-31', email, vehicleId,
  });
  if (response.status === 201) { created.drivers.push(response.body.data.driverId); created.people.push(response.body.data.personId); }
  return response;
}

async function schedulePickupWithFood(kg: number, startsInMinutes: number) {
  const donorUser = (await q<{ id: string }>("INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, 'DONOR') RETURNING id", [randomUUID()]))[0].id;
  created.appUsers.push(donorUser);
  const donor = (await q<{ id: string }>('INSERT INTO app.donors(app_user_id) VALUES ($1) RETURNING id', [donorUser]))[0].id;
  created.donors.push(donor);
  const foodRequestId = (await q<{ id: string }>(`
    INSERT INTO app.food_requests(donor_id, source_name, source_type, pickup_address, prepared_at, ready_at, pickup_deadline,
      donor_safety_declaration, safety_review, safety_reviewed_by, safety_reviewed_at, contact_name, contact_phone_e164)
    VALUES ($1, 'Royal Orchid Hall', 'Wedding', 'Bellary Road, Yelahanka, Bengaluru', now(), now(), $2, true, 'APPROVED', $3, now(), 'Hall manager', '+919123456780')
    RETURNING id`, [donor, future(startsInMinutes + 600), adminId]))[0].id;
  created.foodRequests.push(foodRequestId);
  await q("INSERT INTO app.food_items(food_request_id, food_type, quantity, unit) VALUES ($1, 'Vegetable biryani', $2, 'KG')", [foodRequestId, kg]);
  const pickup = await request(app).post('/api/v1/pickups').set(as(adminAuth)).send({
    foodRequestId, windowStartsAt: future(startsInMinutes).toISOString(), windowEndsAt: future(startsInMinutes + 120).toISOString(),
    distributionCenterId: (await q("INSERT INTO app.distribution_centers(address) VALUES ($1) RETURNING id", ['AaharaConnect Distribution Center, Indiranagar']))[0].id,
  });
  expect(pickup.status).toBe(201);
  return pickup.body.data as { id: string; windowStartsAt: string; windowEndsAt: string };
}

async function assign(pickup: { id: string; windowStartsAt: string; windowEndsAt: string }, driverId: string, key: string) {
  const vessel = (await q<{ id: string }>(`
    INSERT INTO app.vessels(vessel_code, name, vessel_type, material, capacity_value, capacity_unit, temperature_suitability)
    VALUES ($1, 'Food crate', 'CRATE', 'FOOD_GRADE_PLASTIC', 50, 'KG', 'AMBIENT') RETURNING id`, [`DA-${tag}-${randomUUID().slice(0, 6)}`]))[0].id;
  created.vessels.push(vessel);
  return request(app).post(`/api/v1/pickups/${pickup.id}/assignments`).set(as(adminAuth)).set('Idempotency-Key', key).send({
    teamId: null, volunteerIds: [volunteerId], driverId, vesselIds: [vessel], role: 'Pickup crew',
    windowStartsAt: pickup.windowStartsAt, windowEndsAt: pickup.windowEndsAt,
    containers: [{ containerType: 'Food crate', count: 1, estimatedLoadKg: 20 }],
  });
}

const driverJobs = async (authUserId: string) => (await request(app).get('/api/v1/assignments/driver').set(as(authUserId))).body.data?.items ?? [];
const transition = (authUserId: string, id: string, action: string, expectedVersion: number, reason?: string) =>
  request(app).patch(`/api/v1/assignments/${id}/status`).set(as(authUserId)).send({ action, expectedVersion, ...(reason ? { reason } : {}) });
const versionOf = async (id: string) => (await q<{ version: number }>('SELECT version FROM app.assignments WHERE id = $1', [id]))[0].version;

beforeAll(async () => {
  if (!enabled) return;
  inviteMock.mockImplementation(async (email: string) => {
    const authUserId = randomUUID();
    invited[email] = authUserId;
    return { authUserId, inviteNonce: 'integration' };
  });
  adminId = (await q<{ id: string }>("INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, 'ADMIN') RETURNING id", [adminAuth]))[0].id;
  created.appUsers.push(adminId);
  const volunteerUser = (await q<{ id: string }>("INSERT INTO app.app_users(auth_user_id, role, display_name) VALUES ($1, 'VOLUNTEER', 'Kavya Iyer') RETURNING id", [volunteerAuth]))[0].id;
  created.appUsers.push(volunteerUser);
  const volunteerPerson = (await q<{ id: string }>('INSERT INTO app.people(app_user_id, name, phone_e164) VALUES ($1, $2, $3) RETURNING id', [volunteerUser, `Kavya Iyer ${tag}`, phone()]))[0].id;
  created.people.push(volunteerPerson);
  volunteerId = (await q<{ id: string }>("INSERT INTO app.volunteers(person_id, registration_code, skills) VALUES ($1, $2, ARRAY['Packing']) RETURNING id", [volunteerPerson, `VOL-${randomUUID()}`]))[0].id;
  created.volunteers.push(volunteerId);
  await q("INSERT INTO app.volunteer_applications(volunteer_id, status, reviewed_at, reviewed_by) VALUES ($1, 'APPROVED', now(), $2)", [volunteerId, adminId]);
  await q("INSERT INTO app.volunteer_availability(volunteer_id, starts_at, ends_at, state) VALUES ($1, now(), now() + interval '2 days', 'AVAILABLE')", [volunteerId]);
});

afterAll(async () => {
  if (!enabled) return;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL session_replication_role = 'replica'");
    const pickups = (await client.query<{ id: string }>('SELECT id FROM app.pickups WHERE food_request_id = ANY($1::uuid[])', [created.foodRequests])).rows.map(row => row.id);
    const assignments = (await client.query<{ id: string }>('SELECT id FROM app.assignments WHERE pickup_id = ANY($1::uuid[])', [pickups])).rows.map(row => row.id);
    const driverLogins = (await client.query<{ app_user_id: string }>('SELECT app_user_id FROM app.people WHERE id = ANY($1::uuid[]) AND app_user_id IS NOT NULL', [created.people])).rows.map(row => row.app_user_id);
    for (const sql of [
      'DELETE FROM app.idempotency_keys WHERE assignment_id = ANY($1::uuid[])',
      'DELETE FROM app.assignment_status_events WHERE assignment_id = ANY($1::uuid[])',
      'DELETE FROM app.resource_reservations WHERE assignment_id = ANY($1::uuid[])',
      'DELETE FROM app.assignment_members WHERE assignment_id = ANY($1::uuid[])',
      'DELETE FROM app.assignments WHERE id = ANY($1::uuid[])',
    ]) await client.query(sql, [assignments]);
    await client.query('DELETE FROM app.vessel_logs WHERE vessel_id = ANY($1::uuid[])', [created.vessels]);
    await client.query('DELETE FROM app.vessel_issuances WHERE vessel_id = ANY($1::uuid[])', [created.vessels]);
    await client.query('DELETE FROM app.vessels WHERE id = ANY($1::uuid[])', [created.vessels]);
    for (const table of ['container_plans', 'pickup_schedule_changes', 'pickup_status_events']) await client.query(`DELETE FROM app.${table} WHERE pickup_id = ANY($1::uuid[])`, [pickups]);
    await client.query('DELETE FROM app.pickups WHERE id = ANY($1::uuid[])', [pickups]);
    await client.query('DELETE FROM app.food_items WHERE food_request_id = ANY($1::uuid[])', [created.foodRequests]);
    await client.query('DELETE FROM app.food_requests WHERE id = ANY($1::uuid[])', [created.foodRequests]);
    await client.query('DELETE FROM app.donors WHERE id = ANY($1::uuid[])', [created.donors]);
    await client.query('DELETE FROM app.volunteer_availability WHERE volunteer_id = ANY($1::uuid[])', [created.volunteers]);
    await client.query('DELETE FROM app.volunteer_applications WHERE volunteer_id = ANY($1::uuid[])', [created.volunteers]);
    await client.query('DELETE FROM app.volunteers WHERE id = ANY($1::uuid[])', [created.volunteers]);
    await client.query('DELETE FROM app.vehicles WHERE id = ANY($1::uuid[])', [created.vehicles]);
    await client.query('DELETE FROM app.drivers WHERE id = ANY($1::uuid[])', [created.drivers]);
    await client.query('DELETE FROM app.people WHERE id = ANY($1::uuid[])', [created.people]);
    await client.query('DELETE FROM app.user_role_events WHERE app_user_id = ANY($1::uuid[])', [[...created.appUsers, ...driverLogins]]);
    await client.query('DELETE FROM app.app_users WHERE id = ANY($1::uuid[]) OR auth_user_id = ANY($2::uuid[])', [[...created.appUsers, ...driverLogins], Object.values(invited)]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await closePool();
  }
});

describe.skipIf(!enabled)('NGO employee driver sign-in, jobs and trip workflow', () => {
  it('Admin creates Driver A with an email invitation and a DRIVER sign-in loaded from the server', async () => {
    vehicleA = await registerVehicle('A');
    vehicleB = await registerVehicle('B');
    vehicleC = await registerVehicle('C');
    const email = `ramesh-${tag.toLowerCase()}@example.test`;
    const response = await registerDriver(vehicleA, email);
    expect(response.status).toBe(201);
    driverA = response.body.data.driverId;
    expect(inviteMock).toHaveBeenCalledWith(email, expect.any(String));
    driverAAuth = invited[email];
    const me = await request(app).get('/api/v1/me').set(as(driverAAuth));
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe('DRIVER');
    expect(me.body.data.volunteerApplicationStatus).toBeUndefined();
    const profile = await request(app).get('/api/v1/drivers/me').set(as(driverAAuth));
    expect(profile.status).toBe(200);
    expect(profile.body.data).toMatchObject({ driverId: driverA, vehicle: { id: vehicleA, registrationNumber: `KA${tag}A` } });
    const driverB = await registerDriver(vehicleB, `suresh-${tag.toLowerCase()}@example.test`);
    expect(driverB.status).toBe(201);
    driverBAuth = invited[`suresh-${tag.toLowerCase()}@example.test`];
  });

  it('rejects a duplicate email and saves nothing when the invitation fails', async () => {
    expect((await registerDriver(vehicleC, `ramesh-${tag.toLowerCase()}@example.test`)).body.error.code).toBe('DRIVER_EMAIL_IN_USE');
    inviteMock.mockRejectedValueOnce(new HttpError(503, 'INVITE_SERVICE_UNAVAILABLE', 'The invitation service is unavailable.'));
    const failed = await registerDriver(vehicleC, `nobody-${tag.toLowerCase()}@example.test`);
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe('INVITE_SERVICE_UNAVAILABLE');
    const vehicle = await q<{ assigned_driver_id: string | null }>('SELECT assigned_driver_id FROM app.vehicles WHERE id = $1', [vehicleC]);
    expect(vehicle[0].assigned_driver_id).toBeNull();
    inviteMock.mockRejectedValueOnce(new HttpError(409, 'VOLUNTEER_ALREADY_EXISTS', 'An authentication account already exists for this email.'));
    expect((await registerDriver(vehicleC, `existing-${tag.toLowerCase()}@example.test`)).body.error.code).toBe('DRIVER_EMAIL_IN_USE');
  });

  it('keeps drivers out of Admin and Volunteer operations, and the DRIVER role out of role changes', async () => {
    expect((await request(app).get('/api/v1/drivers').set(as(driverAAuth))).status).toBe(403);
    expect((await request(app).get('/api/v1/volunteers/applications').set(as(driverAAuth))).status).toBe(403);
    expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}/approval`).set(as(driverAAuth)).send({ status: 'APPROVED' })).status).toBe(403);
    expect((await request(app).get('/api/v1/pickups').set(as(driverAAuth))).status).toBe(403);
    expect((await request(app).patch(`/api/v1/drivers/${driverA}`).set(as(driverAAuth)).send({ name: 'Changed' })).status).toBe(403);
    expect((await request(app).get('/api/v1/assignments/me').set(as(driverAAuth))).status).toBe(403);
    const volunteerUser = (await q<{ id: string }>('SELECT id FROM app.app_users WHERE auth_user_id = $1', [volunteerAuth]))[0].id;
    expect((await request(app).patch(`/api/v1/admin/users/${volunteerUser}/role`).set(as(adminAuth)).send({ role: 'DRIVER' })).status).toBe(400);
    const driverUser = (await q<{ id: string }>('SELECT id FROM app.app_users WHERE auth_user_id = $1', [driverAAuth]))[0].id;
    const demote = await request(app).patch(`/api/v1/admin/users/${driverUser}/role`).set(as(adminAuth)).send({ role: 'DONOR' });
    expect(demote.status).toBe(409);
    expect(demote.body.error.code).toBe('DRIVER_ROLE_MANAGED_BY_ASSIGN_DRIVER');
    // A brand-new verified identity is a DONOR; nothing a client sends can make it a driver.
    const stranger = randomUUID();
    created.appUsers.push(...(await q<{ id: string }>("SELECT id FROM app.app_users WHERE auth_user_id = $1", [stranger])).map(row => row.id));
    const strangerMe = await request(app).get('/api/v1/me').set(as(stranger)).send({ role: 'DRIVER' });
    expect(strangerMe.body.data.role).toBe('DONOR');
    created.appUsers.push((await q<{ id: string }>('SELECT id FROM app.app_users WHERE auth_user_id = $1', [stranger]))[0].id);
    await q('DELETE FROM app.donors WHERE app_user_id = $1', [created.appUsers.at(-1)]);
  });

  it('shows Driver A the real assignment with the fixed vehicle, and hides it from Driver B', async () => {
    const pickup = await schedulePickupWithFood(30, 120);
    pickupId = pickup.id;
    const response = await assign(pickup, driverA, `driver-app-${tag}`);
    expect(response.status).toBe(201);
    assignmentId = response.body.data.id;
    expect(response.body.data).toMatchObject({ vehicleId: vehicleA, driverAcceptance: 'PENDING' });
    const jobs = await driverJobs(driverAAuth);
    const job = jobs.find((item: { assignmentId: string }) => item.assignmentId === assignmentId);
    expect(job).toMatchObject({
      status: 'PENDING', driverAcceptance: 'PENDING', donorName: 'Royal Orchid Hall',
      pickupAddress: 'Bellary Road, Yelahanka, Bengaluru', deliveryAddress: 'AaharaConnect Distribution Center, Indiranagar',
      vehicle: { id: vehicleA, registrationNumber: `KA${tag}A` },
    });
    expect(job.foodItems).toEqual([{ foodType: 'Vegetable biryani', quantity: 30, unit: 'KG', estimatedWeightKg: null }]);
    expect(job.crew).toEqual([{ name: `Kavya Iyer ${tag}` }]);
    expect((await driverJobs(driverBAuth)).some((item: { assignmentId: string }) => item.assignmentId === assignmentId)).toBe(false);
    const intrusion = await transition(driverBAuth, assignmentId, 'ACCEPT', await versionOf(assignmentId));
    expect(intrusion.status).toBe(403);
  });

  it('keeps driver acceptance separate from the crew and blocks the trip until the driver accepts', async () => {
    const crewAccept = await transition(volunteerAuth, assignmentId, 'ACCEPT', await versionOf(assignmentId));
    expect(crewAccept.status).toBe(200);
    expect(crewAccept.body.data).toMatchObject({ status: 'ACCEPTED', driverAcceptance: 'PENDING' });
    const tooEarly = await transition(volunteerAuth, assignmentId, 'START', await versionOf(assignmentId));
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.code).toBe('DRIVER_NOT_ACCEPTED');
    const stale = await transition(driverAAuth, assignmentId, 'ACCEPT', 0);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    const accepted = await transition(driverAAuth, assignmentId, 'ACCEPT', await versionOf(assignmentId));
    expect(accepted.status).toBe(200);
    expect(accepted.body.data).toMatchObject({ status: 'ACCEPTED', driverAcceptance: 'ACCEPTED' });
    const again = await transition(driverAAuth, assignmentId, 'ACCEPT', await versionOf(assignmentId));
    expect(again.status).toBe(409);
    const members = await q<{ count: number }>('SELECT count(*)::int AS count FROM app.assignment_members WHERE assignment_id = $1', [assignmentId]);
    expect(members[0].count).toBe(1);
  });

  it('runs the trip with the driver and an authorized delivery, then shows it in Admin and Driver History', async () => {
    for (const action of ['START', 'ARRIVE', 'COLLECT']) {
      const response = await transition(driverAAuth, assignmentId, action, await versionOf(assignmentId));
      expect(response.status, action).toBe(200);
    }
    // A Volunteer acting on an old version cannot overwrite the driver's progress.
    const conflict = await transition(volunteerAuth, assignmentId, 'COLLECT', (await versionOf(assignmentId)) - 1);
    expect(conflict.body.error.code).toBe('VERSION_CONFLICT');
    const delivered = await transition(driverAAuth, assignmentId, 'DELIVER', await versionOf(assignmentId));
    expect(delivered.status).toBe(200);
    expect(delivered.body.data.status).toBe('DELIVERED');
    const adminView = await request(app).get(`/api/v1/pickups/${pickupId}`).set(as(adminAuth));
    expect(adminView.body.data.status).toBe('DELIVERED');
    const history = (await driverJobs(driverAAuth)).find((item: { assignmentId: string }) => item.assignmentId === assignmentId);
    expect(history.status).toBe('DELIVERED');
    expect(history.completedAt).toBeTruthy();
    const reservations = await q<{ count: number }>("SELECT count(*)::int AS count FROM app.resource_reservations WHERE assignment_id = $1 AND state = 'ACTIVE'", [assignmentId]);
    expect(reservations[0].count).toBe(0);
    expect((await transition(driverAAuth, assignmentId, 'DELIVER', await versionOf(assignmentId))).status).toBe(409);
  });

  it('lets the driver decline before the trip, returning the pickup to planning safely', async () => {
    const pickup = await schedulePickupWithFood(20, 400);
    const response = await assign(pickup, driverA, `driver-decline-${tag}`);
    expect(response.status).toBe(201);
    const id = response.body.data.id;
    expect((await transition(driverAAuth, id, 'REJECT', await versionOf(id))).status).toBe(400);
    const declined = await transition(driverAAuth, id, 'REJECT', await versionOf(id), 'Vehicle problem');
    expect(declined.status).toBe(200);
    expect(declined.body.data).toMatchObject({ status: 'REJECTED', driverAcceptance: 'DECLINED' });
    const [pickupRow, active] = await Promise.all([
      q<{ status: string }>('SELECT status FROM app.pickups WHERE id = $1', [pickup.id]),
      q<{ count: number }>("SELECT count(*)::int AS count FROM app.resource_reservations WHERE assignment_id = $1 AND state = 'ACTIVE'", [id]),
    ]);
    expect(pickupRow[0].status).toBe('PLANNED');
    expect(active[0].count).toBe(0);
    const history = (await driverJobs(driverAAuth)).find((item: { assignmentId: string }) => item.assignmentId === id);
    expect(history).toMatchObject({ status: 'REJECTED', driverAcceptance: 'DECLINED' });
  });

  it('still serves the Volunteer their own assignments', async () => {
    const own = await request(app).get('/api/v1/assignments/me').set(as(volunteerAuth));
    expect(own.status).toBe(200);
    expect(own.body.data.items.some((item: { id: string }) => item.id === assignmentId)).toBe(true);
  });
});
