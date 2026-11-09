import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// End-to-end checks for migration 012 against a dedicated _test PostgreSQL database:
//   * the reported zero-vehicle / zero-driver bug (vehicle first, then employee driver),
//   * the fixed one-driver/one-vehicle link and its immutability,
//   * the four-step assignment (volunteers, driver -> derived vehicle, containers, confirm),
//   * Admin pickup edit and safe "delete" (cancellation).

const { actor } = vi.hoisted(() => ({ actor: { id: '', role: 'ADMIN' } }));
vi.mock('../src/auth/supabase', async () => {
  const { randomUUID: uuid } = await import('node:crypto');
  return {
    verifySupabaseToken: vi.fn(async () => ({ authUserId: 'b0000000-0000-4000-8000-0000000000aa', email: 'admin@example.test' })),
    // Driver registration sends a Supabase invitation; this test only needs a fresh Auth identity.
    inviteSupabaseUserByEmail: vi.fn(async () => ({ authUserId: uuid(), inviteNonce: 'integration' })),
  };
});
vi.mock('../src/auth/appUsers', () => ({
  findOrCreateAppUser: vi.fn(async () => ({
    id: actor.id, authUserId: 'b0000000-0000-4000-8000-0000000000aa', role: actor.role, displayName: 'Integration admin',
  })),
}));

import { app } from '../src/app';
import { closePool, getPool } from '../src/db/pool';
import { seedLegacyApprovedApplication } from './legacyVolunteerApplication';

const testUrl = process.env.TEST_DATABASE_URL;
let testDatabaseName = '';
try { testDatabaseName = testUrl ? decodeURIComponent(new URL(testUrl).pathname.slice(1)) : ''; }
catch { /* A malformed test URL never enables database mutation. */ }
const enabled = testDatabaseName.endsWith('_test')
  && process.env.ALLOW_TEST_DATABASE_MUTATION === 'true'
  && process.env.DATABASE_URL === testUrl;
if (process.env.CI && !enabled) {
  throw new Error('CI driver integration tests require DATABASE_URL and TEST_DATABASE_URL to name the same dedicated _test database and ALLOW_TEST_DATABASE_MUTATION=true.');
}

const auth = { Authorization: 'Bearer integration-test-token' };
const tag = randomUUID().slice(0, 8).toUpperCase();
const created = {
  appUsers: [] as string[], people: [] as string[], volunteers: [] as string[], donors: [] as string[],
  foodRequests: [] as string[], vehicles: [] as string[], drivers: [] as string[], vessels: [] as string[],
};
const phone = () => '+919' + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0');
const future = (minutes: number) => new Date(Date.now() + minutes * 60_000);

async function q<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await getPool().query<T>(sql, params)).rows;
}

async function createVolunteer(name: string, startsAt: Date, endsAt: Date): Promise<string> {
  const userId = (await q<{ id: string }>("INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, 'VOLUNTEER') RETURNING id", [randomUUID()]))[0].id;
  created.appUsers.push(userId);
  const personId = (await q<{ id: string }>('INSERT INTO app.people(app_user_id, name, phone_e164) VALUES ($1, $2, $3) RETURNING id', [userId, name, phone()]))[0].id;
  created.people.push(personId);
  const volunteerId = (await q<{ id: string }>("INSERT INTO app.volunteers(person_id, registration_code, skills) VALUES ($1, $2, ARRAY['Packing']) RETURNING id", [personId, `VOL-${randomUUID()}`]))[0].id;
  created.volunteers.push(volunteerId);
  await seedLegacyApprovedApplication(getPool(),volunteerId,actor.id);
  await q("INSERT INTO app.volunteer_availability(volunteer_id, starts_at, ends_at, state) VALUES ($1, $2, $3, 'AVAILABLE')", [volunteerId, startsAt, endsAt]);
  return volunteerId;
}

