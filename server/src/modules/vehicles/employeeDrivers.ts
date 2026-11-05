import type { PoolClient } from 'pg';
import type {
  CreateEmployeeDriver,
  DriverVehicleOption,
  EmployeeDriver,
  UpdateEmployeeDriver,
} from '@aaharaconnect/shared';
import { getPool, withTransaction } from '../../db/pool';
import { HttpError } from '../../middleware/errorHandler';

// Module 5 owns the canonical driver registry. NGO employee drivers are app.people rows without a
// login or Volunteer record, plus an EMPLOYEE app.drivers row. Their single fixed vehicle is the
// existing app.vehicles.assigned_driver_id link, which migration 012 makes one-to-one and immutable.

type DriverRow = {
  id: string;
  person_id: string;
  driver_type: 'LEGACY_VOLUNTEER' | 'EMPLOYEE';
  name: string;
  phone_e164: string | null;
  employee_code: string | null;
  licence_number: string;
  licence_expires_on: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: Date | null;
  updated_at: Date | null;
  vehicle_id: string | null;
  registration_number: string | null;
  kind: string | null;
  capacity_kg: string | number | null;
  vehicle_status: 'ACTIVE' | 'MAINTENANCE' | 'RETIRED' | null;
  size_category: 'SMALL' | 'MEDIUM' | 'LARGE' | null;
  indicative_max_vessels: number | null;
};

const DRIVER_SELECT = `
  SELECT d.id, d.person_id, d.driver_type, p.name, p.phone_e164, d.employee_code,
         d.licence_number, d.licence_expires_on::text AS licence_expires_on, d.status,
         d.created_at, d.updated_at,
         v.id AS vehicle_id, v.registration_number, v.kind, v.capacity_kg, v.status AS vehicle_status,
         v.size_category, v.indicative_max_vessels
  FROM app.drivers d
  JOIN app.people p ON p.id = d.person_id
  LEFT JOIN app.vehicles v ON v.assigned_driver_id = d.id`;

export function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function toDriver(row: DriverRow, now = new Date()): EmployeeDriver {
  return {
    driverId: row.id,
    personId: row.person_id,
    driverType: row.driver_type,
    name: row.name,
    phone: row.phone_e164 ?? '',
    employeeCode: row.employee_code,
    licenceNumber: row.licence_number,
    licenceExpiresOn: row.licence_expires_on.slice(0, 10),
    licenceExpired: row.licence_expires_on.slice(0, 10) < todayIsoDate(now),
    status: row.status,
    vehicle: row.vehicle_id ? {
      id: row.vehicle_id,
      registrationNumber: row.registration_number ?? '',
      kind: row.kind ?? '',
      capacityKg: Number(row.capacity_kg),
      status: row.vehicle_status ?? 'ACTIVE',
      sizeCategory: row.size_category,
      indicativeMaxVessels: row.indicative_max_vessels,
    } : null,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

export function mapDriverWriteError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  if (error && typeof error === 'object' && 'code' in error) {
    const pgError = error as { code: string; constraint?: string; message?: string };
    if (pgError.code === '23505') {
      const constraint = pgError.constraint ?? '';
      if (constraint.includes('licence')) throw new HttpError(409, 'DRIVER_LICENCE_CONFLICT', 'This driving licence is already registered.');
      if (constraint.includes('phone')) throw new HttpError(409, 'PHONE_CONFLICT', 'This phone number already belongs to another person in the system.');
      if (constraint.includes('employee_code')) throw new HttpError(409, 'EMPLOYEE_CODE_CONFLICT', 'This employee ID is already registered.');
      if (constraint.includes('vehicles_one_vehicle_per_driver')) throw new HttpError(409, 'DRIVER_ALREADY_HAS_VEHICLE', 'This driver is already linked to a vehicle.');
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'A driver record conflicts with an existing record.');
    }
    if (pgError.code === '23514') {
      throw new HttpError(409, 'FIXED_VEHICLE_IMMUTABLE', pgError.message || 'The fixed driver-to-vehicle link cannot be changed.');
    }
  }
  throw error;
}

export async function listDriversWithVehicles(client?: PoolClient): Promise<EmployeeDriver[]> {
  const db = client ?? getPool();
  const result = await db.query<DriverRow>(`${DRIVER_SELECT} ORDER BY (d.driver_type = 'EMPLOYEE') DESC, p.name ASC, d.id ASC`);
  return result.rows.map(row => toDriver(row));
}

export async function findDriverWithVehicle(driverId: string, client?: PoolClient): Promise<EmployeeDriver | null> {
  const db = client ?? getPool();
  const result = await db.query<DriverRow>(`${DRIVER_SELECT} WHERE d.id = $1`, [driverId]);
  return result.rows[0] ? toDriver(result.rows[0]) : null;
}

