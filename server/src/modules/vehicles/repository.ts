import type { PoolClient } from 'pg';
import { getPool } from '../../db/pool';
import { HttpError } from '../../middleware/errorHandler';
import type {
  CreateVehicle,
  CreateVehicleMaintenanceRecord,
  FleetSummary,
  ListVehiclesQuery,
  UpdateVehicle,
} from '@aaharaconnect/shared';
import { evaluateVehicleReadiness } from './readiness';

export function handleVehicleDbError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  if (error && typeof error === 'object' && 'code' in error) {
    const pgError = error as { code: string; message?: string; detail?: string };
    if (pgError.code === '23505') {
      throw new HttpError(
        409,
        'RESOURCE_CONFLICT',
        pgError.detail || 'A record with this unique identifier or registration number already exists.'
      );
    }
    if (pgError.code === '23503') {
      throw new HttpError(
        409,
        'RESOURCE_CONFLICT',
        'Cannot delete vehicle: historical assignments, pickups, or logistics records reference this vehicle. Retire the vehicle instead.'
      );
    }
    if (pgError.code === '23514') {
      const msg = pgError.message || '';
      if (msg.includes('Release active vehicle reservations before changing status')) {
        throw new HttpError(
          409,
          'RESOURCE_CONFLICT',
          'Cannot change vehicle status: vehicle has future active reservations that must be released first.'
        );
      }
      if (msg.includes('Vehicle has an active reservation during downtime')) {
        throw new HttpError(
          409,
          'RESOURCE_CONFLICT',
          'Cannot schedule vehicle downtime during an active reservation window.'
        );
      }
      if (msg.includes('next_service_due_on')) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Next service due date must be on or after the serviced date.'
        );
      }
      throw new HttpError(
        409,
        'RESOURCE_CONFLICT',
        pgError.detail || msg || 'Operation violates a database integrity constraint.'
      );
    }
  }
  throw error;
}

export interface VehicleDbRow {
  id: string;
  registration_number: string;
  kind: string;
  capacity_kg: string | number;
  status: 'ACTIVE' | 'MAINTENANCE' | 'RETIRED';
  size_category: 'SMALL' | 'MEDIUM' | 'LARGE' | null;
  indicative_max_vessels: number | null;
  created_at: Date;
  has_active_downtime?: boolean;
  curr_assignment_id?: string | null;
  curr_pickup_id?: string | null;
  curr_assignment_status?: string | null;
  curr_window_starts_at?: Date | null;
  curr_window_ends_at?: Date | null;
  curr_driver_id?: string | null;
  curr_driver_name?: string | null;
  curr_driver_phone?: string | null;
  curr_driver_licence?: string | null;
  latest_serviced_on?: Date | string | null;
  latest_condition?: 'GOOD' | 'NEEDS_SERVICE' | 'UNSAFE' | null;
  latest_summary?: string | null;
  latest_next_service_due_on?: Date | string | null;
}

export function encodeVehicleCursor(row: { created_at: Date; id: string }): string {
  return Buffer.from(`${row.created_at.toISOString()}|${row.id}`).toString('base64url');
}

