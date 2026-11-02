import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

const { actor } = vi.hoisted(() => ({ actor: { id: '', role: 'ADMIN' } }));

vi.mock('../src/auth/supabase', () => ({
  verifySupabaseToken: vi.fn(async () => ({ authUserId: 'b0000000-0000-4000-8000-000000000001', email: 'admin@example.test' })),
}));
vi.mock('../src/auth/appUsers', () => ({
  findOrCreateAppUser: vi.fn(async () => ({
    id: actor.id,
    authUserId: 'b0000000-0000-4000-8000-000000000001',
    role: actor.role,
    displayName: 'Integration admin',
  })),
}));

import { app } from '../src/app';
import { closePool, getPool } from '../src/db/pool';

const testUrl = process.env.TEST_DATABASE_URL;
let testDatabaseName = '';
try {
  testDatabaseName = testUrl ? decodeURIComponent(new URL(testUrl).pathname.slice(1)) : '';
} catch {
  // A malformed test URL never enables database mutation.
}
const enabled = testDatabaseName.endsWith('_test')
  && process.env.ALLOW_TEST_DATABASE_MUTATION === 'true'
  && process.env.DATABASE_URL === testUrl;
if (process.env.CI && !enabled) {
  throw new Error('CI pickup integration tests require DATABASE_URL and TEST_DATABASE_URL to name the same dedicated _test database and ALLOW_TEST_DATABASE_MUTATION=true.');
}

type Fixture = {
  userId: string;
  donorId: string;
  personIds: string[];
  volunteerId: string;
  driverId: string;
  vehicleId: string;
  foodRequestId: string;
  pickupId: string;
  payload: {
    teamId: null;
    volunteerIds: string[];
    driverId: string;
    vehicleId: string;
    role: string;
    windowStartsAt: string;
    windowEndsAt: string;
    containers: { containerType: string; count: number; estimatedLoadKg: number }[];
  };
};

