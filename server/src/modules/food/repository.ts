import type { PoolClient } from 'pg';
import { getPool } from '../../db/pool';
import { HttpError } from '../../middleware/errorHandler';
import type { CreateFoodRequest } from '@aaharaconnect/shared';
import type {
  DonorRow,
  FoodItemRow,
  FoodRequestRow,
  ListFoodRequestsQuery,
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

export async function findOrCreateDonorForAppUser(
  appUserId: string,
  organizationName?: string,
  contactPhoneE164?: string,
  client?: PoolClient
): Promise<DonorRow> {
  const db = client ?? getPool();
  try {
    const existing = await db.query<DonorRow>(
      `SELECT id, app_user_id, organization_name, contact_phone_e164, created_at
       FROM app.donors
       WHERE app_user_id = $1`,
      [appUserId]
    );
    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    const inserted = await db.query<DonorRow>(
      `INSERT INTO app.donors (app_user_id, organization_name, contact_phone_e164)
       VALUES ($1, $2, $3)
       ON CONFLICT (app_user_id) DO UPDATE
       SET organization_name = COALESCE(EXCLUDED.organization_name, app.donors.organization_name),
           contact_phone_e164 = COALESCE(EXCLUDED.contact_phone_e164, app.donors.contact_phone_e164)
       RETURNING id, app_user_id, organization_name, contact_phone_e164, created_at`,
      [appUserId, organizationName ?? null, contactPhoneE164 ?? null]
    );
    return inserted.rows[0];
  } catch (error) {
    handleDbError(error);
  }
}

export async function findDonorByAppUserId(
  appUserId: string,
  client?: PoolClient
): Promise<DonorRow | null> {
  const db = client ?? getPool();
  try {
    const result = await db.query<DonorRow>(
      `SELECT id, app_user_id, organization_name, contact_phone_e164, created_at
       FROM app.donors
       WHERE app_user_id = $1`,
      [appUserId]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    handleDbError(error);
  }
}

export async function findDonorById(
  id: string,
  client?: PoolClient
): Promise<DonorRow | null> {
  const db = client ?? getPool();
  try {
    const result = await db.query<DonorRow>(
      `SELECT id, app_user_id, organization_name, contact_phone_e164, created_at
       FROM app.donors
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    handleDbError(error);
  }
}

export async function createFoodRequest(
  donorId: string,
  data: CreateFoodRequest,
  client: PoolClient
): Promise<FoodRequestRow & { items: FoodItemRow[] }> {
  try {
    const reqResult = await client.query<FoodRequestRow>(
      `INSERT INTO app.food_requests (
         donor_id,
         source_name,
         source_type,
         pickup_address,
         prepared_at,
         ready_at,
         pickup_deadline,
         estimated_weight_kg,
         handling_requirements,
         donor_safety_declaration,
         contact_name,
         contact_phone_e164,
         notes,
         status,
         safety_review
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'SUBMITTED', 'PENDING')
       RETURNING id, donor_id, source_name, source_type, pickup_address, prepared_at, ready_at,
                 pickup_deadline, estimated_weight_kg, handling_requirements, donor_safety_declaration,
                 safety_review, safety_reviewed_by, safety_reviewed_at, contact_name, contact_phone_e164,
                 notes, status, created_at, cancelled_at`,
      [
        donorId,
        data.sourceName,
        data.sourceType,
        data.pickupAddress,
        data.preparedAt,
        data.readyAt ?? data.preparedAt,
        data.pickupDeadline,
        data.estimatedWeightKg,
        data.handlingRequirements,
        data.donorSafetyDeclaration,
        data.contactName,
        data.contactPhoneE164,
        data.notes ?? null,
      ]
    );

    const foodRequest = reqResult.rows[0];
    const items: FoodItemRow[] = [];

    for (const item of data.items) {
      const itemResult = await client.query<FoodItemRow>(
        `INSERT INTO app.food_items (food_request_id, food_type, quantity, unit, handling_requirements, estimated_meals, estimated_weight_kg)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, food_request_id, food_type, quantity, unit, handling_requirements, estimated_meals, estimated_weight_kg`,
        [foodRequest.id, item.foodType, item.quantity, item.unit, item.handlingRequirements, item.estimatedMeals ?? null, item.estimatedWeightKg ?? null]
      );
      items.push(itemResult.rows[0]);
    }

    return { ...foodRequest, items };
  } catch (error) {
    handleDbError(error);
  }
}

export async function findFoodRequestById(
  id: string,
  client?: PoolClient
): Promise<(FoodRequestRow & { items: FoodItemRow[] }) | null> {
  const db = client ?? getPool();
  try {
    const reqResult = await db.query<FoodRequestRow>(
      `SELECT id, donor_id, source_name, source_type, pickup_address, prepared_at, ready_at,
              pickup_deadline, estimated_weight_kg, handling_requirements, donor_safety_declaration,
              safety_review, safety_reviewed_by, safety_reviewed_at, contact_name, contact_phone_e164,
              notes, status, created_at, cancelled_at
       FROM app.food_requests
       WHERE id = $1`,
      [id]
    );

    if (reqResult.rows.length === 0) return null;
    const foodRequest = reqResult.rows[0];

    const itemsResult = await db.query<FoodItemRow>(
      `SELECT id, food_request_id, food_type, quantity, unit, handling_requirements, estimated_meals, estimated_weight_kg
       FROM app.food_items
       WHERE food_request_id = $1
       ORDER BY id ASC`,
      [id]
    );

    return { ...foodRequest, items: itemsResult.rows };
  } catch (error) {
    handleDbError(error);
  }
}

export async function findFoodRequestsByDonorId(
  donorId: string,
  client?: PoolClient
): Promise<(FoodRequestRow & { items: FoodItemRow[] })[]> {
  const db = client ?? getPool();
  try {
    const reqResult = await db.query<FoodRequestRow>(
      `SELECT id, donor_id, source_name, source_type, pickup_address, prepared_at, ready_at,
              pickup_deadline, estimated_weight_kg, handling_requirements, donor_safety_declaration,
              safety_review, safety_reviewed_by, safety_reviewed_at, contact_name, contact_phone_e164,
              notes, status, created_at, cancelled_at
       FROM app.food_requests
       WHERE donor_id = $1
       ORDER BY created_at DESC, id DESC`,
      [donorId]
    );

    if (reqResult.rows.length === 0) return [];

    const requestIds = reqResult.rows.map(r => r.id);
    const itemsResult = await db.query<FoodItemRow>(
      `SELECT id, food_request_id, food_type, quantity, unit, handling_requirements, estimated_meals, estimated_weight_kg
       FROM app.food_items
       WHERE food_request_id = ANY($1::uuid[])
       ORDER BY id ASC`,
      [requestIds]
    );

    const itemsByReqId = new Map<string, FoodItemRow[]>();
    for (const item of itemsResult.rows) {
      const list = itemsByReqId.get(item.food_request_id) ?? [];
      list.push(item);
      itemsByReqId.set(item.food_request_id, list);
    }

    return reqResult.rows.map(r => ({
      ...r,
      items: itemsByReqId.get(r.id) ?? [],
    }));
  } catch (error) {
    handleDbError(error);
  }
}

export async function listFoodRequests(
  query: ListFoodRequestsQuery,
  client?: PoolClient
): Promise<(FoodRequestRow & { items: FoodItemRow[] })[]> {
  const db = client ?? getPool();
  try {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (query.status) {
      conditions.push(`status = $${p++}`);
      values.push(query.status);
    } else {
      // The default list is operational. Old rows with unknown timestamps stay
      // in the explicit CANCELLED history view instead of inventing an age.
      conditions.push(`(status = 'SUBMITTED' OR (status = 'CANCELLED' AND cancelled_at > now() - interval '24 hours'))`);
    }
    if (query.safetyReview) {
      conditions.push(`safety_review = $${p++}`);
      values.push(query.safetyReview);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = query.limit && query.limit > 0 ? `LIMIT ${Math.min(query.limit, 100)}` : '';

    const reqResult = await db.query<FoodRequestRow>(
      `SELECT id, donor_id, source_name, source_type, pickup_address, prepared_at, ready_at,
              pickup_deadline, estimated_weight_kg, handling_requirements, donor_safety_declaration,
              safety_review, safety_reviewed_by, safety_reviewed_at, contact_name, contact_phone_e164,
              notes, status, created_at, cancelled_at
       FROM app.food_requests
       ${whereClause}
       ORDER BY (status = 'CANCELLED') ASC, created_at DESC, id DESC
       ${limitClause}`,
      values
    );

    if (reqResult.rows.length === 0) return [];

    const requestIds = reqResult.rows.map(r => r.id);
    const itemsResult = await db.query<FoodItemRow>(
      `SELECT id, food_request_id, food_type, quantity, unit, handling_requirements, estimated_meals, estimated_weight_kg
       FROM app.food_items
       WHERE food_request_id = ANY($1::uuid[])
       ORDER BY id ASC`,
      [requestIds]
    );

    const itemsByReqId = new Map<string, FoodItemRow[]>();
    for (const item of itemsResult.rows) {
      const list = itemsByReqId.get(item.food_request_id) ?? [];
      list.push(item);
      itemsByReqId.set(item.food_request_id, list);
    }

    return reqResult.rows.map(r => ({
      ...r,
      items: itemsByReqId.get(r.id) ?? [],
    }));
  } catch (error) {
    handleDbError(error);
  }
}

export async function updateSafetyReview(
  id: string,
  review: 'APPROVED' | 'REJECTED',
  reviewerUserId: string,
  client?: PoolClient
): Promise<FoodRequestRow | null> {
  const db = client ?? getPool();
  try {
    const result = await db.query<FoodRequestRow>(
      `UPDATE app.food_requests
       SET safety_review = $2,
           safety_reviewed_by = $3,
           safety_reviewed_at = now()
       WHERE id = $1
       RETURNING id, donor_id, source_name, source_type, pickup_address, prepared_at, ready_at,
                 pickup_deadline, estimated_weight_kg, handling_requirements, donor_safety_declaration,
                 safety_review, safety_reviewed_by, safety_reviewed_at, contact_name, contact_phone_e164,
                 notes, status, created_at, cancelled_at`,
      [id, review, reviewerUserId]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    handleDbError(error);
  }
}

export async function cancelFoodRequest(
  id: string,
  client: PoolClient
): Promise<FoodRequestRow | null> {
  try {
    const result = await client.query<FoodRequestRow>(
      `UPDATE app.food_requests
       SET status = 'CANCELLED', cancelled_at = now()
       WHERE id = $1 AND status = 'SUBMITTED'
       RETURNING id, donor_id, source_name, source_type, pickup_address, prepared_at, ready_at,
                 pickup_deadline, estimated_weight_kg, handling_requirements, donor_safety_declaration,
                 safety_review, safety_reviewed_by, safety_reviewed_at, contact_name, contact_phone_e164,
                 notes, status, created_at, cancelled_at`,
      [id]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    handleDbError(error);
  }
}
