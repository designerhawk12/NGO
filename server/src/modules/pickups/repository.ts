import type { PoolClient } from 'pg';
import { getPool } from '../../db/pool';
import { HttpError } from '../../middleware/errorHandler';
import type {
  AssignmentRow,
  AssignmentStatus,
  CreateAssignment,
  CreatePickup,
  IdempotencyKeyRow,
  ListPickupsQuery,
  PickupRow,
  PickupStatus,
} from './types';

export function handleDbError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  if (error && typeof error === 'object' && 'code' in error) {
    const pgError = error as { code: string; message?: string; detail?: string };
    if (['23505', '23P01', '23514'].includes(pgError.code)) {
      throw new HttpError(409, 'RESOURCE_CONFLICT', pgError.detail || pgError.message || 'Resource conflict encountered.');
    }
  }
  throw error;
}

export function encodeCursor(row: PickupRow): string {
  return Buffer.from(`${row.created_at.toISOString()}|${row.id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
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

export async function createPickup(
  data: CreatePickup,
  actorUserId?: string,
  client?: PoolClient
): Promise<PickupRow> {
  const db = client ?? getPool();
  try {
    const result = await db.query<PickupRow>(
      `INSERT INTO app.pickups (food_request_id, window_starts_at, window_ends_at, delivery_address, status, version)
       VALUES ($1, $2, $3, $4, 'PLANNED', 0)
       RETURNING id, food_request_id, window_starts_at, window_ends_at, delivery_address, status, version, created_at`,
      [data.foodRequestId, data.windowStartsAt, data.windowEndsAt, data.deliveryAddress]
    );
    const pickup = result.rows[0];

    await db.query(
      `INSERT INTO app.pickup_status_events (pickup_id, actor_user_id, from_status, to_status, reason)
       VALUES ($1, $2, NULL, $3, 'Initial creation')`,
      [pickup.id, actorUserId ?? null, 'PLANNED']
    );

    return pickup;
  } catch (error) {
    handleDbError(error);
  }
}

export async function findById(id: string, client?: PoolClient): Promise<PickupRow | null> {
  const db = client ?? getPool();
  try {
    const result = await db.query<PickupRow>(
      `SELECT id, food_request_id, window_starts_at, window_ends_at, delivery_address, status, version, created_at FROM app.pickups WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    handleDbError(error);
  }
}

export async function listReservedPersonIds(
  personIds: string[],
  startsAt: Date,
  endsAt: Date,
  client?: PoolClient
): Promise<string[]> {
  if (personIds.length === 0) return [];
  const db = client ?? getPool();
  try {
    const result = await db.query<{ person_id: string }>(
      `SELECT DISTINCT person_id
       FROM app.resource_reservations
       WHERE person_id = ANY($1::uuid[])
         AND state = 'ACTIVE'
         AND starts_at < $3
         AND ends_at > $2`,
      [personIds, startsAt, endsAt]
    );
    return result.rows.map(row => row.person_id);
  } catch (error) {
    handleDbError(error);
  }
}

