import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { withTransaction } from '../../db/pool';
import { HttpError } from '../../middleware/errorHandler';
import type { AppUser, CreateFoodRequest } from '@aaharaconnect/shared';
import {
  cancelForFoodRequest,
  getActiveAssignmentForPickup,
  getPickupByFoodRequestId,
} from '../pickups/service';
import * as foodRepository from './repository';
import { enqueue } from '../notifications/service';
import { enqueuePush } from '../push/service';
import type {
  FoodItemRow,
  FoodRequestDetail,
  FoodRequestPickupSummary,
  FoodRequestRow,
  ListFoodRequestsQuery,
} from './types';

export function toFoodRequestDto(
  row: FoodRequestRow & { items: FoodItemRow[] },
  pickupSummary?: FoodRequestPickupSummary | null
): FoodRequestDetail {
  const items = row.items.map(i => ({
    foodType: i.food_type,
    quantity: Number(i.quantity),
    unit: i.unit,
    handlingRequirements: i.handling_requirements,
    ...(i.estimated_meals != null ? { estimatedMeals: Number(i.estimated_meals) } : {}),
    ...(i.estimated_weight_kg != null ? { estimatedWeightKg: Number(i.estimated_weight_kg) } : {}),
  }));

  const foods = row.items.map(i => ({
    name: i.food_type,
    foodType: i.food_type,
    quantity: Number(i.quantity),
    unit: i.unit.toLowerCase(),
  }));

  return {
    id: row.id,
    donorId: row.donor_id,
    sourceName: row.source_name,
    sourceType: row.source_type,
    pickupAddress: row.pickup_address,
    preparedAt: row.prepared_at.toISOString(),
    readyAt: row.ready_at.toISOString(),
    pickupDeadline: row.pickup_deadline.toISOString(),
    estimatedWeightKg: row.estimated_weight_kg != null ? Number(row.estimated_weight_kg) : null,
    handlingRequirements: row.handling_requirements,
    donorSafetyDeclaration: row.donor_safety_declaration as true,
    safetyReview: row.safety_review,
    contactName: row.contact_name,
    contactPhoneE164: row.contact_phone_e164,
    notes: row.notes ?? undefined,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    items,
    donorName: row.source_name,
    location: row.pickup_address,
    foods,
    pickup: pickupSummary ?? null,
  };
}