async function seedFixture(sharedDriverAndVolunteer = false, vehicleStatus = 'ACTIVE'): Promise<Fixture> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const userId = (await client.query<{ id: string }>(
      "INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, 'ADMIN') RETURNING id",
      [randomUUID()]
    )).rows[0].id;
    const donorId = (await client.query<{ id: string }>(
      'INSERT INTO app.donors(app_user_id) VALUES ($1) RETURNING id', [userId]
    )).rows[0].id;
    const volunteerPersonId = (await client.query<{ id: string }>(
      "INSERT INTO app.people(name) VALUES ('Integration volunteer') RETURNING id"
    )).rows[0].id;
    const driverPersonId = sharedDriverAndVolunteer
      ? volunteerPersonId
      : (await client.query<{ id: string }>(
        "INSERT INTO app.people(name) VALUES ('Integration driver') RETURNING id"
      )).rows[0].id;
    const volunteerId = (await client.query<{ id: string }>(
      "INSERT INTO app.volunteers(person_id, registration_code) VALUES ($1, $2) RETURNING id",
      [volunteerPersonId, `VOL-${randomUUID()}`]
    )).rows[0].id;
    const driverId = (await client.query<{ id: string }>(
      "INSERT INTO app.drivers(person_id, licence_number, licence_expires_on) VALUES ($1, $2, '2099-01-01') RETURNING id",
      [driverPersonId, `DL-${randomUUID()}`]
    )).rows[0].id;
    const vehicleId = (await client.query<{ id: string }>(
      'INSERT INTO app.vehicles(registration_number, kind, capacity_kg, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [`TEST-${randomUUID()}`, 'Van', 500, vehicleStatus]
    )).rows[0].id;
    const startsAt = new Date(Date.now() + 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
    await client.query(
      "INSERT INTO app.volunteer_availability(volunteer_id, starts_at, ends_at, state) VALUES ($1, $2, $3, 'AVAILABLE')",
      [volunteerId, new Date(startsAt.getTime() - 300000), new Date(endsAt.getTime() + 300000)]
    );
    const foodRequestId = (await client.query<{ id: string }>(`
      INSERT INTO app.food_requests(
        donor_id, source_name, source_type, pickup_address, prepared_at, ready_at,
        pickup_deadline, donor_safety_declaration, safety_review, safety_reviewed_by,
        safety_reviewed_at, contact_name, contact_phone_e164
      ) VALUES ($1, 'Integration event', 'Event', 'Test street', $2, $3, $4,
        true, 'APPROVED', $5, now(), 'Test coordinator', '+919123456780') RETURNING id
    `, [donorId, new Date(startsAt.getTime() - 7200000), new Date(startsAt.getTime() - 3600000),
      new Date(endsAt.getTime() + 3600000), userId])).rows[0].id;
    const pickupId = (await client.query<{ id: string }>(
      "INSERT INTO app.pickups(food_request_id, window_starts_at, window_ends_at, delivery_address) VALUES ($1, $2, $3, 'Test hub') RETURNING id",
      [foodRequestId, startsAt, endsAt]
    )).rows[0].id;
    await client.query('COMMIT');
    return {
      userId, donorId, personIds: [...new Set([volunteerPersonId, driverPersonId])],
      volunteerId, driverId, vehicleId, foodRequestId, pickupId,
      payload: {
        teamId: null,
        volunteerIds: [volunteerId],
        driverId,
        vehicleId,
        role: 'Pickup volunteer',
        windowStartsAt: startsAt.toISOString(),
        windowEndsAt: endsAt.toISOString(),
        containers: [{ containerType: 'insulated crate', count: 2, estimatedLoadKg: 20 }],
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function removeFixture(fixture: Fixture): Promise<void> {
  const client: PoolClient = await getPool().connect();
  try {
    await client.query('BEGIN');
    const assignmentIds = (await client.query<{ id: string }>(
      'SELECT id FROM app.assignments WHERE pickup_id = $1', [fixture.pickupId]
    )).rows.map(row => row.id);
    await client.query('DELETE FROM app.idempotency_keys WHERE actor_user_id = $1', [fixture.userId]);
    await client.query('DELETE FROM app.assignment_status_events WHERE assignment_id = ANY($1::uuid[])', [assignmentIds]);
    await client.query('DELETE FROM app.pickup_status_events WHERE pickup_id = $1', [fixture.pickupId]);
    await client.query('DELETE FROM app.resource_reservations WHERE assignment_id = ANY($1::uuid[])', [assignmentIds]);
    await client.query('DELETE FROM app.assignment_members WHERE assignment_id = ANY($1::uuid[])', [assignmentIds]);
    await client.query('DELETE FROM app.container_plans WHERE pickup_id = $1', [fixture.pickupId]);
    await client.query('DELETE FROM app.assignments WHERE pickup_id = $1', [fixture.pickupId]);
    await client.query('DELETE FROM app.pickups WHERE id = $1', [fixture.pickupId]);
    await client.query('DELETE FROM app.food_requests WHERE id = $1', [fixture.foodRequestId]);
    await client.query('DELETE FROM app.volunteer_availability WHERE volunteer_id = $1', [fixture.volunteerId]);
    await client.query('DELETE FROM app.volunteers WHERE id = $1', [fixture.volunteerId]);
    await client.query('DELETE FROM app.drivers WHERE id = $1', [fixture.driverId]);
    await client.query('DELETE FROM app.vehicles WHERE id = $1', [fixture.vehicleId]);
    await client.query('DELETE FROM app.people WHERE id = ANY($1::uuid[])', [fixture.personIds]);
    await client.query('DELETE FROM app.donors WHERE id = $1', [fixture.donorId]);
    await client.query('DELETE FROM app.app_users WHERE id = $1', [fixture.userId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function withFixture<T>(run: (fixture: Fixture) => Promise<T>, sharedPerson = false, vehicleStatus = 'ACTIVE'): Promise<T> {
  const fixture = await seedFixture(sharedPerson, vehicleStatus);
  actor.id = fixture.userId;
  actor.role = 'ADMIN';
  try {
    return await run(fixture);
  } finally {
    await removeFixture(fixture);
    actor.id = '';
    actor.role = 'ADMIN';
  }
}

function assign(fixture: Fixture, key: string) {
  return request(app)
    .post(`/api/v1/pickups/${fixture.pickupId}/assignments`)
    .set('Authorization', 'Bearer integration-test-token')
    .set('Idempotency-Key', key)
    .send(fixture.payload);
}

afterAll(async () => {
  if (enabled) await closePool();
});

describe.skipIf(!enabled)('Pickup assignment HTTP + PostgreSQL integration', () => {
  it('lets one parallel reservation win and rolls back the losing request', async () => withFixture(async fixture => {
    const [first, second] = await Promise.all([
      assign(fixture, 'race-first'), assign(fixture, 'race-second'),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const loser = first.status === 409 ? first : second;
    expect(loser.body.error.code).toBe('RESOURCE_CONFLICT');
    const [assignments, plans, reservations, keys] = await Promise.all([
      getPool().query('SELECT count(*)::int AS count FROM app.assignments WHERE pickup_id = $1', [fixture.pickupId]),
      getPool().query('SELECT count(*)::int AS count FROM app.container_plans WHERE pickup_id = $1', [fixture.pickupId]),
      getPool().query('SELECT count(*)::int AS count FROM app.resource_reservations WHERE assignment_id IN (SELECT id FROM app.assignments WHERE pickup_id = $1)', [fixture.pickupId]),
      getPool().query('SELECT count(*)::int AS count FROM app.idempotency_keys WHERE actor_user_id = $1', [fixture.userId]),
    ]);
    expect([assignments.rows[0].count, plans.rows[0].count, reservations.rows[0].count, keys.rows[0].count])
      .toEqual([1, 1, 3, 1]);
  }));

  it('reserves one canonical person when the driver is also the volunteer', async () => withFixture(async fixture => {
    const response = await assign(fixture, 'shared-person');
    expect(response.status).toBe(201);
    const reservations = await getPool().query(
      'SELECT person_id, vehicle_id FROM app.resource_reservations WHERE assignment_id = $1',
      [response.body.data.id]
    );
    expect(reservations.rows).toHaveLength(2);
    expect(reservations.rows.filter(row => row.person_id === fixture.personIds[0])).toHaveLength(1);
    expect(reservations.rows.filter(row => row.vehicle_id === fixture.vehicleId)).toHaveLength(1);
  }, true));

  it('rejects a maintenance vehicle without writing an assignment', async () => withFixture(async fixture => {
    const response = await assign(fixture, 'maintenance');
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('RESOURCE_CONFLICT');
    const assignments = await getPool().query('SELECT count(*)::int AS count FROM app.assignments WHERE pickup_id = $1', [fixture.pickupId]);
    expect(assignments.rows[0].count).toBe(0);
  }, false, 'MAINTENANCE'));

  it('rolls back assignment rows when a real reservation exclusion conflict occurs', async () => withFixture(async fixture => {
    const holder = await getPool().query<{ id: string }>(
      `INSERT INTO app.assignments (pickup_id, driver_id, vehicle_id, role, status)
       VALUES ($1, $2, $3, 'Conflict fixture', 'CANCELLED')
       RETURNING id`,
      [fixture.pickupId, fixture.driverId, fixture.vehicleId]
    );
    await getPool().query(
      `INSERT INTO app.resource_reservations
         (assignment_id, vehicle_id, starts_at, ends_at, state)
       VALUES ($1, $2, $3, $4, 'ACTIVE')`,
      [holder.rows[0].id, fixture.vehicleId, fixture.payload.windowStartsAt, fixture.payload.windowEndsAt]
    );

    const response = await assign(fixture, 'reservation-conflict');
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('RESOURCE_CONFLICT');

    const [assignments, members, plans, reservations, assignmentEvents, idempotency, pickup] = await Promise.all([
      getPool().query('SELECT count(*)::int AS count FROM app.assignments WHERE pickup_id = $1', [fixture.pickupId]),
      getPool().query('SELECT count(*)::int AS count FROM app.assignment_members WHERE assignment_id <> $1 AND assignment_id IN (SELECT id FROM app.assignments WHERE pickup_id = $2)', [holder.rows[0].id, fixture.pickupId]),
      getPool().query('SELECT count(*)::int AS count FROM app.container_plans WHERE pickup_id = $1', [fixture.pickupId]),
      getPool().query('SELECT count(*)::int AS count FROM app.resource_reservations WHERE assignment_id IN (SELECT id FROM app.assignments WHERE pickup_id = $1)', [fixture.pickupId]),
      getPool().query('SELECT count(*)::int AS count FROM app.assignment_status_events WHERE assignment_id IN (SELECT id FROM app.assignments WHERE pickup_id = $1)', [fixture.pickupId]),
      getPool().query('SELECT count(*)::int AS count FROM app.idempotency_keys WHERE actor_user_id = $1', [fixture.userId]),
      getPool().query('SELECT status FROM app.pickups WHERE id = $1', [fixture.pickupId]),
    ]);

    expect(assignments.rows[0].count).toBe(1);
    expect(members.rows[0].count).toBe(0);
    expect(plans.rows[0].count).toBe(0);
    expect(reservations.rows[0].count).toBe(1);
    expect(assignmentEvents.rows[0].count).toBe(0);
    expect(idempotency.rows[0].count).toBe(0);
    expect(pickup.rows[0].status).toBe('PLANNED');
  }));

  it('rolls back assignment and reservations when a selected vessel is unavailable', async () => withFixture(async fixture => {
    const vesselId = (await getPool().query<{ id: string }>(
      `INSERT INTO app.vessels
         (vessel_code, name, vessel_type, material, capacity_value, capacity_unit,
          temperature_suitability, status)
       VALUES ($1, 'Unavailable test crate', 'CRATE', 'FOOD_GRADE_PLASTIC', 50, 'KG',
               'AMBIENT', 'IN_USE')
       RETURNING id`,
      [`UNAVAILABLE-${randomUUID()}`]
    )).rows[0].id;

    try {
      const response = await request(app)
        .post(`/api/v1/pickups/${fixture.pickupId}/assignments`)
        .set('Authorization', 'Bearer integration-test-token')
        .set('Idempotency-Key', 'unavailable-vessel')
        .send({ ...fixture.payload, vesselIds: [vesselId] });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(response.body.error.message).toContain('already in use');

      const [assignments, plans, reservations, pickup] = await Promise.all([
        getPool().query('SELECT count(*)::int AS count FROM app.assignments WHERE pickup_id = $1', [fixture.pickupId]),
        getPool().query('SELECT count(*)::int AS count FROM app.container_plans WHERE pickup_id = $1', [fixture.pickupId]),
        getPool().query('SELECT count(*)::int AS count FROM app.resource_reservations WHERE assignment_id IN (SELECT id FROM app.assignments WHERE pickup_id = $1)', [fixture.pickupId]),
        getPool().query('SELECT status FROM app.pickups WHERE id = $1', [fixture.pickupId]),
      ]);
      expect(assignments.rows[0].count).toBe(0);
      expect(plans.rows[0].count).toBe(0);
      expect(reservations.rows[0].count).toBe(0);
      expect(pickup.rows[0].status).toBe('PLANNED');
    } finally {
      await getPool().query('DELETE FROM app.vessels WHERE id = $1', [vesselId]);
    }
  }));

  it('returns the stored assignment on an idempotent replay', async () => withFixture(async fixture => {
    const first = await assign(fixture, 'replay');
    const replay = await assign(fixture, 'replay');
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.data.id).toBe(first.body.data.id);
    const assignments = await getPool().query('SELECT count(*)::int AS count FROM app.assignments WHERE pickup_id = $1', [fixture.pickupId]);
    expect(assignments.rows[0].count).toBe(1);
  }));

  it('persists donor submission through assignment and returns the same request/pickup link after refresh', async () => {
    const adminId = (await getPool().query<{ id: string }>(
      "INSERT INTO app.app_users (auth_user_id, role) VALUES ($1, 'ADMIN') RETURNING id",
      [randomUUID()]
    )).rows[0].id;
    const donorUserId = (await getPool().query<{ id: string }>(
      "INSERT INTO app.app_users (auth_user_id, role) VALUES ($1, 'DONOR') RETURNING id",
      [randomUUID()]
    )).rows[0].id;
    const volunteerUserId = (await getPool().query<{ id: string }>(
      "INSERT INTO app.app_users (auth_user_id, role) VALUES ($1, 'VOLUNTEER') RETURNING id",
      [randomUUID()]
    )).rows[0].id;
    const volunteerPersonId = (await getPool().query<{ id: string }>(
      "INSERT INTO app.people (app_user_id, name) VALUES ($1, 'Workflow volunteer') RETURNING id",
      [volunteerUserId]
    )).rows[0].id;
    const driverPersonId = (await getPool().query<{ id: string }>(
      "INSERT INTO app.people (name) VALUES ('Workflow driver') RETURNING id"
    )).rows[0].id;
    const volunteerId = (await getPool().query<{ id: string }>(
      'INSERT INTO app.volunteers (person_id, registration_code) VALUES ($1, $2) RETURNING id',
      [volunteerPersonId, `VOL-${randomUUID()}`]
    )).rows[0].id;
    const driverId = (await getPool().query<{ id: string }>(
      'INSERT INTO app.drivers (person_id, licence_number, licence_expires_on) VALUES ($1, $2, $3) RETURNING id',
      [driverPersonId, `DL-${randomUUID()}`, '2099-01-01']
    )).rows[0].id;
    const vehicleId = (await getPool().query<{ id: string }>(
      'INSERT INTO app.vehicles (registration_number, kind, capacity_kg) VALUES ($1, $2, $3) RETURNING id',
      [`WORKFLOW-${randomUUID()}`, 'Van', 500]
    )).rows[0].id;
    const vesselId = (await getPool().query<{ id: string }>(
      `INSERT INTO app.vessels
         (vessel_code, name, vessel_type, material, capacity_value, capacity_unit,
          temperature_suitability, storage_location)
       VALUES ($1, 'Workflow crate', 'CRATE', 'FOOD_GRADE_PLASTIC', 50, 'KG',
               'AMBIENT', 'Test warehouse')
       RETURNING id`,
      [`WORKFLOW-${randomUUID()}`]
    )).rows[0].id;
    const startsAt = new Date(Date.now() + 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
    const readyAt = new Date(startsAt.getTime() - 15 * 60 * 1000);
    const deadline = new Date(endsAt.getTime() + 60 * 60 * 1000);
    await getPool().query(
      `INSERT INTO app.volunteer_availability (volunteer_id, starts_at, ends_at, state)
       VALUES ($1, $2, $3, 'AVAILABLE')`,
      [volunteerId, new Date(startsAt.getTime() - 5 * 60 * 1000), new Date(endsAt.getTime() + 5 * 60 * 1000)]
    );

    let foodRequestId: string | null = null;
    let pickupId: string | null = null;
    let assignmentId: string | null = null;
    actor.id = donorUserId;
    actor.role = 'DONOR';
    try {
      const foodResponse = await request(app)
        .post('/api/v1/food-requests')
        .set('Authorization', 'Bearer integration-test-token')
        .send({
          sourceName: 'Workflow test kitchen',
          sourceType: 'Event',
          pickupAddress: 'Test donor address',
          preparedAt: new Date(readyAt.getTime() - 60 * 60 * 1000).toISOString(),
          readyAt: readyAt.toISOString(),
          pickupDeadline: deadline.toISOString(),
          estimatedWeightKg: 25,
          handlingRequirements: 'Keep covered',
          donorSafetyDeclaration: true,
          contactName: 'Workflow coordinator',
          contactPhoneE164: '+919123456780',
          items: [{ foodType: 'Rice', quantity: 25, unit: 'KG', handlingRequirements: 'Keep covered' }],
        });
      expect(foodResponse.status).toBe(201);
      foodRequestId = foodResponse.body.data.id;

      actor.id = adminId;
      actor.role = 'ADMIN';
      const reviewResponse = await request(app)
        .post(`/api/v1/food-requests/${foodRequestId}/safety-review`)
        .set('Authorization', 'Bearer integration-test-token')
        .send({ review: 'APPROVED' });
      expect(reviewResponse.status).toBe(200);

      const pickupResponse = await request(app)
        .post('/api/v1/pickups')
        .set('Authorization', 'Bearer integration-test-token')
        .send({
          foodRequestId,
          windowStartsAt: startsAt.toISOString(),
          windowEndsAt: endsAt.toISOString(),
          deliveryAddress: 'Test distribution hub',
        });
      expect(pickupResponse.status).toBe(201);
      pickupId = pickupResponse.body.data.id;
      expect(pickupResponse.body.data.foodRequestId).toBe(foodRequestId);

      const assignmentResponse = await request(app)
        .post(`/api/v1/pickups/${pickupId}/assignments`)
        .set('Authorization', 'Bearer integration-test-token')
        .set('Idempotency-Key', 'donor-workflow-assignment')
        .send({
          teamId: null,
          volunteerIds: [volunteerId],
          vesselIds: [vesselId],
          driverId,
          vehicleId,
          role: 'Pickup volunteer',
          windowStartsAt: startsAt.toISOString(),
          windowEndsAt: endsAt.toISOString(),
          containers: [{ containerType: 'insulated crate', count: 2, estimatedLoadKg: 25 }],
        });
      expect(assignmentResponse.status).toBe(201);
      assignmentId = assignmentResponse.body.data.id;
      expect(assignmentResponse.body.data.vehicleId).toBe(vehicleId);
      const selectedVehicleCount = await getPool().query(
        'SELECT count(*)::int AS count FROM app.vehicles WHERE id = $1',
        [vehicleId]
      );
      expect(selectedVehicleCount.rows[0].count).toBe(1);

      const persistedLink = await getPool().query(
        `SELECT fr.id AS food_request_id, p.id AS pickup_id, p.status
         FROM app.food_requests fr
         JOIN app.pickups p ON p.food_request_id = fr.id
         WHERE fr.id = $1`,
        [foodRequestId]
      );
      expect(persistedLink.rows).toHaveLength(1);
      expect(persistedLink.rows[0]).toMatchObject({
        food_request_id: foodRequestId,
        pickup_id: pickupId,
        status: 'ASSIGNED',
      });

      const persistedAssignment = await getPool().query(
        `SELECT a.id, count(r.id)::int AS reservation_count
         FROM app.assignments a
         JOIN app.resource_reservations r ON r.assignment_id = a.id AND r.state = 'ACTIVE'
         WHERE a.id = $1
         GROUP BY a.id`,
        [assignmentId]
      );
      expect(persistedAssignment.rows).toEqual([{ id: assignmentId, reservation_count: 3 }]);

      const persistedVessel = await getPool().query(
        `SELECT vi.pickup_id, vi.vehicle_id, vi.status, v.status AS vessel_status
         FROM app.vessel_issuances vi
         JOIN app.vessels v ON v.id = vi.vessel_id
         WHERE vi.vessel_id = $1`,
        [vesselId]
      );
      expect(persistedVessel.rows).toEqual([{
        pickup_id: pickupId,
        vehicle_id: vehicleId,
        status: 'ACTIVE',
        vessel_status: 'IN_USE',
      }]);

      const refreshed = await request(app)
        .get('/api/v1/food-requests')
        .set('Authorization', 'Bearer integration-test-token');
      expect(refreshed.status).toBe(200);
      const requestAfterRefresh = refreshed.body.data.items.find((item: { id: string }) => item.id === foodRequestId);
      expect(requestAfterRefresh.pickup).toMatchObject({
        id: pickupId,
        status: 'ASSIGNED',
        assignmentStatus: 'PENDING',
      });

      const duplicatePickup = await request(app)
        .post('/api/v1/pickups')
        .set('Authorization', 'Bearer integration-test-token')
        .send({
          foodRequestId,
          windowStartsAt: startsAt.toISOString(),
          windowEndsAt: endsAt.toISOString(),
          deliveryAddress: 'Test distribution hub',
        });
      expect(duplicatePickup.status).toBe(409);
      const pickupCount = await getPool().query(
        'SELECT count(*)::int AS count FROM app.pickups WHERE food_request_id = $1',
        [foodRequestId]
      );
      expect(pickupCount.rows[0].count).toBe(1);
    } finally {
      actor.id = '';
      actor.role = 'ADMIN';
      const cleanup = await getPool().connect();
      try {
        await cleanup.query('BEGIN');
        if (assignmentId) {
          await cleanup.query('DELETE FROM app.idempotency_keys WHERE actor_user_id = $1', [adminId]);
          await cleanup.query('DELETE FROM app.assignment_status_events WHERE assignment_id = $1', [assignmentId]);
          await cleanup.query('DELETE FROM app.resource_reservations WHERE assignment_id = $1', [assignmentId]);
          await cleanup.query('DELETE FROM app.assignment_members WHERE assignment_id = $1', [assignmentId]);
          if (pickupId) await cleanup.query('DELETE FROM app.container_plans WHERE pickup_id = $1', [pickupId]);
          await cleanup.query('DELETE FROM app.assignments WHERE id = $1', [assignmentId]);
        }
        await cleanup.query('DELETE FROM app.vessel_logs WHERE vessel_id = $1', [vesselId]);
        await cleanup.query('DELETE FROM app.vessel_issuances WHERE vessel_id = $1', [vesselId]);
        if (pickupId) {
          await cleanup.query('DELETE FROM app.pickup_status_events WHERE pickup_id = $1', [pickupId]);
          await cleanup.query('DELETE FROM app.pickups WHERE id = $1', [pickupId]);
        }
        if (foodRequestId) {
          await cleanup.query('DELETE FROM app.food_items WHERE food_request_id = $1', [foodRequestId]);
          await cleanup.query('DELETE FROM app.food_requests WHERE id = $1', [foodRequestId]);
        }
        await cleanup.query('DELETE FROM app.donors WHERE app_user_id = $1', [donorUserId]);
        await cleanup.query('DELETE FROM app.volunteer_availability WHERE volunteer_id = $1', [volunteerId]);
        await cleanup.query('DELETE FROM app.volunteers WHERE id = $1', [volunteerId]);
        await cleanup.query('DELETE FROM app.drivers WHERE id = $1', [driverId]);
        await cleanup.query('DELETE FROM app.vehicles WHERE id = $1', [vehicleId]);
        await cleanup.query('DELETE FROM app.vessels WHERE id = $1', [vesselId]);
        await cleanup.query('DELETE FROM app.people WHERE id = ANY($1::uuid[])', [[volunteerPersonId, driverPersonId]]);
        await cleanup.query('DELETE FROM app.app_users WHERE id = ANY($1::uuid[])', [[adminId, donorUserId, volunteerUserId]]);
        await cleanup.query('COMMIT');
      } catch (error) {
        await cleanup.query('ROLLBACK');
        throw error;
      } finally {
        cleanup.release();
      }
    }
  });
});