export async function findPickupForUpdate(id: string, client: PoolClient): Promise<PickupRow | null> {
  try {
    const result = await client.query<PickupRow>(
      `SELECT id, food_request_id, window_starts_at, window_ends_at, delivery_address, status, version, created_at
       FROM app.pickups
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    handleDbError(error);
  }
}

export async function findIdempotencyKey(
  actorUserId: string,
  key: string,
  client: PoolClient
): Promise<IdempotencyKeyRow | null> {
  try {
    const result = await client.query<IdempotencyKeyRow>(
      `SELECT actor_user_id, key, request_hash, assignment_id, created_at
       FROM app.idempotency_keys
       WHERE actor_user_id = $1 AND key = $2
       FOR UPDATE`,
      [actorUserId, key]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    handleDbError(error);
  }
}

export async function findAssignmentById(
  id: string,
  client: PoolClient
): Promise<{ assignment: AssignmentRow; volunteerIds: string[] } | null> {
  try {
    const result = await client.query<AssignmentRow>(
      `SELECT id, pickup_id, team_id, driver_id, vehicle_id, role, status, version, created_at FROM app.assignments WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    const assignment = result.rows[0];

    const membersResult = await client.query<{ volunteer_id: string }>(
      `SELECT volunteer_id FROM app.assignment_members WHERE assignment_id = $1 ORDER BY volunteer_id`,
      [id]
    );

    return {
      assignment,
      volunteerIds: membersResult.rows.map(r => r.volunteer_id),
    };
  } catch (error) {
    handleDbError(error);
  }
}

export type InsertAssignmentParams = {
  pickupId: string;
  actorUserId?: string;
  data: CreateAssignment;
  distinctPersonIds: string[];
  requestHash: string;
  idempotencyKey: string;
  pickupPreviousStatus: string;
};

export async function createAssignmentWithDetails(
  params: InsertAssignmentParams,
  client: PoolClient
): Promise<AssignmentRow> {
  try {
    const assignResult = await client.query<AssignmentRow>(
      `INSERT INTO app.assignments (pickup_id, team_id, driver_id, vehicle_id, role, status, version)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', 0)
       RETURNING id, pickup_id, team_id, driver_id, vehicle_id, role, status, version, created_at`,
      [
        params.pickupId,
        params.data.teamId ?? null,
        params.data.driverId,
        params.data.vehicleId,
        params.data.role,
      ]
    );
    const assignment = assignResult.rows[0];

    for (const volunteerId of params.data.volunteerIds) {
      await client.query(
        `INSERT INTO app.assignment_members (assignment_id, volunteer_id)
         VALUES ($1, $2)`,
        [assignment.id, volunteerId]
      );
    }

    for (const container of params.data.containers) {
      await client.query(
        `INSERT INTO app.container_plans (pickup_id, container_type, count, estimated_load_kg)
         VALUES ($1, $2, $3, $4)`,
        [params.pickupId, container.containerType, container.count, container.estimatedLoadKg ?? null]
      );
    }

    for (const personId of params.distinctPersonIds) {
      await client.query(
        `INSERT INTO app.resource_reservations (assignment_id, person_id, vehicle_id, starts_at, ends_at, state)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
        [assignment.id, personId, null, params.data.windowStartsAt, params.data.windowEndsAt]
      );
    }

    await client.query(
      `INSERT INTO app.resource_reservations (assignment_id, person_id, vehicle_id, starts_at, ends_at, state)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
      [assignment.id, null, params.data.vehicleId, params.data.windowStartsAt, params.data.windowEndsAt]
    );

    await client.query(
      `INSERT INTO app.assignment_status_events (assignment_id, actor_user_id, from_status, to_status, reason)
       VALUES ($1, $2, NULL, 'PENDING', 'Initial assignment')`,
      [assignment.id, params.actorUserId ?? null]
    );

    await client.query(
      `UPDATE app.pickups
       SET status = 'ASSIGNED', version = version + 1
       WHERE id = $1`,
      [params.pickupId]
    );

    await client.query(
      `INSERT INTO app.pickup_status_events (pickup_id, actor_user_id, from_status, to_status, reason)
       VALUES ($1, $2, $3, 'ASSIGNED', 'Assignment created')`,
      [params.pickupId, params.actorUserId ?? null, params.pickupPreviousStatus]
    );

    if (params.actorUserId) {
      await client.query(
        `INSERT INTO app.idempotency_keys (actor_user_id, key, request_hash, assignment_id)
         VALUES ($1, $2, $3, $4)`,
        [params.actorUserId, params.idempotencyKey, params.requestHash, assignment.id]
      );
    }

    return assignment;
  } catch (error) {
    handleDbError(error);
  }
}

export async function findByFoodRequestId(foodRequestId: string, client?: PoolClient): Promise<PickupRow | null> {
  const db = client ?? getPool();
  try {
    const result = await db.query<PickupRow>(
      `SELECT id, food_request_id, window_starts_at, window_ends_at, delivery_address, status, version, created_at
       FROM app.pickups
       WHERE food_request_id = $1`,
      [foodRequestId]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    handleDbError(error);
  }
}

export async function listPickups(
  query: ListPickupsQuery,
  client?: PoolClient
): Promise<{ rows: PickupRow[]; nextCursor: string | null }> {
  const db = client ?? getPool();
  const limit = query.limit;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.cursor) {
    const decoded = decodeCursor(query.cursor);
    if (!decoded) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid pagination cursor.');
    }
    params.push(decoded.createdAt.toISOString(), decoded.id);
    conditions.push(`(created_at, id) < ($${params.length - 1}, $${params.length})`);
  }

  params.push(limit + 1);
  const limitIndex = params.length;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT id, food_request_id, window_starts_at, window_ends_at, delivery_address, status, version, created_at
    FROM app.pickups
    ${whereClause}
    ORDER BY created_at DESC, id DESC
    LIMIT $${limitIndex}
  `;

  try {
    const result = await db.query<PickupRow>(sql, params);
    const rows = result.rows;
    let nextCursor: string | null = null;

    if (rows.length > limit) {
      const pageRows = rows.slice(0, limit);
      nextCursor = encodeCursor(pageRows[pageRows.length - 1]);
      return { rows: pageRows, nextCursor };
    }

    return { rows, nextCursor: null };
  } catch (error) {
    handleDbError(error);
  }
}

export async function findAssignmentForUpdate(
  id: string,
  client: PoolClient
): Promise<AssignmentRow | null> {
  try {
    const result = await client.query<AssignmentRow>(
      `SELECT id, pickup_id, team_id, driver_id, vehicle_id, role, status, version, created_at
       FROM app.assignments
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    handleDbError(error);
  }
}

