import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { listVehicleAssignments } from '../src/modules/pickups/vehicleAssignments';

const testDatabaseName = process.env.TEST_DATABASE_URL ? decodeURIComponent(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1)) : '';
const enabled = testDatabaseName.endsWith('_test') && process.env.ALLOW_TEST_DATABASE_MUTATION === 'true';

async function expectConstraint(client: PoolClient, sql: string, values: unknown[]) {
  await client.query('SAVEPOINT expected_conflict');
  await expect(client.query(sql, values)).rejects.toMatchObject({ code: '23514' });
  await client.query('ROLLBACK TO SAVEPOINT expected_conflict');
  await client.query('RELEASE SAVEPOINT expected_conflict');
}

describe.skipIf(!enabled)('Vehicle module boundaries', () => {
  it('rejects maintenance conflicts and derives the assigned roster from Pickup records', async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query<{ id: string }>('INSERT INTO app.app_users(auth_user_id) VALUES ($1) RETURNING id', [randomUUID()]);
      const person = await client.query<{ id: string }>("INSERT INTO app.people(name) VALUES ('Vehicle boundary test person') RETURNING id");
      const volunteer = await client.query<{ id: string }>('INSERT INTO app.volunteers(person_id, registration_code) VALUES ($1, $2) RETURNING id', [person.rows[0].id, `TEST-${randomUUID()}`]);
      const driver = await client.query<{ id: string }>('INSERT INTO app.drivers(person_id, licence_number, licence_expires_on) VALUES ($1, $2, $3) RETURNING id', [person.rows[0].id, `LIC-${randomUUID()}`, '2035-01-01']);
      const vehicle = await client.query<{ id: string }>('INSERT INTO app.vehicles(registration_number, kind, capacity_kg, size_category, indicative_max_vessels) VALUES ($1, $2, $3, $4, $5) RETURNING id', [`REG-${randomUUID()}`, 'Van', 200, 'MEDIUM', 12]);
      const donor = await client.query<{ id: string }>('INSERT INTO app.donors(app_user_id) VALUES ($1) RETURNING id', [user.rows[0].id]);
      const start = new Date(Date.now() + 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      const food = await client.query<{ id: string }>(`INSERT INTO app.food_requests(donor_id, source_name, source_type, pickup_address, prepared_at, ready_at, pickup_deadline, donor_safety_declaration, contact_name, contact_phone_e164)
        VALUES ($1, 'Test', 'Event', 'Test address', now(), now(), $2, true, 'Contact', '+919000000000') RETURNING id`, [donor.rows[0].id, end]);
      const pickup = await client.query<{ id: string }>('INSERT INTO app.pickups(food_request_id, window_starts_at, window_ends_at, delivery_address) VALUES ($1, $2, $3, $4) RETURNING id', [food.rows[0].id, start, end, 'Hub']);
      const assignment = await client.query<{ id: string }>('INSERT INTO app.assignments(pickup_id, driver_id, vehicle_id, role) VALUES ($1, $2, $3, $4) RETURNING id', [pickup.rows[0].id, driver.rows[0].id, vehicle.rows[0].id, 'Pickup']);
      await client.query('INSERT INTO app.assignment_members(assignment_id, volunteer_id) VALUES ($1, $2)', [assignment.rows[0].id, volunteer.rows[0].id]);

      const reserve = 'INSERT INTO app.resource_reservations(assignment_id, vehicle_id, starts_at, ends_at) VALUES ($1, $2, $3, $4)';
      const values = [assignment.rows[0].id, vehicle.rows[0].id, start, end];
      await client.query("UPDATE app.vehicles SET status = 'MAINTENANCE' WHERE id = $1", [vehicle.rows[0].id]);
      await expectConstraint(client, reserve, values);
      await client.query("UPDATE app.vehicles SET status = 'ACTIVE' WHERE id = $1", [vehicle.rows[0].id]);
      await client.query('INSERT INTO app.vehicle_unavailability(vehicle_id, starts_at, ends_at, reason) VALUES ($1, $2, $3, $4)', [vehicle.rows[0].id, start, end, 'Service']);
      await expectConstraint(client, reserve, values);
      await client.query('DELETE FROM app.vehicle_unavailability WHERE vehicle_id = $1', [vehicle.rows[0].id]);
      await client.query(reserve, values);
      await expectConstraint(client, "UPDATE app.vehicles SET status = 'MAINTENANCE' WHERE id = $1", [vehicle.rows[0].id]);
      await expectConstraint(client, 'INSERT INTO app.vehicle_unavailability(vehicle_id, starts_at, ends_at, reason) VALUES ($1, $2, $3, $4)', [vehicle.rows[0].id, start, end, 'Service']);

      const roster = await listVehicleAssignments(vehicle.rows[0].id, client);
      expect(roster.items).toMatchObject([{ assignmentId: assignment.rows[0].id, driverId: driver.rows[0].id, volunteerIds: [volunteer.rows[0].id] }]);
      await client.query("UPDATE app.assignments SET status = 'DELIVERED' WHERE id = $1", [assignment.rows[0].id]);
      expect((await listVehicleAssignments(vehicle.rows[0].id, client)).items).toEqual([]);

      // Direct fixture updates must mirror the dispatch transition's reservation release.
      await client.query("UPDATE app.resource_reservations SET state = 'RELEASED', released_at = now() WHERE assignment_id = $1", [assignment.rows[0].id]);

      // Test repository readiness evaluation against live DB
      const { findVehicleById, updateVehicle, createMaintenanceRecord, getFleetSummary, deleteVehicle } = await import('../src/modules/vehicles/repository');
      const vehAfterDelivered = await findVehicleById(vehicle.rows[0].id, client);
      expect(vehAfterDelivered?.readiness.isReady).toBe(true);
      expect(vehAfterDelivered?.readiness.dispatchStatus).toBe('READY');

      // Test UNSAFE maintenance transition
      await createMaintenanceRecord(
        vehicle.rows[0].id,
        {
          servicedOn: '2026-10-23',
          condition: 'UNSAFE',
          summary: 'Critical brake failure',
        },
        user.rows[0].id,
        client
      );

      const vehAfterUnsafe = await findVehicleById(vehicle.rows[0].id, client);
      expect(vehAfterUnsafe?.status).toBe('MAINTENANCE');
      expect(vehAfterUnsafe?.readiness.isReady).toBe(false);
      expect(vehAfterUnsafe?.readiness.dispatchStatus).toBe('MAINTENANCE_RESTRICTED');
      expect(vehAfterUnsafe?.readiness.reasons.some(r => r.code === 'MAINTENANCE_CONDITION_UNSAFE')).toBe(true);

      const summary = await getFleetSummary(client);
      expect(summary.total).toBeGreaterThanOrEqual(1);
      expect(summary.maintenance).toBeGreaterThanOrEqual(1);

      // Deleting a vehicle referenced by assignments/maintenance must fail with 409 RESOURCE_CONFLICT (preserving historical data)
      await client.query('SAVEPOINT expected_delete_conflict');
      await expect(deleteVehicle(vehicle.rows[0].id, client)).rejects.toMatchObject({
        status: 409,
        code: 'RESOURCE_CONFLICT',
      });

      // Recover the transaction after the expected foreign-key violation.
      await client.query('ROLLBACK TO SAVEPOINT expected_delete_conflict');
      await client.query('RELEASE SAVEPOINT expected_delete_conflict');

      // An unreferenced vehicle can be deleted cleanly
      const tempVeh = await client.query(
        "INSERT INTO app.vehicles (registration_number, kind, capacity_kg, status) VALUES ('KA-99-TEMP-0001', 'Van', 350, 'ACTIVE') RETURNING id"
      );
      const deleted = await deleteVehicle(tempVeh.rows[0].id, client);
      expect(deleted).toBe(true);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });
});