async function createApprovedFoodRequest(kg: number, readyAt: Date, deadline: Date): Promise<string> {
  const donorUserId = (await q<{ id: string }>("INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, 'DONOR') RETURNING id", [randomUUID()]))[0].id;
  created.appUsers.push(donorUserId);
  const donorId = (await q<{ id: string }>('INSERT INTO app.donors(app_user_id) VALUES ($1) RETURNING id', [donorUserId]))[0].id;
  created.donors.push(donorId);
  const foodRequestId = (await q<{ id: string }>(`
    INSERT INTO app.food_requests(donor_id, source_name, source_type, pickup_address, prepared_at, ready_at,
      pickup_deadline, donor_safety_declaration, safety_review, safety_reviewed_by, safety_reviewed_at,
      contact_name, contact_phone_e164)
    VALUES ($1, 'Integration kitchen', 'Event', 'Donor street', $2, $2, $3, true, 'APPROVED', $4, now(), 'Coordinator', '+919123456780')
    RETURNING id`, [donorId, readyAt, deadline, actor.id]))[0].id;
  created.foodRequests.push(foodRequestId);
  await q("INSERT INTO app.food_items(food_request_id, food_type, quantity, unit) VALUES ($1, 'Rice', $2, 'KG')", [foodRequestId, kg]);
  return foodRequestId;
}

async function createVessel(capacityKg: number): Promise<string> {
  const id = (await q<{ id: string }>(`
    INSERT INTO app.vessels(vessel_code, name, vessel_type, material, capacity_value, capacity_unit, temperature_suitability)
    VALUES ($1, 'Food crate', 'CRATE', 'FOOD_GRADE_PLASTIC', $2, 'KG', 'AMBIENT') RETURNING id`,
  [`IT-${tag}-${randomUUID().slice(0, 6)}`, capacityKg]))[0].id;
  created.vessels.push(id);
  return id;
}

async function registerVehicle(capacityKg: number, suffix: string) {
  const response = await request(app).post('/api/v1/vehicles').set(auth)
    .send({ registrationNumber: `KA${tag}${suffix}`, kind: 'Mini truck', capacityKg, sizeCategory: 'MEDIUM', indicativeMaxVessels: 4 });
  if (response.status === 201) created.vehicles.push(response.body.data.id);
  return response;
}

async function registerDriver(vehicleId: string | undefined, overrides: Record<string, unknown> = {}) {
  const response = await request(app).post('/api/v1/drivers').set(auth).send({
    name: `Employee Driver ${randomUUID().slice(0, 4)}`,
    phoneE164: phone(),
    licenceNumber: `KA01${Math.floor(Math.random() * 1e11)}`,
    licenceExpiresOn: '2099-12-31',
    employeeCode: `EMP-${randomUUID().slice(0, 6)}`,
    email: `driver-${randomUUID().slice(0, 8)}@example.test`,
    ...(vehicleId ? { vehicleId } : {}),
    ...overrides,
  });
  if (response.status === 201) {
    created.drivers.push(response.body.data.driverId);
    created.people.push(response.body.data.personId);
  }
  return response;
}

async function createPickup(foodRequestId: string, startsAt: Date, endsAt: Date) {
  return request(app).post('/api/v1/pickups').set(auth)
    .send({ foodRequestId, windowStartsAt: startsAt.toISOString(), windowEndsAt: endsAt.toISOString(), distributionCenterId: (await q<{ id: string }>("INSERT INTO app.distribution_centers(address) VALUES ($1) RETURNING id", ['NGO hub']))[0].id });
}

beforeAll(async () => {
  if (!enabled) return;
  actor.id = (await q<{ id: string }>("INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, 'ADMIN') RETURNING id", [randomUUID()]))[0].id;
  created.appUsers.push(actor.id);
});