export async function getAssignmentVolunteerIds(
  assignmentId: string,
  client?: PoolClient
): Promise<string[]> {
  const db = client ?? getPool();
  try {
    const result = await db.query<{ volunteer_id: string }>(
      `SELECT volunteer_id FROM app.assignment_members WHERE assignment_id = $1 ORDER BY volunteer_id`,
      [assignmentId]
    );
    return result.rows.map(r => r.volunteer_id);
  } catch (error) {
    handleDbError(error);
  }
}

export async function isVolunteerAssignedToAssignment(
  assignmentId: string,
  actorUserId: string,
  client?: PoolClient
): Promise<boolean> {
  const db = client ?? getPool();
  try {
    const result = await db.query<{ exists: number }>(
      `SELECT 1 as exists
       FROM app.assignment_members am
       JOIN app.volunteers v ON v.id = am.volunteer_id
       JOIN app.people p ON p.id = v.person_id
       WHERE am.assignment_id = $1 AND p.app_user_id = $2`,
      [assignmentId, actorUserId]
    );
    return result.rows.length > 0;
  } catch (error) {
    handleDbError(error);
  }
}

export async function updateAssignmentStatus(
  params: {
    assignmentId: string;
    fromStatus: AssignmentStatus;
    toStatus: AssignmentStatus;
    actorUserId?: string;
    reason?: string;
  },
  client: PoolClient
): Promise<AssignmentRow> {
  try {
    const result = await client.query<AssignmentRow>(
      `UPDATE app.assignments
       SET status = $1, version = version + 1
       WHERE id = $2
       RETURNING id, pickup_id, team_id, driver_id, vehicle_id, role, status, version, created_at`,
      [params.toStatus, params.assignmentId]
    );
    const assignment = result.rows[0];

    await client.query(
      `INSERT INTO app.assignment_status_events (assignment_id, actor_user_id, from_status, to_status, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.assignmentId, params.actorUserId ?? null, params.fromStatus, params.toStatus, params.reason ?? null]
    );

    return assignment;
  } catch (error) {
    handleDbError(error);
  }
}

export async function updatePickupStatus(
  params: {
    pickupId: string;
    fromStatus: PickupStatus;
    toStatus: PickupStatus;
    actorUserId?: string;
    reason?: string;
  },
  client: PoolClient
): Promise<PickupRow> {
  try {
    const result = await client.query<PickupRow>(
      `UPDATE app.pickups
       SET status = $1, version = version + 1
       WHERE id = $2
       RETURNING id, food_request_id, window_starts_at, window_ends_at, delivery_address, status, version, created_at`,
      [params.toStatus, params.pickupId]
    );
    const pickup = result.rows[0];

    await client.query(
      `INSERT INTO app.pickup_status_events (pickup_id, actor_user_id, from_status, to_status, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.pickupId, params.actorUserId ?? null, params.fromStatus, params.toStatus, params.reason ?? null]
    );

    return pickup;
  } catch (error) {
    handleDbError(error);
  }
}

export async function releaseReservations(
  assignmentId: string,
  client: PoolClient
): Promise<number> {
  try {
    const result = await client.query(
      `UPDATE app.resource_reservations
       SET state = 'RELEASED', released_at = now()
       WHERE assignment_id = $1 AND state = 'ACTIVE'`,
      [assignmentId]
    );
    return result.rowCount ?? 0;
  } catch (error) {
    handleDbError(error);
  }
}

