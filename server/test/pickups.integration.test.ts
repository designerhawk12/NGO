import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  cancelForFoodRequest,
  createAssignment,
  createPickup,
  getPickupById,
  transitionAssignmentStatus,
} from '../src/modules/pickups/service';
import { defaultFoodPort } from '../src/modules/pickups/ports';

const testDatabaseName = process.env.TEST_DATABASE_URL ? decodeURIComponent(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1)) : '';
const enabled = testDatabaseName.endsWith('_test') && process.env.ALLOW_TEST_DATABASE_MUTATION === 'true';

describe.skipIf(!enabled)('Pickups module integration (PR1)', () => {
  it('creates and reads canonical pickup records and rejects duplicate food request links', async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query<{ id: string }>(
        'INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, $2) RETURNING id',
        [randomUUID(), 'ADMIN']
      );
      const donor = await client.query<{ id: string }>(
        'INSERT INTO app.donors(app_user_id) VALUES ($1) RETURNING id',
        [user.rows[0].id]
      );
      const start = new Date(Date.now() + 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      const food = await client.query<{ id: string }>(`
        INSERT INTO app.food_requests(
          donor_id, source_name, source_type, pickup_address, prepared_at, ready_at,
          pickup_deadline, donor_safety_declaration, safety_review, safety_reviewed_by,
          safety_reviewed_at, contact_name, contact_phone_e164
        )
        VALUES ($1, 'Test Banquet', 'Event', 'Test Street, Bengaluru', now(), now(), $2, true, 'APPROVED', $3, now(), 'Coordinator', '+919123456780')
        RETURNING id
      `, [donor.rows[0].id, end, user.rows[0].id]);

      const created = await createPickup({
        foodRequestId: food.rows[0].id,
        windowStartsAt: start.toISOString(),
        windowEndsAt: end.toISOString(),
        deliveryAddress: 'Central Food Bank Hub',
      }, user.rows[0].id, defaultFoodPort, client);

      expect(created.status).toBe('PLANNED');
      expect(created.foodRequestId).toBe(food.rows[0].id);

      const fetched = await getPickupById(created.id, client);
      expect(fetched.id).toBe(created.id);
      expect(fetched.deliveryAddress).toBe('Central Food Bank Hub');

      // Conflict: second pickup for same food request must fail with 409
      await expect(createPickup({
        foodRequestId: food.rows[0].id,
        windowStartsAt: start.toISOString(),
        windowEndsAt: end.toISOString(),
        deliveryAddress: 'Another Hub',
      }, user.rows[0].id, defaultFoodPort, client)).rejects.toMatchObject({
        status: 409,
        code: 'RESOURCE_CONFLICT',
      });
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });

  it('transitions assignment status, mirrors pickup, and releases reservations upon terminal DELIVER', async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const adminUser = (await client.query<{ id: string }>(
        'INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, $2) RETURNING id',
        [randomUUID(), 'ADMIN']
      )).rows[0];

      const volUser = (await client.query<{ id: string }>(
        'INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, $2) RETURNING id',
        [randomUUID(), 'VOLUNTEER']
      )).rows[0];

      const person = (await client.query<{ id: string }>(
        "INSERT INTO app.people(app_user_id, name, phone_e164) VALUES ($1, 'Test Vol', '+919123456789') RETURNING id",
        [volUser.id]
      )).rows[0];

      const vol = (await client.query<{ id: string }>(
        "INSERT INTO app.volunteers(person_id, registration_code, status) VALUES ($1, 'VOL-999', 'ACTIVE') RETURNING id",
        [person.id]
      )).rows[0];

      const driverPerson = (await client.query<{ id: string }>(
        "INSERT INTO app.people(name, phone_e164) VALUES ('Test Driver', '+919123456790') RETURNING id"
      )).rows[0];

      const driver = (await client.query<{ id: string }>(
        "INSERT INTO app.drivers(person_id, licence_number, licence_expires_on, status, driver_type) VALUES ($1, 'DL-999', '2030-01-01', 'ACTIVE', 'EMPLOYEE') RETURNING id",
        [driverPerson.id]
      )).rows[0];

      const vehicle = (await client.query<{ id: string }>(
        "INSERT INTO app.vehicles(registration_number, kind, capacity_kg, status) VALUES ('KA01AB1234', 'Van', 500, 'ACTIVE') RETURNING id"
      )).rows[0];
      await client.query('UPDATE app.vehicles SET assigned_driver_id = $2 WHERE id = $1', [vehicle.id, driver.id]);
      const vessel = (await client.query<{ id: string }>(
        "INSERT INTO app.vessels(vessel_code, name, vessel_type, material, capacity_value, capacity_unit, temperature_suitability) VALUES ('INT-VES-1', 'Crate', 'CRATE', 'FOOD_GRADE_PLASTIC', 50, 'KG', 'AMBIENT') RETURNING id"
      )).rows[0];

      const donor = (await client.query<{ id: string }>(
        'INSERT INTO app.donors(app_user_id) VALUES ($1) RETURNING id',
        [adminUser.id]
      )).rows[0];

      const start = new Date(Date.now() + 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      // Volunteer availability
      await client.query(
        "INSERT INTO app.volunteer_availability(volunteer_id, starts_at, ends_at, state) VALUES ($1, $2, $3, 'AVAILABLE')",
        [vol.id, new Date(start.getTime() - 3600000), new Date(end.getTime() + 3600000)]
      );

      const food = (await client.query<{ id: string }>(`
        INSERT INTO app.food_requests(
          donor_id, source_name, source_type, pickup_address, prepared_at, ready_at,
          pickup_deadline, donor_safety_declaration, safety_review, safety_reviewed_by,
          safety_reviewed_at, contact_name, contact_phone_e164
        )
        VALUES ($1, 'Test Banquet', 'Event', 'Test Street, Bengaluru', now(), now(), $2, true, 'APPROVED', $3, now(), 'Coordinator', '+919123456780')
        RETURNING id
      `, [donor.id, end, adminUser.id])).rows[0];

      const pickup = await createPickup({
        foodRequestId: food.id,
        windowStartsAt: start.toISOString(),
        windowEndsAt: end.toISOString(),
        deliveryAddress: 'Central Food Bank Hub',
      }, adminUser.id, defaultFoodPort, client);

      const assignmentResult = await createAssignment(
        pickup.id,
        {
          teamId: null,
          volunteerIds: [vol.id],
          driverId: driver.id,
          vehicleId: vehicle.id,
          vesselIds: [vessel.id],
          role: 'Pickup Crew',
          windowStartsAt: start.toISOString(),
          windowEndsAt: end.toISOString(),
          containers: [{ containerType: 'insulated crate', count: 2, estimatedLoadKg: 20 }],
        },
        'int-key-1',
        adminUser.id,
        {},
        client
      );

      const assignment = assignmentResult.assignment;
      expect(assignment.status).toBe('PENDING');

      // 1. Volunteer ACCEPT
      const accepted = await transitionAssignmentStatus(
        {
          assignmentId: assignment.id,
          input: { action: 'ACCEPT', expectedVersion: 0 },
          actor: { id: volUser.id, authUserId: randomUUID(), role: 'VOLUNTEER' },
        },
        client
      );
      expect(accepted.status).toBe('ACCEPTED');
      expect(accepted.driverAcceptance).toBe('PENDING');

      // The trip cannot start until the NGO driver has accepted (migration 013). This fixture driver
      // has no app sign-in, so record their acceptance directly (no version change).
      await expect(transitionAssignmentStatus({
        assignmentId: assignment.id,
        input: { action: 'START', expectedVersion: 1 },
        actor: { id: volUser.id, authUserId: randomUUID(), role: 'VOLUNTEER' },
      }, client)).rejects.toMatchObject({ code: 'DRIVER_NOT_ACCEPTED' });
      await client.query("UPDATE app.assignments SET driver_acceptance = 'ACCEPTED', driver_responded_at = now() WHERE id = $1", [assignment.id]);

      // 2. Volunteer START
      const started = await transitionAssignmentStatus(
        {
          assignmentId: assignment.id,
          input: { action: 'START', expectedVersion: 1 },
          actor: { id: volUser.id, authUserId: randomUUID(), role: 'VOLUNTEER' },
        },
        client
      );
      expect(started.status).toBe('EN_ROUTE');

      // 3. Volunteer ARRIVE
      const arrived = await transitionAssignmentStatus(
        {
          assignmentId: assignment.id,
          input: { action: 'ARRIVE', expectedVersion: 2 },
          actor: { id: volUser.id, authUserId: randomUUID(), role: 'VOLUNTEER' },
        },
        client
      );
      expect(arrived.status).toBe('ARRIVED_AT_DONOR');

      // 4. Volunteer COLLECT
      const collected = await transitionAssignmentStatus(
        {
          assignmentId: assignment.id,
          input: { action: 'COLLECT', expectedVersion: 3 },
          actor: { id: volUser.id, authUserId: randomUUID(), role: 'VOLUNTEER' },
        },
        client
      );
      expect(collected.status).toBe('FOOD_COLLECTED');

      // 5. Admin DELIVER
      const delivered = await transitionAssignmentStatus(
        {
          assignmentId: assignment.id,
          input: { action: 'DELIVER', expectedVersion: 4 },
          actor: { id: adminUser.id, authUserId: randomUUID(), role: 'ADMIN' },
        },
        client
      );
      expect(delivered.status).toBe('DELIVERED');

      // Check reservations released
      const activeRes = await client.query(
        "SELECT count(*) FROM app.resource_reservations WHERE assignment_id = $1 AND state = 'ACTIVE'",
        [assignment.id]
      );
      expect(activeRes.rows[0].count).toBe('0');

      const releasedRes = await client.query(
        "SELECT count(*) FROM app.resource_reservations WHERE assignment_id = $1 AND state = 'RELEASED' AND released_at IS NOT NULL",
        [assignment.id]
      );
      expect(Number(releasedRes.rows[0].count)).toBeGreaterThan(0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });

  it('cancelForFoodRequest cancels pickup, active assignment, and releases reservations in transaction', async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const adminUser = (await client.query<{ id: string }>(
        'INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, $2) RETURNING id',
        [randomUUID(), 'ADMIN']
      )).rows[0];

      const volUser = (await client.query<{ id: string }>(
        'INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, $2) RETURNING id',
        [randomUUID(), 'VOLUNTEER']
      )).rows[0];

      const person = (await client.query<{ id: string }>(
        "INSERT INTO app.people(app_user_id, name, phone_e164) VALUES ($1, 'Test Vol 2', '+919123456791') RETURNING id",
        [volUser.id]
      )).rows[0];

      const vol = (await client.query<{ id: string }>(
        "INSERT INTO app.volunteers(person_id, registration_code, status) VALUES ($1, 'VOL-998', 'ACTIVE') RETURNING id",
        [person.id]
      )).rows[0];

      const driverPerson = (await client.query<{ id: string }>(
        "INSERT INTO app.people(name, phone_e164) VALUES ('Test Driver 2', '+919123456792') RETURNING id"
      )).rows[0];

      const driver = (await client.query<{ id: string }>(
        "INSERT INTO app.drivers(person_id, licence_number, licence_expires_on, status, driver_type) VALUES ($1, 'DL-998', '2030-01-01', 'ACTIVE', 'EMPLOYEE') RETURNING id",
        [driverPerson.id]
      )).rows[0];

      const vehicle = (await client.query<{ id: string }>(
        "INSERT INTO app.vehicles(registration_number, kind, capacity_kg, status) VALUES ('KA01AB5678', 'Van', 500, 'ACTIVE') RETURNING id"
      )).rows[0];
      await client.query('UPDATE app.vehicles SET assigned_driver_id = $2 WHERE id = $1', [vehicle.id, driver.id]);
      const vessel = (await client.query<{ id: string }>(
        "INSERT INTO app.vessels(vessel_code, name, vessel_type, material, capacity_value, capacity_unit, temperature_suitability) VALUES ('INT-VES-2', 'Crate', 'CRATE', 'FOOD_GRADE_PLASTIC', 50, 'KG', 'AMBIENT') RETURNING id"
      )).rows[0];

      const donor = (await client.query<{ id: string }>(
        'INSERT INTO app.donors(app_user_id) VALUES ($1) RETURNING id',
        [adminUser.id]
      )).rows[0];

      const start = new Date(Date.now() + 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      await client.query(
        "INSERT INTO app.volunteer_availability(volunteer_id, starts_at, ends_at, state) VALUES ($1, $2, $3, 'AVAILABLE')",
        [vol.id, new Date(start.getTime() - 3600000), new Date(end.getTime() + 3600000)]
      );

      const food = (await client.query<{ id: string }>(`
        INSERT INTO app.food_requests(
          donor_id, source_name, source_type, pickup_address, prepared_at, ready_at,
          pickup_deadline, donor_safety_declaration, safety_review, safety_reviewed_by,
          safety_reviewed_at, contact_name, contact_phone_e164
        )
        VALUES ($1, 'Test Banquet 2', 'Event', 'Test Street, Bengaluru', now(), now(), $2, true, 'APPROVED', $3, now(), 'Coordinator', '+919123456780')
        RETURNING id
      `, [donor.id, end, adminUser.id])).rows[0];

      const pickup = await createPickup({
        foodRequestId: food.id,
        windowStartsAt: start.toISOString(),
        windowEndsAt: end.toISOString(),
        deliveryAddress: 'Central Food Bank Hub',
      }, adminUser.id, defaultFoodPort, client);

      const assignmentResult = await createAssignment(
        pickup.id,
        {
          teamId: null,
          volunteerIds: [vol.id],
          driverId: driver.id,
          vehicleId: vehicle.id,
          vesselIds: [vessel.id],
          role: 'Pickup Crew',
          windowStartsAt: start.toISOString(),
          windowEndsAt: end.toISOString(),
          containers: [{ containerType: 'insulated crate', count: 2, estimatedLoadKg: 20 }],
        },
        'int-key-cancel-1',
        adminUser.id,
        {},
        client
      );

      const assignment = assignmentResult.assignment;

      // Cancel for food request
      const cancelledPickup = await cancelForFoodRequest(client, food.id);
      expect(cancelledPickup?.status).toBe('CANCELLED');

      const updatedAssignment = await client.query(
        'SELECT status FROM app.assignments WHERE id = $1',
        [assignment.id]
      );
      expect(updatedAssignment.rows[0].status).toBe('CANCELLED');

      const activeRes = await client.query(
        "SELECT count(*) FROM app.resource_reservations WHERE assignment_id = $1 AND state = 'ACTIVE'",
        [assignment.id]
      );
      expect(activeRes.rows[0].count).toBe('0');
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });
});