export async function listVehicleOptionsForNewDriver(client?: PoolClient): Promise<DriverVehicleOption[]> {
  const db = client ?? getPool();
  const result = await db.query<{
    id: string; registration_number: string; kind: string; capacity_kg: string | number;
    status: 'ACTIVE' | 'MAINTENANCE' | 'RETIRED'; size_category: 'SMALL' | 'MEDIUM' | 'LARGE' | null;
    indicative_max_vessels: number | null; driver_name: string | null;
  }>(
    `SELECT v.id, v.registration_number, v.kind, v.capacity_kg, v.status, v.size_category,
            v.indicative_max_vessels, p.name AS driver_name
     FROM app.vehicles v
     LEFT JOIN app.drivers d ON d.id = v.assigned_driver_id
     LEFT JOIN app.people p ON p.id = d.person_id
     ORDER BY (v.assigned_driver_id IS NULL AND v.status <> 'RETIRED') DESC, v.registration_number ASC`
  );
  return result.rows.map(row => {
    const reason = row.driver_name
      ? `Already linked to driver ${row.driver_name}.`
      : row.status === 'RETIRED' ? 'Vehicle is retired.' : null;
    return {
      id: row.id,
      registrationNumber: row.registration_number,
      kind: row.kind,
      capacityKg: Number(row.capacity_kg),
      status: row.status,
      sizeCategory: row.size_category,
      indicativeMaxVessels: row.indicative_max_vessels,
      eligible: reason === null,
      reason,
    };
  });
}

async function assertLicenceAvailable(licenceNumber: string, exceptDriverId: string | null, client: PoolClient) {
  const duplicate = await client.query<{ id: string }>(
    `SELECT id FROM app.drivers WHERE upper(trim(licence_number)) = upper(trim($1))
     AND ($2::uuid IS NULL OR id <> $2::uuid) LIMIT 1`,
    [licenceNumber, exceptDriverId]
  );
  if (duplicate.rows.length) throw new HttpError(409, 'DRIVER_LICENCE_CONFLICT', 'This driving licence is already registered.');
}

async function assertEmployeeCodeAvailable(code: string | null | undefined, exceptDriverId: string | null, client: PoolClient) {
  if (!code) return;
  const duplicate = await client.query<{ id: string }>(
    `SELECT id FROM app.drivers WHERE upper(trim(employee_code)) = upper(trim($1))
     AND ($2::uuid IS NULL OR id <> $2::uuid) LIMIT 1`,
    [code, exceptDriverId]
  );
  if (duplicate.rows.length) throw new HttpError(409, 'EMPLOYEE_CODE_CONFLICT', 'This employee ID is already registered.');
}

async function assertPhoneAvailable(phone: string, exceptPersonId: string | null, client: PoolClient) {
  const duplicate = await client.query<{ id: string }>(
    `SELECT id FROM app.people WHERE phone_e164 = $1 AND ($2::uuid IS NULL OR id <> $2::uuid) LIMIT 1`,
    [phone, exceptPersonId]
  );
  if (duplicate.rows.length) throw new HttpError(409, 'PHONE_CONFLICT', 'This phone number already belongs to another person in the system.');
}

export async function createEmployeeDriver(
  input: CreateEmployeeDriver, actorUserId: string, client?: PoolClient
): Promise<EmployeeDriver> {
  if (input.licenceExpiresOn < todayIsoDate()) {
    throw new HttpError(400, 'LICENCE_EXPIRED', 'The driving licence has expired. Enter a current licence.');
  }
  const run = async (tx: PoolClient): Promise<EmployeeDriver> => {
    try {
      const vehicle = await tx.query<{ id: string; status: string; assigned_driver_id: string | null }>(
        'SELECT id, status, assigned_driver_id FROM app.vehicles WHERE id = $1 FOR UPDATE', [input.vehicleId]
      );
      if (!vehicle.rows.length) {
        throw new HttpError(404, 'VEHICLE_NOT_FOUND', 'Select a vehicle registered in Vehicle Details.');
      }
      if (vehicle.rows[0].assigned_driver_id) {
        throw new HttpError(409, 'VEHICLE_ALREADY_HAS_DRIVER', 'This vehicle already has a fixed driver. Choose an unassigned vehicle.');
      }
      if (vehicle.rows[0].status === 'RETIRED') {
        throw new HttpError(409, 'VEHICLE_RETIRED', 'A retired vehicle cannot be assigned to a driver.');
      }
      await assertLicenceAvailable(input.licenceNumber, null, tx);
      await assertEmployeeCodeAvailable(input.employeeCode, null, tx);
      await assertPhoneAvailable(input.phoneE164, null, tx);

      const person = await tx.query<{ id: string }>(
        'INSERT INTO app.people(name, phone_e164) VALUES ($1, $2) RETURNING id',
        [input.name, input.phoneE164]
      );
      const driver = await tx.query<{ id: string }>(
        `INSERT INTO app.drivers(person_id, licence_number, licence_expires_on, status, driver_type, employee_code, created_by)
         VALUES ($1, $2, $3, 'ACTIVE', 'EMPLOYEE', $4, $5) RETURNING id`,
        [person.rows[0].id, input.licenceNumber, input.licenceExpiresOn, input.employeeCode ?? null, actorUserId]
      );
      const linked = await tx.query(
        'UPDATE app.vehicles SET assigned_driver_id = $2 WHERE id = $1 AND assigned_driver_id IS NULL',
        [input.vehicleId, driver.rows[0].id]
      );
      if (linked.rowCount !== 1) {
        throw new HttpError(409, 'VEHICLE_ALREADY_HAS_DRIVER', 'This vehicle already has a fixed driver. Choose an unassigned vehicle.');
      }
      // Run the deferred "employee driver must have a vehicle" check now so failures map cleanly.
      await tx.query('SET CONSTRAINTS app.employee_driver_requires_vehicle IMMEDIATE');
      const created = await findDriverWithVehicle(driver.rows[0].id, tx);
      if (!created) throw new HttpError(500, 'INTERNAL_ERROR', 'Driver was not found after creation.');
      return created;
    } catch (error) {
      mapDriverWriteError(error);
    }
  };
  return client ? run(client) : withTransaction(run);
}

