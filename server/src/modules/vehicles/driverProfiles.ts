import type { PoolClient } from 'pg';
import { getPool } from '../../db/pool';
import { HttpError } from '../../middleware/errorHandler';

export type DriverDetailsInput = {
  licenceNumber: string;
  licenceExpiresOn: string;
  vehicleRegistrationNumber: string;
};

export type DriverDetails = DriverDetailsInput & {
  driverId: string;
  status: 'ACTIVE' | 'INACTIVE';
  additionalVehicleCount: number;
};

// The canonical person and driver rows are shared by Volunteer and Vehicle Details.
// The vehicle registration stays in app.vehicles; assigned_driver_id is its existing link.
export async function getDriverDetailsForPerson(personId: string, client?: PoolClient): Promise<DriverDetails | null> {
  const db = client ?? getPool();
  const result = await db.query<{
    id: string; licence_number: string; licence_expires_on: string;
    status: 'ACTIVE' | 'INACTIVE'; registration_number: string | null; vehicle_count: number;
  }>(
    `SELECT d.id, d.licence_number, d.licence_expires_on::text, d.status,
       (SELECT registration_number FROM app.vehicles WHERE assigned_driver_id = d.id
        ORDER BY registration_number LIMIT 1) AS registration_number,
       (SELECT count(*)::integer FROM app.vehicles WHERE assigned_driver_id = d.id) AS vehicle_count
     FROM app.drivers d WHERE d.person_id = $1`, [personId]
  );
  const row = result.rows[0];
  return row ? {
    driverId: row.id,
    licenceNumber: row.licence_number,
    licenceExpiresOn: row.licence_expires_on,
    vehicleRegistrationNumber: row.registration_number ?? '',
    status: row.status,
    additionalVehicleCount: Math.max(0, row.vehicle_count - 1),
  } : null;
}

export async function assertDriverDetailsAvailable(input: DriverDetailsInput): Promise<void> {
  const db = getPool();
  const vehicle = await db.query<{ id: string; assigned_driver_id: string | null }>(
    `SELECT id, assigned_driver_id FROM app.vehicles
     WHERE upper(trim(registration_number)) = upper($1)`, [input.vehicleRegistrationNumber]
  );
  if (!vehicle.rows.length) throw new HttpError(404, 'VEHICLE_NOT_FOUND', 'Register this vehicle in the fleet first.');
  if (vehicle.rows.length > 1) throw new HttpError(409, 'VEHICLE_REGISTRATION_AMBIGUOUS', 'Review duplicate vehicle registrations in Vehicle Details.');
  if (vehicle.rows[0].assigned_driver_id) {
    throw new HttpError(409, 'VEHICLE_DRIVER_CONFLICT', 'This vehicle already has a default driver.');
  }
  const licence = await db.query<{ id: string }>(
    'SELECT id FROM app.drivers WHERE upper(licence_number) = upper($1) LIMIT 1', [input.licenceNumber]
  );
  if (licence.rows.length) throw new HttpError(409, 'DRIVER_LICENCE_CONFLICT', 'This driving licence is already registered.');
}

export async function saveDriverDetailsForPerson(
  personId: string, input: DriverDetailsInput, status: 'ACTIVE' | 'INACTIVE', client: PoolClient
): Promise<void> {
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM app.drivers WHERE person_id = $1 FOR UPDATE', [personId]
  );
  const vehicle = await client.query<{ id: string; assigned_driver_id: string | null }>(
    `SELECT id, assigned_driver_id FROM app.vehicles
     WHERE upper(trim(registration_number)) = upper($1) FOR UPDATE`, [input.vehicleRegistrationNumber]
  );
  if (!vehicle.rows.length) throw new HttpError(404, 'VEHICLE_NOT_FOUND', 'Register this vehicle in the fleet first.');
  if (vehicle.rows.length > 1) throw new HttpError(409, 'VEHICLE_REGISTRATION_AMBIGUOUS', 'Review duplicate vehicle registrations in Vehicle Details.');
  const existingId = existing.rows[0]?.id;
  if (vehicle.rows[0].assigned_driver_id && vehicle.rows[0].assigned_driver_id !== existingId) {
    throw new HttpError(409, 'VEHICLE_DRIVER_CONFLICT', 'This vehicle already has a default driver.');
  }
  const duplicateLicence = await client.query<{ id: string }>(
    `SELECT id FROM app.drivers WHERE upper(licence_number) = upper($1)
     AND person_id <> $2 LIMIT 1 FOR UPDATE`, [input.licenceNumber, personId]
  );
  if (duplicateLicence.rows.length) {
    throw new HttpError(409, 'DRIVER_LICENCE_CONFLICT', 'This driving licence is already registered.');
  }
  if (existingId && vehicle.rows[0].assigned_driver_id !== existingId) {
    const linked = await client.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM app.vehicles WHERE assigned_driver_id = $1', [existingId]
    );
    if (linked.rows[0].count > 1) {
      throw new HttpError(409, 'MULTIPLE_DRIVER_VEHICLES', 'Manage this driver’s multiple vehicle links in Vehicle Details.');
    }
  }
  const driver = existingId
    ? await client.query<{ id: string }>(
      `UPDATE app.drivers SET licence_number = $2, licence_expires_on = $3, status = $4
       WHERE id = $1 RETURNING id`, [existingId, input.licenceNumber, input.licenceExpiresOn, status]
    )
    : await client.query<{ id: string }>(
      `INSERT INTO app.drivers(person_id, licence_number, licence_expires_on, status)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [personId, input.licenceNumber, input.licenceExpiresOn, status]
    );
  const driverId = driver.rows[0].id;
  if (vehicle.rows[0].assigned_driver_id !== driverId) {
    await client.query(
      'UPDATE app.vehicles SET assigned_driver_id = NULL WHERE assigned_driver_id = $1 AND id <> $2',
      [driverId, vehicle.rows[0].id]
    );
    await client.query('UPDATE app.vehicles SET assigned_driver_id = $2 WHERE id = $1', [vehicle.rows[0].id, driverId]);
  }
}

export async function setDriverStatusForPerson(
  personId: string, status: 'ACTIVE' | 'INACTIVE', client: PoolClient
): Promise<void> {
  const result = await client.query('UPDATE app.drivers SET status = $2 WHERE person_id = $1', [personId, status]);
  if (!result.rowCount) throw new HttpError(404, 'DRIVER_NOT_FOUND', 'Driver details were not found.');
}