export async function releaseVesselIssuancesForPickup(
  pickupId: string,
  client: PoolClient,
  reason = 'Pickup cancelled'
): Promise<number> {
  try {
    const result = await client.query<{ vessel_id: string }>(
      `UPDATE app.vessel_issuances
       SET status = 'RETURNED', returned_at = now(), return_cleanliness = 'DIRTY', return_notes = $2
       WHERE pickup_id = $1 AND status = 'ACTIVE'
       RETURNING vessel_id`,
      [pickupId, reason]
    );
    if (result.rows.length > 0) {
      const vesselIds = result.rows.map(r => r.vessel_id);
      await client.query(
        `UPDATE app.vessels
         SET status = 'CLEANING_REQUIRED', cleaning_status = 'DIRTY', updated_at = now()
         WHERE id = ANY($1::uuid[]) AND status = 'IN_USE'`,
        [vesselIds]
      );
    }
    return result.rowCount ?? 0;
  } catch (error) {
    handleDbError(error);
  }
}

export async function listAssignmentsForVolunteer(
  actorUserId: string,
  client?: PoolClient
): Promise<{ assignment: AssignmentRow; volunteerIds: string[] }[]> {
  const db = client ?? getPool();
  try {
    const result = await db.query<AssignmentRow & { volunteer_ids: string[] }>(
      `SELECT a.id, a.pickup_id, a.team_id, a.driver_id, a.vehicle_id, a.role, a.status, a.version, a.created_at,
              COALESCE(array_agg(DISTINCT am_all.volunteer_id ORDER BY am_all.volunteer_id) FILTER (WHERE am_all.volunteer_id IS NOT NULL), '{}'::uuid[]) AS volunteer_ids
       FROM app.assignments a
       JOIN app.assignment_members am ON am.assignment_id = a.id
       JOIN app.volunteers v ON v.id = am.volunteer_id
       JOIN app.people p ON p.id = v.person_id
       LEFT JOIN app.assignment_members am_all ON am_all.assignment_id = a.id
       WHERE p.app_user_id = $1
       GROUP BY a.id, a.pickup_id, a.team_id, a.driver_id, a.vehicle_id, a.role, a.status, a.version, a.created_at
       ORDER BY a.created_at DESC, a.id DESC`,
      [actorUserId]
    );
    return result.rows.map(r => ({
      assignment: {
        id: r.id,
        pickup_id: r.pickup_id,
        team_id: r.team_id,
        driver_id: r.driver_id,
        vehicle_id: r.vehicle_id,
        role: r.role,
        status: r.status,
        version: r.version,
        created_at: r.created_at,
      },
      volunteerIds: r.volunteer_ids,
    }));
  } catch (error) {
    handleDbError(error);
  }
}

export async function findPickupByFoodRequestIdForUpdate(
  foodRequestId: string,
  client: PoolClient
): Promise<PickupRow | null> {
  try {
    const result = await client.query<PickupRow>(
      `SELECT id, food_request_id, window_starts_at, window_ends_at, delivery_address, status, version, created_at
       FROM app.pickups
       WHERE food_request_id = $1
       FOR UPDATE`,
      [foodRequestId]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    handleDbError(error);
  }
}

export async function findActiveAssignmentByPickupIdForUpdate(
  pickupId: string,
  client: PoolClient
): Promise<AssignmentRow | null> {
  try {
    const result = await client.query<AssignmentRow>(
      `SELECT id, pickup_id, team_id, driver_id, vehicle_id, role, status, version, created_at
       FROM app.assignments
       WHERE pickup_id = $1 AND status NOT IN ('REJECTED', 'CANCELLED', 'FAILED')
       FOR UPDATE`,
      [pickupId]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    handleDbError(error);
  }
}

export const ACTIVE_ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = [
  'PENDING',
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED_AT_DONOR',
  'FOOD_COLLECTED',
] as const;

export const TERMINAL_ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = [
  'DELIVERED',
  'REJECTED',
  'CANCELLED',
  'FAILED',
] as const;

export async function findActiveAssignmentsByPickupId(
  pickupId: string,
  client?: PoolClient
): Promise<AssignmentRow[]> {
  const db = client ?? getPool();
  try {
    const result = await db.query<AssignmentRow>(
      `SELECT id, pickup_id, team_id, driver_id, vehicle_id, role, status, version, created_at
       FROM app.assignments
       WHERE pickup_id = $1 AND status = ANY($2::text[])
       ORDER BY created_at ASC`,
      [pickupId, [...ACTIVE_ASSIGNMENT_STATUSES]]
    );
    return result.rows;
  } catch (error) {
    handleDbError(error);
  }
}