export async function updateEmployeeDriver(
  driverId: string, input: UpdateEmployeeDriver, client?: PoolClient
): Promise<EmployeeDriver> {
  const run = async (tx: PoolClient): Promise<EmployeeDriver> => {
    try {
      const current = await tx.query<{
        id: string; person_id: string; driver_type: string; status: 'ACTIVE' | 'INACTIVE';
        licence_expires_on: string; updated_at: Date;
      }>(
        `SELECT id, person_id, driver_type, status, licence_expires_on::text AS licence_expires_on, updated_at
         FROM app.drivers WHERE id = $1 FOR UPDATE`, [driverId]
      );
      const row = current.rows[0];
      if (!row) throw new HttpError(404, 'DRIVER_NOT_FOUND', 'Driver not found.');
      if (row.driver_type !== 'EMPLOYEE') {
        throw new HttpError(409, 'LEGACY_DRIVER_READ_ONLY', 'This historical Volunteer-linked driver record is read-only. Register NGO employee drivers from Assign Driver.');
      }
      if (input.expectedUpdatedAt && new Date(input.expectedUpdatedAt).getTime() !== row.updated_at.getTime()) {
        throw new HttpError(409, 'VERSION_CONFLICT', 'This driver was changed by someone else. Reload and try again.');
      }
      const nextStatus = input.status ?? row.status;
      const nextExpiry = input.licenceExpiresOn ?? row.licence_expires_on.slice(0, 10);
      if (nextStatus === 'ACTIVE' && nextExpiry < todayIsoDate()) {
        throw new HttpError(400, 'LICENCE_EXPIRED', 'An active driver needs a current driving licence. Update the expiry date or mark the driver inactive.');
      }
      if (input.status === 'INACTIVE' && row.status === 'ACTIVE') {
        const upcoming = await tx.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM app.resource_reservations
           WHERE person_id = $1 AND state = 'ACTIVE' AND ends_at > now()`, [row.person_id]
        );
        if (upcoming.rows[0].count > 0) {
          throw new HttpError(409, 'DRIVER_HAS_UPCOMING_ASSIGNMENTS', 'This driver has upcoming pickup assignments. Complete or cancel them before marking the driver inactive.');
        }
      }
      if (input.licenceNumber) await assertLicenceAvailable(input.licenceNumber, driverId, tx);
      if (input.employeeCode) await assertEmployeeCodeAvailable(input.employeeCode, driverId, tx);
      if (input.phoneE164) await assertPhoneAvailable(input.phoneE164, row.person_id, tx);

      if (input.name !== undefined || input.phoneE164 !== undefined) {
        await tx.query(
          `UPDATE app.people SET name = COALESCE($2, name), phone_e164 = COALESCE($3, phone_e164) WHERE id = $1`,
          [row.person_id, input.name ?? null, input.phoneE164 ?? null]
        );
      }
      await tx.query(
        `UPDATE app.drivers SET
           licence_number = COALESCE($2, licence_number),
           licence_expires_on = COALESCE($3::date, licence_expires_on),
           employee_code = CASE WHEN $4::boolean THEN $5 ELSE employee_code END,
           status = $6
         WHERE id = $1`,
        [driverId, input.licenceNumber ?? null, input.licenceExpiresOn ?? null,
          input.employeeCode !== undefined, input.employeeCode ?? null, nextStatus]
      );
      const updated = await findDriverWithVehicle(driverId, tx);
      if (!updated) throw new HttpError(404, 'DRIVER_NOT_FOUND', 'Driver not found.');
      return updated;
    } catch (error) {
      mapDriverWriteError(error);
    }
  };
  return client ? run(client) : withTransaction(run);
}