afterAll(async () => {
  if (!enabled) return;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    // Test-only cleanup of the dedicated _test database; bypasses the fixed-driver delete guard.
    await client.query("SET LOCAL session_replication_role = 'replica'");
    const pickups = (await client.query<{ id: string }>('SELECT id FROM app.pickups WHERE food_request_id = ANY($1::uuid[])', [created.foodRequests])).rows.map(row => row.id);
    const assignments = (await client.query<{ id: string }>('SELECT id FROM app.assignments WHERE pickup_id = ANY($1::uuid[])', [pickups])).rows.map(row => row.id);
    await client.query('DELETE FROM app.idempotency_keys WHERE actor_user_id = $1', [actor.id]);
    await client.query('DELETE FROM app.assignment_status_events WHERE assignment_id = ANY($1::uuid[])', [assignments]);
    await client.query('DELETE FROM app.resource_reservations WHERE assignment_id = ANY($1::uuid[])', [assignments]);
    await client.query('DELETE FROM app.assignment_members WHERE assignment_id = ANY($1::uuid[])', [assignments]);
    await client.query('DELETE FROM app.assignments WHERE id = ANY($1::uuid[])', [assignments]);
    await client.query('DELETE FROM app.vessel_logs WHERE vessel_id = ANY($1::uuid[])', [created.vessels]);
    await client.query('DELETE FROM app.vessel_issuances WHERE vessel_id = ANY($1::uuid[])', [created.vessels]);
    await client.query('DELETE FROM app.vessels WHERE id = ANY($1::uuid[])', [created.vessels]);
    await client.query('DELETE FROM app.container_plans WHERE pickup_id = ANY($1::uuid[])', [pickups]);
    await client.query('DELETE FROM app.pickup_schedule_changes WHERE pickup_id = ANY($1::uuid[])', [pickups]);
    await client.query('DELETE FROM app.pickup_status_events WHERE pickup_id = ANY($1::uuid[])', [pickups]);
    await client.query('DELETE FROM app.pickups WHERE id = ANY($1::uuid[])', [pickups]);
    await client.query('DELETE FROM app.food_items WHERE food_request_id = ANY($1::uuid[])', [created.foodRequests]);
    await client.query('DELETE FROM app.food_requests WHERE id = ANY($1::uuid[])', [created.foodRequests]);
    await client.query('DELETE FROM app.donors WHERE id = ANY($1::uuid[])', [created.donors]);
    await client.query('DELETE FROM app.volunteer_availability WHERE volunteer_id = ANY($1::uuid[])', [created.volunteers]);
    await client.query('DELETE FROM app.volunteer_applications WHERE volunteer_id = ANY($1::uuid[])', [created.volunteers]);
    await client.query('DELETE FROM app.volunteers WHERE id = ANY($1::uuid[])', [created.volunteers]);
    await client.query('DELETE FROM app.vehicles WHERE id = ANY($1::uuid[])', [created.vehicles]);
    await client.query('DELETE FROM app.drivers WHERE id = ANY($1::uuid[])', [created.drivers]);
    const driverLogins = (await client.query<{ app_user_id: string }>(
      'SELECT app_user_id FROM app.people WHERE id = ANY($1::uuid[]) AND app_user_id IS NOT NULL', [created.people]
    )).rows.map(row => row.app_user_id);
    await client.query('DELETE FROM app.people WHERE id = ANY($1::uuid[])', [created.people]);
    await client.query('DELETE FROM app.app_users WHERE id = ANY($1::uuid[])', [driverLogins]);
    await client.query('DELETE FROM app.app_users WHERE id = ANY($1::uuid[])', [created.appUsers]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await closePool();
  }
});