export function decodeVehicleCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const [iso, id] = raw.split('|');
    const createdAt = new Date(iso);
    if (isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function mapVehicleRow(row: VehicleDbRow) {
  const hasActiveDowntime = Boolean(row.has_active_downtime);
  const hasActiveAssignment = Boolean(row.curr_assignment_id);
  const nextServiceDueOn = row.latest_next_service_due_on
    ? typeof row.latest_next_service_due_on === 'string'
      ? row.latest_next_service_due_on.slice(0, 10)
      : row.latest_next_service_due_on.toISOString().slice(0, 10)
    : null;
  const lastServicedOn = row.latest_serviced_on
    ? typeof row.latest_serviced_on === 'string'
      ? row.latest_serviced_on.slice(0, 10)
      : row.latest_serviced_on.toISOString().slice(0, 10)
    : null;

  const readiness = evaluateVehicleReadiness({
    status: row.status,
    hasActiveDowntime,
    hasActiveAssignment,
    latestCondition: row.latest_condition ?? null,
    nextServiceDueOn,
  });

  return {
    id: row.id,
    registrationNumber: row.registration_number,
    kind: row.kind,
    capacityKg: Number(row.capacity_kg),
    status: row.status,
    sizeCategory: row.size_category,
    indicativeMaxVessels: row.indicative_max_vessels,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    readiness,
    currentDriver: row.curr_driver_id
      ? {
          driverId: row.curr_driver_id,
          name: row.curr_driver_name ?? 'Assigned Driver',
          phone: row.curr_driver_phone ?? null,
          licenceNumber: row.curr_driver_licence ?? '',
        }
      : null,
    currentAssignment: row.curr_assignment_id
      ? {
          assignmentId: row.curr_assignment_id,
          pickupId: row.curr_pickup_id!,
          status: row.curr_assignment_status!,
          windowStartsAt: row.curr_window_starts_at instanceof Date ? row.curr_window_starts_at.toISOString() : String(row.curr_window_starts_at),
          windowEndsAt: row.curr_window_ends_at instanceof Date ? row.curr_window_ends_at.toISOString() : String(row.curr_window_ends_at),
        }
      : null,
    latestMaintenance: row.latest_serviced_on
      ? {
          servicedOn: lastServicedOn!,
          condition: row.latest_condition!,
          summary: row.latest_summary ?? '',
          nextServiceDueOn,
        }
      : null,
  };
}

const VEHICLE_SELECT_FRAGMENT = `
  SELECT
    v.id,
    v.registration_number,
    v.kind,
    v.capacity_kg,
    v.status,
    v.size_category,
    v.indicative_max_vessels,
    v.created_at,
    COALESCE(downtime.has_active_downtime, false) AS has_active_downtime,
    curr_assign.assignment_id AS curr_assignment_id,
    curr_assign.pickup_id AS curr_pickup_id,
    curr_assign.assignment_status AS curr_assignment_status,
    curr_assign.window_starts_at AS curr_window_starts_at,
    COALESCE(curr_assign.driver_id, ad.id) AS curr_driver_id,
    COALESCE(curr_assign.driver_name, adp.name) AS curr_driver_name,
    COALESCE(curr_assign.driver_phone, adp.phone_e164) AS curr_driver_phone,
    COALESCE(curr_assign.driver_licence, ad.licence_number) AS curr_driver_licence,
    latest_maint.serviced_on AS latest_serviced_on,
    latest_maint.condition AS latest_condition,
    latest_maint.summary AS latest_summary,
    latest_maint.next_service_due_on AS latest_next_service_due_on
  FROM app.vehicles v
  LEFT JOIN app.drivers ad ON ad.id = v.assigned_driver_id
  LEFT JOIN app.people adp ON adp.id = ad.person_id
  LEFT JOIN LATERAL (
    SELECT
      a.id AS assignment_id,
      a.pickup_id,
      a.status AS assignment_status,
      p.window_starts_at,
      p.window_ends_at,
      d.id AS driver_id,
      pe.name AS driver_name,
      pe.phone_e164 AS driver_phone,
      d.licence_number AS driver_licence
    FROM app.assignments a
    JOIN app.pickups p ON p.id = a.pickup_id
    LEFT JOIN app.drivers d ON d.id = a.driver_id
    LEFT JOIN app.people pe ON pe.id = d.person_id
    WHERE a.vehicle_id = v.id
      AND a.status NOT IN ('REJECTED', 'CANCELLED', 'FAILED', 'DELIVERED')
      AND p.status NOT IN ('CANCELLED', 'FAILED', 'DELIVERED')
    ORDER BY p.window_starts_at ASC
    LIMIT 1
  ) curr_assign ON true
  LEFT JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1 FROM app.vehicle_unavailability vu
      WHERE vu.vehicle_id = v.id
        AND vu.starts_at <= now()
        AND vu.ends_at > now()
    ) AS has_active_downtime
  ) downtime ON true
  LEFT JOIN LATERAL (
    SELECT
      vmr.serviced_on,
      vmr.condition,
      vmr.summary,
      vmr.next_service_due_on
    FROM app.vehicle_maintenance_records vmr
    WHERE vmr.vehicle_id = v.id
    ORDER BY vmr.serviced_on DESC, vmr.created_at DESC
    LIMIT 1
  ) latest_maint ON true
`;

export async function listVehicles(
  params: ListVehiclesQuery,
  client?: PoolClient
) {
  const db = client ?? getPool();
  const limit = Math.min(params.limit ?? 50, 100);
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.status) {
    values.push(params.status);
    conditions.push(`v.status = $${values.length}`);
  }

  if (params.kind) {
    values.push(params.kind);
    conditions.push(`v.kind = $${values.length}`);
  }

  if (params.search) {
    values.push(`%${params.search}%`);
    conditions.push(`(v.registration_number ILIKE $${values.length} OR v.kind ILIKE $${values.length})`);
  }

  if (params.cursor) {
    const decoded = decodeVehicleCursor(params.cursor);
    if (decoded) {
      values.push(decoded.createdAt, decoded.id);
      conditions.push(`(v.created_at, v.id) < ($${values.length - 1}, $${values.length})`);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit + 1);

  const query = `
    ${VEHICLE_SELECT_FRAGMENT}
    ${whereClause}
    ORDER BY v.created_at DESC, v.id DESC
    LIMIT $${values.length}
  `;

  try {
    const result = await db.query<VehicleDbRow>(query, values);
    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const items = rows.map(mapVehicleRow);

    const nextCursor = hasMore && rows.length > 0
      ? encodeVehicleCursor({
          created_at: rows[rows.length - 1].created_at,
          id: rows[rows.length - 1].id,
        })
      : null;

    return { items, nextCursor };
  } catch (error) {
    handleVehicleDbError(error);
  }
}

export async function findVehicleById(id: string, client?: PoolClient) {
  const db = client ?? getPool();
  try {
    const result = await db.query<VehicleDbRow>(
      `${VEHICLE_SELECT_FRAGMENT} WHERE v.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return mapVehicleRow(result.rows[0]);
  } catch (error) {
    handleVehicleDbError(error);
  }
}

export async function createVehicle(data: CreateVehicle, client?: PoolClient) {
  const db = client ?? getPool();
  try {
    const result = await db.query<{
      id: string;
      registration_number: string;
      kind: string;
      capacity_kg: string;
      status: 'ACTIVE' | 'MAINTENANCE' | 'RETIRED';
      size_category: 'SMALL' | 'MEDIUM' | 'LARGE' | null;
      indicative_max_vessels: number | null;
      created_at: Date;
    }>(
      `INSERT INTO app.vehicles (
        registration_number,
        kind,
        capacity_kg,
        status,
        size_category,
        indicative_max_vessels,
        assigned_driver_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        data.registrationNumber,
        data.kind,
        data.capacityKg,
        data.status ?? 'ACTIVE',
        data.sizeCategory ?? null,
        data.indicativeMaxVessels ?? null,
        data.assignedDriverId ?? null,
      ]
    );

    return findVehicleById(result.rows[0].id, client);
  } catch (error) {
    handleVehicleDbError(error);
  }
}

export async function updateVehicle(
  id: string,
  patch: UpdateVehicle,
  client?: PoolClient
) {
  const db = client ?? getPool();
  const setClauses: string[] = [];
  const values: unknown[] = [id];

  if (patch.registrationNumber !== undefined) {
    values.push(patch.registrationNumber);
    setClauses.push(`registration_number = $${values.length}`);
  }
  if (patch.kind !== undefined) {
    values.push(patch.kind);
    setClauses.push(`kind = $${values.length}`);
  }
  if (patch.capacityKg !== undefined) {
    values.push(patch.capacityKg);
    setClauses.push(`capacity_kg = $${values.length}`);
  }
  if (patch.status !== undefined) {
    values.push(patch.status);
    setClauses.push(`status = $${values.length}`);
  }
  if (patch.sizeCategory !== undefined) {
    values.push(patch.sizeCategory);
    setClauses.push(`size_category = $${values.length}`);
  }
  if (patch.indicativeMaxVessels !== undefined) {
    values.push(patch.indicativeMaxVessels);
    setClauses.push(`indicative_max_vessels = $${values.length}`);
  }
  if (patch.assignedDriverId !== undefined) {
    values.push(patch.assignedDriverId);
    setClauses.push(`assigned_driver_id = $${values.length}`);
  }

  if (setClauses.length === 0) {
    return findVehicleById(id, client);
  }

  try {
    const result = await db.query<{ id: string }>(
      `UPDATE app.vehicles
       SET ${setClauses.join(', ')}
       WHERE id = $1
       RETURNING id`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    return findVehicleById(id, client);
  } catch (error) {
    handleVehicleDbError(error);
  }
}

export async function getFleetSummary(client?: PoolClient): Promise<FleetSummary> {
  const db = client ?? getPool();
  const query = `
    WITH vehicle_readiness_calc AS (
      SELECT
        v.id,
        v.status,
        COALESCE(downtime.has_active_downtime, false) AS has_active_downtime,
        (curr_assign.assignment_id IS NOT NULL) AS has_active_assignment,
        latest_maint.condition AS latest_condition
      FROM app.vehicles v
      LEFT JOIN LATERAL (
        SELECT a.id AS assignment_id
        FROM app.assignments a
        JOIN app.pickups p ON p.id = a.pickup_id
        WHERE a.vehicle_id = v.id
          AND a.status NOT IN ('REJECTED', 'CANCELLED', 'FAILED', 'DELIVERED')
          AND p.status NOT IN ('CANCELLED', 'FAILED', 'DELIVERED')
        LIMIT 1
      ) curr_assign ON true
      LEFT JOIN LATERAL (
        SELECT EXISTS (
          SELECT 1 FROM app.vehicle_unavailability vu
          WHERE vu.vehicle_id = v.id
            AND vu.starts_at <= now()
            AND vu.ends_at > now()
        ) AS has_active_downtime
      ) downtime ON true
      LEFT JOIN LATERAL (
        SELECT vmr.condition
        FROM app.vehicle_maintenance_records vmr
        WHERE vmr.vehicle_id = v.id
        ORDER BY vmr.serviced_on DESC, vmr.created_at DESC
        LIMIT 1
      ) latest_maint ON true
    )
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE status = 'ACTIVE'
          AND NOT has_active_downtime
          AND NOT has_active_assignment
          AND (latest_condition IS NULL OR latest_condition <> 'UNSAFE')
      )::int AS available,
      COUNT(*) FILTER (
        WHERE has_active_assignment
      )::int AS on_trip,
      COUNT(*) FILTER (
        WHERE status = 'MAINTENANCE'
           OR has_active_downtime
           OR latest_condition = 'UNSAFE'
      )::int AS maintenance,
      COUNT(*) FILTER (
        WHERE status = 'RETIRED'
      )::int AS retired
    FROM vehicle_readiness_calc
  `;

  try {
    const result = await db.query<{
      total: number;
      available: number;
      on_trip: number;
      maintenance: number;
      retired: number;
    }>(query);

    const row = result.rows[0] ?? { total: 0, available: 0, on_trip: 0, maintenance: 0, retired: 0 };
    return {
      total: Number(row.total || 0),
      available: Number(row.available || 0),
      onTrip: Number(row.on_trip || 0),
      maintenance: Number(row.maintenance || 0),
      retired: Number(row.retired || 0),
    };
  } catch (error) {
    handleVehicleDbError(error);
  }
}

export async function listMaintenanceHistory(
  vehicleId: string,
  client?: PoolClient
) {
  const db = client ?? getPool();
  try {
    const result = await db.query<{
      id: string;
      vehicle_id: string;
      serviced_on: Date | string;
      condition: 'GOOD' | 'NEEDS_SERVICE' | 'UNSAFE';
      summary: string;
      next_service_due_on: Date | string | null;
      recorded_by: string | null;
      created_at: Date;
    }>(
      `SELECT
         id,
         vehicle_id,
         serviced_on,
         condition,
         summary,
         next_service_due_on,
         recorded_by,
         created_at
       FROM app.vehicle_maintenance_records
       WHERE vehicle_id = $1
       ORDER BY serviced_on DESC, created_at DESC`,
      [vehicleId]
    );

    return result.rows.map(row => ({
      id: row.id,
      vehicleId: row.vehicle_id,
      servicedOn: typeof row.serviced_on === 'string' ? row.serviced_on.slice(0, 10) : row.serviced_on.toISOString().slice(0, 10),
      condition: row.condition,
      summary: row.summary,
      nextServiceDueOn: row.next_service_due_on
        ? typeof row.next_service_due_on === 'string'
          ? row.next_service_due_on.slice(0, 10)
          : row.next_service_due_on.toISOString().slice(0, 10)
        : null,
      recordedBy: row.recorded_by,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }));
  } catch (error) {
    handleVehicleDbError(error);
  }
}

export async function createMaintenanceRecord(
  vehicleId: string,
  data: CreateVehicleMaintenanceRecord,
  recordedBy: string | null,
  client?: PoolClient
) {
  const dbClient: PoolClient = client ?? (await getPool().connect());
  const ownsClient = !client;

  try {
    if (ownsClient) await dbClient.query('BEGIN');

    // Confirm vehicle exists
    const vehCheck = await dbClient.query('SELECT id, status FROM app.vehicles WHERE id = $1', [vehicleId]);
    if (vehCheck.rows.length === 0) {
      throw new HttpError(404, 'NOT_FOUND', 'Vehicle not found.');
    }

    const result = await dbClient.query<{
      id: string;
      vehicle_id: string;
      serviced_on: Date | string;
      condition: 'GOOD' | 'NEEDS_SERVICE' | 'UNSAFE';
      summary: string;
      next_service_due_on: Date | string | null;
      recorded_by: string | null;
      created_at: Date;
    }>(
      `INSERT INTO app.vehicle_maintenance_records (
        vehicle_id,
        serviced_on,
        condition,
        summary,
        next_service_due_on,
        recorded_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        vehicleId,
        data.servicedOn,
        data.condition,
        data.summary.trim(),
        data.nextServiceDueOn ?? null,
        recordedBy,
      ]
    );

    // If condition is UNSAFE, update vehicle status to MAINTENANCE
    if (data.condition === 'UNSAFE' && vehCheck.rows[0].status === 'ACTIVE') {
      await dbClient.query(
        "UPDATE app.vehicles SET status = 'MAINTENANCE' WHERE id = $1",
        [vehicleId]
      );
    }

    if (ownsClient) await dbClient.query('COMMIT');

    const row = result.rows[0];
    return {
      id: row.id,
      vehicleId: row.vehicle_id,
      servicedOn: typeof row.serviced_on === 'string' ? row.serviced_on.slice(0, 10) : row.serviced_on.toISOString().slice(0, 10),
      condition: row.condition,
      summary: row.summary,
      nextServiceDueOn: row.next_service_due_on
        ? typeof row.next_service_due_on === 'string'
          ? row.next_service_due_on.slice(0, 10)
          : row.next_service_due_on.toISOString().slice(0, 10)
        : null,
      recordedBy: row.recorded_by,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
  } catch (error) {
    if (ownsClient) {
      try {
        await dbClient.query('ROLLBACK');
      } catch {
        // ignore rollback error
      }
    }
    handleVehicleDbError(error);
  } finally {
    if (ownsClient) dbClient.release();
  }
}

export async function listDrivers(client?: PoolClient) {
  const db = client ?? getPool();
  try {
    const result = await db.query<{
      id: string;
      person_id: string;
      name: string;
      phone_e164: string | null;
      licence_number: string;
      licence_expires_on: Date | string;
      status: 'ACTIVE' | 'INACTIVE';
    }>(
      `SELECT
         d.id,
         d.person_id,
         p.name,
         p.phone_e164,
         d.licence_number,
         d.licence_expires_on,
         d.status
       FROM app.drivers d
       JOIN app.people p ON p.id = d.person_id
       ORDER BY p.name ASC, d.id ASC`
    );

    return result.rows.map(row => ({
      driverId: row.id,
      personId: row.person_id,
      name: row.name,
      phone: row.phone_e164 ?? '',
      licenceNumber: row.licence_number,
      licenceExpiresOn: typeof row.licence_expires_on === 'string'
        ? row.licence_expires_on.slice(0, 10)
        : row.licence_expires_on.toISOString().slice(0, 10),
      status: row.status,
    }));
  } catch (error) {
    handleVehicleDbError(error);
  }
}

export async function deleteVehicle(id: string, client?: PoolClient) {
  const db = client ?? getPool();
  try {
    const vehCheck = await db.query('SELECT id FROM app.vehicles WHERE id = $1', [id]);
    if (vehCheck.rows.length === 0) {
      throw new HttpError(404, 'NOT_FOUND', `Vehicle ${id} not found.`);
    }

    await db.query('DELETE FROM app.vehicles WHERE id = $1', [id]);
    return true;
  } catch (error) {
    handleVehicleDbError(error);
  }
}