export async function createFoodRequest(
  appUser: AppUser,
  data: CreateFoodRequest,
  client?: PoolClient
): Promise<FoodRequestDetail> {
  if (appUser.role !== 'DONOR' && appUser.role !== 'ADMIN') {
    throw new HttpError(403, 'FORBIDDEN', 'Only donors or administrators can submit food requests.');
  }

  const run = async (txClient: PoolClient): Promise<FoodRequestDetail> => {
    const submission = data.submissionId && process.env.FOOD_REQUEST_IDEMPOTENCY_ENABLED === 'true' ? data.submissionId : null;
    const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    if (submission) {
      await txClient.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${appUser.id}:${submission}`]);
      const replay=await txClient.query('SELECT request_hash,food_request_id FROM app.food_request_submissions WHERE app_user_id=$1 AND submission_id=$2',[appUser.id,submission]);
      if(replay.rows[0]){
        if(replay.rows[0].request_hash!==hash)throw new HttpError(409,'SUBMISSION_CONFLICT','Use a new submission ID after editing this donation.');
        const existing=await foodRepository.findFoodRequestById(replay.rows[0].food_request_id,txClient);
        if(!existing)throw new HttpError(409,'RESOURCE_CONFLICT','The previous submission needs administrator review.');
        return toFoodRequestDto(existing,null);
      }
    }
    const donor = await foodRepository.findOrCreateDonorForAppUser(
      appUser.id,
      data.sourceName,
      data.contactPhoneE164,
      txClient
    );

    const created = await foodRepository.createFoodRequest(donor.id, data, txClient);
    if(submission)await txClient.query('INSERT INTO app.food_request_submissions(app_user_id,submission_id,request_hash,food_request_id) VALUES($1,$2,$3,$4)',[appUser.id,submission,hash,created.id]);
    await enqueue(txClient, 'donation_received', created.id, [appUser.id]);
    await enqueuePush(txClient,'FOOD_REQUEST',created.id,`food-request:${created.id}`,'ADMINS');
    return toFoodRequestDto(created, null);
  };

  return client ? run(client) : withTransaction(run);
}

async function enrichWithPickupSummary(
  row: FoodRequestRow & { items: FoodItemRow[] },
  client?: PoolClient
): Promise<FoodRequestDetail> {
  let pickupSummary: FoodRequestPickupSummary | null = null;
  try {
    const pickup = await getPickupByFoodRequestId(row.id, client);
    if (pickup) {
      let assignmentStatus = null;
      try {
        const activeAssignment = await getActiveAssignmentForPickup(pickup.id, client);
        assignmentStatus = activeAssignment?.status ?? null;
      } catch {
        assignmentStatus = null;
      }

      pickupSummary = {
        id: pickup.id,
        status: pickup.status,
        windowStartsAt: pickup.windowStartsAt,
        windowEndsAt: pickup.windowEndsAt,
        deliveryAddress: pickup.deliveryAddress,
        assignmentStatus,
      };
    }
  } catch {
    pickupSummary = null;
  }

  return toFoodRequestDto(row, pickupSummary);
}

export async function getFoodRequestById(
  id: string,
  appUser: AppUser,
  client?: PoolClient
): Promise<FoodRequestDetail> {
  if (appUser.role !== 'DONOR' && appUser.role !== 'ADMIN') {
    throw new HttpError(403, 'FORBIDDEN', 'This role cannot view food requests.');
  }
  const foodRequest = await foodRepository.findFoodRequestById(id, client);
  if (!foodRequest) {
    throw new HttpError(404, 'NOT_FOUND', 'Food request not found.');
  }

  if (appUser.role === 'DONOR') {
    const donor = await foodRepository.findDonorByAppUserId(appUser.id, client);
    if (!donor || donor.id !== foodRequest.donor_id) {
      throw new HttpError(403, 'FORBIDDEN', 'You are not authorized to view this food request.');
    }
  }

  return enrichWithPickupSummary(foodRequest, client);
}

export async function listFoodRequests(
  appUser: AppUser,
  query: ListFoodRequestsQuery,
  client?: PoolClient
): Promise<{ items: FoodRequestDetail[]; nextCursor: string | null }> {
  if (appUser.role === 'DONOR') {
    const donor = await foodRepository.findDonorByAppUserId(appUser.id, client);
    if (!donor) {
      return { items: [], nextCursor: null };
    }
    const rows = await foodRepository.findFoodRequestsByDonorId(donor.id, client);
    const items = await Promise.all(rows.map(r => enrichWithPickupSummary(r, client)));
    return { items, nextCursor: null };
  }

  if (appUser.role === 'ADMIN') {
    const rows = await foodRepository.listFoodRequests(query, client);
    const items = await Promise.all(rows.map(r => enrichWithPickupSummary(r, client)));
    return { items, nextCursor: null };
  }

  throw new HttpError(403, 'FORBIDDEN', 'This role cannot list food requests.');
}

export async function reviewFoodSafety(
  id: string,
  review: 'APPROVED' | 'REJECTED',
  adminUser: AppUser,
  client?: PoolClient
): Promise<FoodRequestDetail> {
  if (adminUser.role !== 'ADMIN') {
    throw new HttpError(403, 'FORBIDDEN', 'Administrator access is required for food safety reviews.');
  }

  const existing = await foodRepository.findFoodRequestById(id, client);
  if (!existing) {
    throw new HttpError(404, 'NOT_FOUND', 'Food request not found.');
  }

  if (existing.status !== 'SUBMITTED') {
    throw new HttpError(409, 'RESOURCE_CONFLICT', `Cannot review safety for a food request in status ${existing.status}.`);
  }

  const updated = await foodRepository.updateSafetyReview(id, review, adminUser.id, client);
  if (!updated) {
    throw new HttpError(404, 'NOT_FOUND', 'Food request not found.');
  }

  return toFoodRequestDto({ ...updated, items: existing.items }, null);
}

export async function cancelFoodRequest(
  id: string,
  appUser: AppUser,
  client?: PoolClient
): Promise<FoodRequestDetail> {
  const existing = await foodRepository.findFoodRequestById(id, client);
  if (!existing) {
    throw new HttpError(404, 'NOT_FOUND', 'Food request not found.');
  }

  if (appUser.role === 'DONOR') {
    const donor = await foodRepository.findDonorByAppUserId(appUser.id, client);
    if (!donor || donor.id !== existing.donor_id) {
      throw new HttpError(403, 'FORBIDDEN', 'You are not authorized to cancel this food request.');
    }
  } else if (appUser.role !== 'ADMIN') {
    throw new HttpError(403, 'FORBIDDEN', 'You cannot cancel this food request.');
  }

  if (existing.status === 'CANCELLED') {
    return toFoodRequestDto(existing, null);
  }

  const run = async (txClient: PoolClient): Promise<FoodRequestDetail> => {
    // Cross-module coordination: Ask Pickup to cancel associated dispatch atomically
    await cancelForFoodRequest(txClient, id);

    const cancelled = await foodRepository.cancelFoodRequest(id, txClient);
    if (!cancelled) {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'Food request could not be cancelled.');
    }

    return toFoodRequestDto({ ...cancelled, items: existing.items }, null);
  };

  return client ? run(client) : withTransaction(run);
}