describe.skipIf(!enabled)('Assign Driver: zero-record flow and the fixed driver-vehicle link', () => {
  let vehicleA = '';
  let vehicleB = '';
  let driverA = '';

  it('registers Vehicle A with no driver when no drivers or vehicles exist for it', async () => {
    const response = await registerVehicle(800, 'A');
    expect(response.status).toBe(201);
    vehicleA = response.body.data.id;
    expect(response.body.data.assignedDriver).toBeNull();
    const reloaded = await request(app).get(`/api/v1/vehicles/${vehicleA}`).set(auth);
    expect(reloaded.body.data.assignedDriver).toBeNull();
    const stored = await q<{ assigned_driver_id: string | null }>('SELECT assigned_driver_id FROM app.vehicles WHERE id = $1', [vehicleA]);
    expect(stored[0].assigned_driver_id).toBeNull();
  });

  it('rejects any driver field when registering or editing a vehicle', async () => {
    const withDriver = await request(app).post('/api/v1/vehicles').set(auth)
      .send({ registrationNumber: `KA${tag}X`, kind: 'Van', capacityKg: 100, assignedDriverId: null });
    expect(withDriver.status).toBe(400);
    const patch = await request(app).patch(`/api/v1/vehicles/${vehicleA}`).set(auth).send({ assignedDriverId: randomUUID() });
    expect(patch.status).toBe(400);
  });

  it('offers only unassigned, non-retired vehicles for a new driver', async () => {
    const options = await request(app).get('/api/v1/drivers/vehicle-options').set(auth);
    expect(options.status).toBe(200);
    const option = options.body.data.items.find((item: { id: string }) => item.id === vehicleA);
    expect(option).toMatchObject({ eligible: true, reason: null, capacityKg: 800 });
  });

  it('validates new driver input before writing anything', async () => {
    // Scope the "nothing written" check to this test's own licences: other test files share the DB.
    const licences = Array.from({ length: 5 }, (_, index) => `KA${tag}REJ${index}`);
    expect((await registerDriver(undefined, { licenceNumber: licences[0] })).status).toBe(400);
    expect((await registerDriver(randomUUID(), { licenceNumber: licences[1] })).status).toBe(404);
    const expired = await registerDriver(vehicleA, { licenceNumber: licences[2], licenceExpiresOn: '2020-01-01' });
    expect(expired.status).toBe(400);
    expect(expired.body.error.code).toBe('LICENCE_EXPIRED');
    expect((await registerDriver(vehicleA, { licenceNumber: licences[3], phoneE164: '+14155550100' })).status).toBe(400);
    expect((await registerDriver(vehicleA, { licenceNumber: licences[4], phoneE164: '9876543210' })).status).toBe(400);
    const written = await q<{ count: number }>('SELECT count(*)::int AS count FROM app.drivers WHERE licence_number = ANY($1::text[])', [licences]);
    expect(written[0].count).toBe(0);
    const vehicle = await q<{ assigned_driver_id: string | null }>('SELECT assigned_driver_id FROM app.vehicles WHERE id = $1', [vehicleA]);
    expect(vehicle[0].assigned_driver_id).toBeNull();
  });

  it('rejects non-Admin driver registration', async () => {
    actor.role = 'VOLUNTEER';
    try {
      expect((await registerDriver(vehicleA)).status).toBe(403);
    } finally { actor.role = 'ADMIN'; }
  });

  it('creates Employee Driver A linked to Vehicle A, with a DRIVER sign-in and no Volunteer record', async () => {
    const email = `driver-a-${tag.toLowerCase()}@example.test`;
    const response = await registerDriver(vehicleA, { name: `Driver A ${tag}`, email });
    expect(response.status).toBe(201);
    driverA = response.body.data.driverId;
    expect(response.body.data).toMatchObject({ driverType: 'EMPLOYEE', status: 'ACTIVE', vehicle: { id: vehicleA }, loginEmail: email, hasAppLogin: true });
    const person = await q<{ role: string | null; volunteers: number }>(
      `SELECT au.role, (SELECT count(*)::int FROM app.volunteers v WHERE v.person_id = p.id) AS volunteers
       FROM app.people p LEFT JOIN app.app_users au ON au.id = p.app_user_id WHERE p.id = $1`,
      [response.body.data.personId]
    );
    expect(person[0]).toEqual({ role: 'DRIVER', volunteers: 0 });
  });

  it('keeps the link after reloading both Vehicle Details and Assign Driver', async () => {
    const vehicle = await request(app).get(`/api/v1/vehicles/${vehicleA}`).set(auth);
    expect(vehicle.body.data.assignedDriver).toMatchObject({ driverId: driverA, driverType: 'EMPLOYEE' });
    const drivers = await request(app).get('/api/v1/drivers').set(auth);
    expect(drivers.body.data.items.find((item: { driverId: string }) => item.driverId === driverA).vehicle.id).toBe(vehicleA);
    const options = await request(app).get('/api/v1/drivers/vehicle-options').set(auth);
    expect(options.body.data.items.find((item: { id: string }) => item.id === vehicleA)).toMatchObject({ eligible: false });
  });

  it('rejects a second driver for the same vehicle', async () => {
    const duplicate = await registerDriver(vehicleA);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('VEHICLE_ALREADY_HAS_DRIVER');
  });

  it('rejects changing the fixed vehicle through the API and directly in the database', async () => {
    const second = await registerVehicle(20, 'B');
    vehicleB = second.body.data.id;
    const viaDriver = await request(app).patch(`/api/v1/drivers/${driverA}`).set(auth).send({ vehicleId: vehicleB });
    expect(viaDriver.status).toBe(409);
    expect(viaDriver.body.error.code).toBe('FIXED_VEHICLE_IMMUTABLE');
    await expect(getPool().query('UPDATE app.vehicles SET assigned_driver_id = $2 WHERE id = $1', [vehicleB, driverA])).rejects.toThrow();
    await expect(getPool().query('UPDATE app.vehicles SET assigned_driver_id = NULL WHERE id = $1', [vehicleA])).rejects.toThrow(/cannot be changed/);
    const stored = await q<{ id: string }>('SELECT id FROM app.vehicles WHERE assigned_driver_id = $1', [driverA]);
    expect(stored.map(row => row.id)).toEqual([vehicleA]);
  });

  it('keeps vehicle edits working but blocks deleting a vehicle with a fixed driver', async () => {
    const edit = await request(app).patch(`/api/v1/vehicles/${vehicleA}`).set(auth).send({ capacityKg: 750 });
    expect(edit.status).toBe(200);
    expect(edit.body.data.assignedDriver.driverId).toBe(driverA);
    const removal = await request(app).delete(`/api/v1/vehicles/${vehicleA}`).set(auth);
    expect(removal.status).toBe(409);
    expect(removal.body.error.code).toBe('VEHICLE_HAS_FIXED_DRIVER');
  });

  it('lets an Admin edit contact details and deactivate a driver without touching the vehicle', async () => {
    const newPhone = phone();
    const edit = await request(app).patch(`/api/v1/drivers/${driverA}`).set(auth).send({ phoneE164: newPhone, status: 'INACTIVE' });
    expect(edit.status).toBe(200);
    expect(edit.body.data).toMatchObject({ phone: newPhone, status: 'INACTIVE', vehicle: { id: vehicleA } });
    const reactivate = await request(app).patch(`/api/v1/drivers/${driverA}`).set(auth).send({ status: 'ACTIVE' });
    expect(reactivate.status).toBe(200);
  });

  it('never lists an employee driver in the Volunteer roster or Volunteer eligibility', async () => {
    const roster = await request(app).get('/api/v1/volunteers').query({ search: `Driver A ${tag}` }).set(auth);
    expect(roster.status).toBe(200);
    expect(roster.body.data.items).toHaveLength(0);
  });

  describe('four-step assignment with derived vehicle, capacity and containers', () => {
    const startsAt = future(120);
    const endsAt = future(240);
    let volunteerId = '';
    let driverB = '';
    let pickupId = '';
    let secondPickupId = '';
    let foodRequestId = '';
    let bigVessel = '';
    let smallVessel = '';

    beforeAll(async () => {
      if (!enabled) return;
      volunteerId = await createVolunteer(`Crew ${tag}`, future(60), future(600));
      foodRequestId = await createApprovedFoodRequest(30, future(30), future(480));
      driverB = (await registerDriver(vehicleB, { name: `Driver B ${tag}` })).body.data.driverId;
      bigVessel = await createVessel(40);
      smallVessel = await createVessel(10);
      const pickup = await createPickup(foodRequestId, startsAt, endsAt);
      expect(pickup.status).toBe(201);
      pickupId = pickup.body.data.id;
    });

    const payload = (overrides: Record<string, unknown> = {}) => ({
      teamId: null, volunteerIds: [volunteerId], driverId: driverA, vesselIds: [bigVessel], role: 'Pickup crew',
      windowStartsAt: startsAt.toISOString(), windowEndsAt: endsAt.toISOString(),
      containers: [{ containerType: 'Food crate', count: 1, estimatedLoadKg: 30 }], ...overrides,
    });
    const assign = (id: string, key: string, body: Record<string, unknown>) =>
      request(app).post(`/api/v1/pickups/${id}/assignments`).set(auth).set('Idempotency-Key', key).send(body);

    it('lists employee drivers with their fixed vehicle and explains capacity ineligibility', async () => {
      const options = await request(app).get(`/api/v1/pickups/${pickupId}/driver-options`).set(auth);
      expect(options.status).toBe(200);
      expect(options.body.data.load).toMatchObject({ weightKg: 30, basis: 'MEASURED' });
      const a = options.body.data.options.find((item: { driverId: string }) => item.driverId === driverA);
      const b = options.body.data.options.find((item: { driverId: string }) => item.driverId === driverB);
      expect(a).toMatchObject({ eligible: true, vehicle: { id: vehicleA }, capacity: { status: 'FITS' } });
      expect(b.eligible).toBe(false);
      expect(b.reasons.join(' ')).toContain('Vehicle capacity is insufficient');
    });

    it('recommends real containers that hold the load', async () => {
      const options = await request(app).get(`/api/v1/pickups/${pickupId}/container-options`).query({ driverId: driverA }).set(auth);
      expect(options.status).toBe(200);
      expect(options.body.data.vehicleId).toBe(vehicleA);
      expect(options.body.data.recommendation.sufficient).toBe(true);
      expect(options.body.data.recommendation.vesselIds).toContain(bigVessel);
    });

    it('rejects Driver A with Vehicle B, an over-capacity driver and an undersized container plan without partial writes', async () => {
      const mismatch = await assign(pickupId, `mismatch-${tag}`, payload({ vehicleId: vehicleB }));
      expect(mismatch.status).toBe(409);
      expect(mismatch.body.error.code).toBe('DRIVER_VEHICLE_MISMATCH');
      const overCapacity = await assign(pickupId, `capacity-${tag}`, payload({ driverId: driverB, vesselIds: [bigVessel] }));
      expect(overCapacity.status).toBe(409);
      expect(overCapacity.body.error.code).toBe('VEHICLE_CAPACITY_INSUFFICIENT');
      const undersized = await assign(pickupId, `containers-${tag}`, payload({ vesselIds: [smallVessel] }));
      expect(undersized.status).toBe(409);
      expect(undersized.body.error.code).toBe('CONTAINER_PLAN_INVALID');
      const noContainers = await assign(pickupId, `no-containers-${tag}`, payload({ vesselIds: [] }));
      expect(noContainers.status).toBe(409);
      const [assignments, issued] = await Promise.all([
        q<{ count: number }>('SELECT count(*)::int AS count FROM app.assignments WHERE pickup_id = $1', [pickupId]),
        q<{ count: number }>("SELECT count(*)::int AS count FROM app.vessel_issuances WHERE pickup_id = $1", [pickupId]),
      ]);
      expect(assignments[0].count).toBe(0);
      expect(issued[0].count).toBe(0);
    });

    it('creates the assignment from the driver alone, deriving the fixed vehicle', async () => {
      const response = await assign(pickupId, `create-${tag}`, payload());
      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({ driverId: driverA, vehicleId: vehicleA, status: 'PENDING', volunteerIds: [volunteerId] });
      const reservations = await q<{ person_id: string | null; vehicle_id: string | null }>(
        "SELECT person_id, vehicle_id FROM app.resource_reservations WHERE assignment_id = $1 AND state = 'ACTIVE'", [response.body.data.id]
      );
      expect(reservations).toHaveLength(3);
      expect(reservations.filter(row => row.vehicle_id === vehicleA)).toHaveLength(1);
      const vessel = await q<{ status: string }>('SELECT status FROM app.vessels WHERE id = $1', [bigVessel]);
      expect(vessel[0].status).toBe('IN_USE');
    });

    it('rejects double-booking the same driver and vehicle in an overlapping window', async () => {
      const otherRequest = await createApprovedFoodRequest(5, future(30), future(480));
      const second = await createPickup(otherRequest, startsAt, endsAt);
      secondPickupId = second.body.data.id;
      const options = await request(app).get(`/api/v1/pickups/${secondPickupId}/driver-options`).set(auth);
      const a = options.body.data.options.find((item: { driverId: string }) => item.driverId === driverA);
      expect(a.eligible).toBe(false);
      expect(a.reasons.join(' ')).toContain('already scheduled');
      const extraVessel = await createVessel(20);
      const otherVolunteer = await createVolunteer(`Crew 2 ${tag}`, future(60), future(600));
      const conflict = await assign(secondPickupId, `conflict-${tag}`, payload({ volunteerIds: [otherVolunteer], vesselIds: [extraVessel] }));
      expect(conflict.status).toBe(409);
    });

    it('locks the schedule of an assigned pickup but allows notes', async () => {
      const pickup = (await request(app).get(`/api/v1/pickups/${pickupId}`).set(auth)).body.data;
      const locked = await request(app).patch(`/api/v1/pickups/${pickupId}`).set(auth)
        .send({ expectedVersion: pickup.version, windowStartsAt: future(150).toISOString(), windowEndsAt: future(260).toISOString() });
      expect(locked.status).toBe(409);
      expect(locked.body.error.code).toBe('PICKUP_SCHEDULE_LOCKED');
      const notes = await request(app).patch(`/api/v1/pickups/${pickupId}`).set(auth)
        .send({ expectedVersion: pickup.version, operationalNotes: 'Use the back gate.' });
      expect(notes.status).toBe(200);
      expect(notes.body.data.operationalNotes).toBe('Use the back gate.');
    });

    it('edits a planned pickup, persists it with an audit row, and rejects invalid or stale edits', async () => {
      const before = (await request(app).get(`/api/v1/pickups/${secondPickupId}`).set(auth)).body.data;
      const newStart = future(300);
      const newEnd = future(360);
      const edit = await request(app).patch(`/api/v1/pickups/${secondPickupId}`).set(auth)
        .send({ expectedVersion: before.version, windowStartsAt: newStart.toISOString(), windowEndsAt: newEnd.toISOString(), distributionCenterId: (await q<{ id: string }>("INSERT INTO app.distribution_centers(address) VALUES ($1) RETURNING id", ['Second hub']))[0].id });
      expect(edit.status).toBe(200);
      const reloaded = (await request(app).get(`/api/v1/pickups/${secondPickupId}`).set(auth)).body.data;
      expect(new Date(reloaded.windowStartsAt).getTime()).toBe(newStart.getTime());
      expect(reloaded.deliveryAddress).toBe('Second hub');
      const audit = await q<{ count: number }>('SELECT count(*)::int AS count FROM app.pickup_schedule_changes WHERE pickup_id = $1', [secondPickupId]);
      expect(audit[0].count).toBe(1);

      const stale = await request(app).patch(`/api/v1/pickups/${secondPickupId}`).set(auth)
        .send({ expectedVersion: before.version, operationalNotes: 'stale' });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('VERSION_CONFLICT');
      const afterDeadline = await request(app).patch(`/api/v1/pickups/${secondPickupId}`).set(auth)
        .send({ expectedVersion: reloaded.version, windowStartsAt: future(470).toISOString(), windowEndsAt: future(600).toISOString() });
      expect(afterDeadline.status).toBe(409);
      const inverted = await request(app).patch(`/api/v1/pickups/${secondPickupId}`).set(auth)
        .send({ expectedVersion: reloaded.version, windowStartsAt: future(360).toISOString(), windowEndsAt: future(300).toISOString() });
      expect(inverted.status).toBe(400);
      actor.role = 'VOLUNTEER';
      try {
        const forbidden = await request(app).patch(`/api/v1/pickups/${secondPickupId}`).set(auth)
          .send({ expectedVersion: reloaded.version, operationalNotes: 'nope' });
        expect(forbidden.status).toBe(403);
      } finally { actor.role = 'ADMIN'; }
    });

    it('safely removes an assigned pickup: cancels, releases reservations and containers, keeps the food request', async () => {
      const pickup = (await request(app).get(`/api/v1/pickups/${pickupId}`).set(auth)).body.data;
      const removed = await request(app).post(`/api/v1/pickups/${pickupId}/cancel`).set(auth)
        .send({ expectedVersion: pickup.version, reason: 'Donor event postponed' });
      expect(removed.status).toBe(200);
      expect(removed.body.data).toMatchObject({ status: 'CANCELLED', alreadyCancelled: false });
      const [assignment, active, food, vessel, history] = await Promise.all([
        q<{ status: string }>('SELECT status FROM app.assignments WHERE pickup_id = $1', [pickupId]),
        q<{ count: number }>("SELECT count(*)::int AS count FROM app.resource_reservations r JOIN app.assignments a ON a.id = r.assignment_id WHERE a.pickup_id = $1 AND r.state = 'ACTIVE'", [pickupId]),
        q<{ status: string }>('SELECT status FROM app.food_requests WHERE id = $1', [foodRequestId]),
        q<{ status: string }>('SELECT status FROM app.vessels WHERE id = $1', [bigVessel]),
        q<{ to_status: string; reason: string }>('SELECT to_status, reason FROM app.pickup_status_events WHERE pickup_id = $1 ORDER BY occurred_at DESC LIMIT 1', [pickupId]),
      ]);
      expect(assignment.map(row => row.status)).toEqual(['CANCELLED']);
      expect(active[0].count).toBe(0);
      expect(food[0].status).toBe('SUBMITTED');
      expect(vessel[0].status).not.toBe('IN_USE');
      expect(history[0]).toMatchObject({ to_status: 'CANCELLED' });
      expect(history[0].reason).toContain('Donor event postponed');

      const repeat = await request(app).post(`/api/v1/pickups/${pickupId}/cancel`).set(auth)
        .send({ expectedVersion: pickup.version, reason: 'Double click' });
      expect(repeat.status).toBe(200);
      expect(repeat.body.data.alreadyCancelled).toBe(true);

      const rescheduled = await createPickup(foodRequestId, future(130), future(250));
      expect(rescheduled.status).toBe(201);
      expect((await createPickup(foodRequestId, future(130), future(250))).status).toBe(409);
    });

    it('refuses to remove an in-progress or delivered pickup', async () => {
      for (const status of ['EN_ROUTE', 'DELIVERED']) {
        const requestId = await createApprovedFoodRequest(5, future(30), future(480));
        const pickup = (await createPickup(requestId, future(400), future(450))).body.data;
        await q('UPDATE app.pickups SET status = $2 WHERE id = $1', [pickup.id, status]);
        const response = await request(app).post(`/api/v1/pickups/${pickup.id}/cancel`).set(auth)
          .send({ expectedVersion: pickup.version, reason: 'Should not be allowed' });
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe(status === 'DELIVERED' ? 'PICKUP_COMPLETED' : 'PICKUP_IN_PROGRESS');
      }
    });
  });
});
