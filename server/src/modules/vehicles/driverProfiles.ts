import type { PoolClient } from 'pg';
import { getPool } from '../../db/pool';

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

// Read-only view of a historical Volunteer-linked driver record for the Volunteer profile.
// Volunteers can no longer create or edit driver records: NGO employee drivers are registered
// only from Assign Driver (see employeeDrivers.ts), each with one fixed vehicle.
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
