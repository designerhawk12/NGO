import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { withTransaction } from '../../db/pool';
import { HttpError } from '../../middleware/errorHandler';
import type { AppUser } from '@aaharaconnect/shared';
import {
  defaultDriverPort,
  defaultFoodPort,
  defaultVehiclePort,
  defaultVolunteerPort,
  type DriverPort,
  type FoodPort,
  type VehiclePort,
  type VolunteerPort,
} from './ports';
import { DefaultVesselAssignmentPort, type VesselAssignmentPort } from '../vessels/port';
import * as pickupRepository from './repository';
import type {
  Assignment,
  AssignmentRow,
  AssignmentStatus,
  AssignmentTransition,
  CreateAssignment,
  CreatePickup,
  ListPickupsQuery,
  Page,
  PickupDetail,
  PickupRow,
  PickupStatus,
} from './types';

export function toPickupDto(row: PickupRow): PickupDetail {
  return {
    id: row.id,
    foodRequestId: row.food_request_id,
    status: row.status,
    windowStartsAt: row.window_starts_at.toISOString(),
    windowEndsAt: row.window_ends_at.toISOString(),
    deliveryAddress: row.delivery_address,
    version: row.version,
    createdAt: row.created_at.toISOString(),
  };
}

export function toAssignmentDto(row: AssignmentRow, volunteerIds: string[]): Assignment {
  return {
    id: row.id,
    pickupId: row.pickup_id,
    status: row.status,
    version: row.version,
    volunteerIds,
    teamId: row.team_id,
    driverId: row.driver_id,
    vehicleId: row.vehicle_id,
  };
}

export function computeRequestHash(pickupId: string, body: unknown): string {
  const canonicalStringify = (obj: unknown): string => {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return `[${obj.map(canonicalStringify).join(',')}]`;
    }
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalStringify((obj as Record<string, unknown>)[k])}`).join(',')}}`;
  };

  return createHash('sha256')
    .update(`${pickupId}:${canonicalStringify(body)}`)
    .digest('hex');
}

export type AssignmentPorts = {
  foodPort?: FoodPort;
  volunteerPort?: VolunteerPort;
  driverPort?: DriverPort;
  vehiclePort?: VehiclePort;
  vesselPort?: VesselAssignmentPort;
};

export function assertPickupWindowIsUpcoming(windowStartsAt: Date, now = new Date()): void {
  if (windowStartsAt <= now) {
    throw new HttpError(409, 'RESOURCE_CONFLICT', 'Pickup window has started or expired. Reschedule the pickup before assigning resources.');
  }
}

export async function createAssignment(
  pickupId: string,
  input: CreateAssignment,
  idempotencyKey: string,
  actorUserId: string,
  ports: AssignmentPorts = {},
  client?: PoolClient
): Promise<{ assignment: Assignment; isReplay: boolean }> {
  const foodPort = ports.foodPort ?? defaultFoodPort;
  const volunteerPort = ports.volunteerPort ?? defaultVolunteerPort;
  const driverPort = ports.driverPort ?? defaultDriverPort;
  const vehiclePort = ports.vehiclePort ?? defaultVehiclePort;
  const vesselPort = ports.vesselPort ?? new DefaultVesselAssignmentPort();

  const run = async (txClient: PoolClient): Promise<{ assignment: Assignment; isReplay: boolean }> => {
    // 1. SELECT the pickup FOR UPDATE
    const pickup = await pickupRepository.findPickupForUpdate(pickupId, txClient);
    if (!pickup) {
      throw new HttpError(404, 'NOT_FOUND', 'Pickup not found.');
    }

    // 2. check app.idempotency_keys
    const requestHash = computeRequestHash(pickupId, input);
    const existingKey = await pickupRepository.findIdempotencyKey(actorUserId, idempotencyKey, txClient);

    if (existingKey) {
      if (existingKey.request_hash === requestHash) {
        if (existingKey.assignment_id) {
          const stored = await pickupRepository.findAssignmentById(existingKey.assignment_id, txClient);
          if (stored) {
            return {
              assignment: toAssignmentDto(stored.assignment, stored.volunteerIds),
              isReplay: true,
            };
          }
        }
      } else {
        throw new HttpError(409, 'RESOURCE_CONFLICT', 'Idempotency key already used with different request payload.');
      }
    }

    if (pickup.status !== 'PLANNED') {
      throw new HttpError(409, 'RESOURCE_CONFLICT', `Pickup cannot be assigned from status ${pickup.status}.`);
    }
    assertPickupWindowIsUpcoming(pickup.window_starts_at);

    // 3. verify through ports:
    // Food readiness:
    const foodRequest = await foodPort.getFoodRequest(pickup.food_request_id, txClient);
    if (!foodRequest) {
      throw new HttpError(404, 'NOT_FOUND', 'Food request not found.');
    }
    if (foodRequest.status !== 'SUBMITTED') {
      throw new HttpError(409, 'RESOURCE_CONFLICT', `Food request must be in SUBMITTED status (currently ${foodRequest.status}).`);
    }
    if (foodRequest.safetyReview !== 'APPROVED') {
      throw new HttpError(409, 'RESOURCE_CONFLICT', `Food request safety review must be APPROVED before assignment (currently ${foodRequest.safetyReview}).`);
    }
    const windowStartsAt = new Date(input.windowStartsAt);
    const windowEndsAt = new Date(input.windowEndsAt);
    const now = new Date();
    if (foodRequest.pickupDeadline <= now) {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'Food request pickup deadline has expired. Ask the donor to submit a new request.');
    }
    assertPickupWindowIsUpcoming(windowStartsAt, now);
    if (pickup.window_starts_at < foodRequest.readyAt || windowStartsAt < foodRequest.readyAt) {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'Assignment window starts before food is ready. Reschedule the pickup.');
    }
    if (pickup.window_ends_at > foodRequest.pickupDeadline || windowEndsAt > foodRequest.pickupDeadline) {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'Assignment window ends after food pickup deadline. Reschedule the pickup.');
    }
    if (windowStartsAt < pickup.window_starts_at || windowEndsAt > pickup.window_ends_at) {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'Assignment window must stay within the scheduled pickup window.');
    }

    // Driver licence valid and ACTIVE:
    const driver = await driverPort.getDriver(input.driverId, txClient);
    if (!driver) {
      throw new HttpError(404, 'NOT_FOUND', 'Driver not found.');
    }
    if (driver.status !== 'ACTIVE') {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'Driver is not active.');
    }
    const licenceExpiryDate = driver.licenceExpiresOn.toISOString().slice(0, 10);
    const assignmentEndDate = windowEndsAt.toISOString().slice(0, 10);
    if (licenceExpiryDate < assignmentEndDate) {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'Driver licence is expired or expires before assignment window ends.');
    }

    // Vehicle ACTIVE with capacity_kg >= estimated load:
    const vehicle = await vehiclePort.getVehicle(input.vehicleId, txClient);
    if (!vehicle) {
      throw new HttpError(404, 'NOT_FOUND', 'Vehicle not found.');
    }
    if (vehicle.status !== 'ACTIVE') {
      throw new HttpError(409, 'RESOURCE_CONFLICT', `Vehicle is not active (currently ${vehicle.status}).`);
    }
    if (vehicle.isReady === false) {
      const blockingReason = vehicle.reasons?.find(r => r.severity === 'BLOCKING')?.message
        ?? 'Vehicle is not ready for dispatch due to maintenance or downtime restriction.';
      throw new HttpError(409, 'RESOURCE_CONFLICT', blockingReason);
    }
    const estimatedLoad = input.containers.reduce((sum, c) => sum + (c.estimatedLoadKg ?? 0), 0);
    if (vehicle.capacityKg < estimatedLoad) {
      throw new HttpError(409, 'RESOURCE_CONFLICT', `Vehicle capacity (${vehicle.capacityKg} kg) is insufficient for estimated load (${estimatedLoad} kg).`);
    }

    // Volunteer availability covers the window:
    const volunteerPersonIds: string[] = [];
    for (const volunteerId of input.volunteerIds) {
      const vol = await volunteerPort.getVolunteerAvailability(volunteerId, windowStartsAt, windowEndsAt, txClient);
      if (!vol) {
        throw new HttpError(404, 'NOT_FOUND', `Volunteer ${volunteerId} not found.`);
      }
      if (vol.status !== 'ACTIVE') {
        throw new HttpError(409, 'RESOURCE_CONFLICT', `Volunteer ${volunteerId} is not active.`);
      }
      if (!vol.isAvailable) {
        throw new HttpError(409, 'RESOURCE_CONFLICT', `Volunteer ${volunteerId} availability does not cover the requested window.`);
      }

      volunteerPersonIds.push(vol.personId);
    }

    // 4. Insert assignment, assignment_members (explicit volunteerIds only), container_plans,
    // resource_reservations (one row per DISTINCT person_id plus the vehicle),
    // assignment_status_events, and set the pickup to ASSIGNED.
    const distinctPersonIds = Array.from(new Set([driver.personId, ...volunteerPersonIds]));

    const assignmentRow = await pickupRepository.createAssignmentWithDetails(
      {
        pickupId,
        actorUserId,
        data: { ...input, driverId: driver.id },
        distinctPersonIds,
        requestHash,
        idempotencyKey,
        pickupPreviousStatus: pickup.status,
      },
      txClient
    );

    await vesselPort.issueForAssignment({
      vesselIds: input.vesselIds ?? [],
      pickupId,
      vehicleId: vehicle.id,
      actorUserId,
    }, txClient);

    return {
      assignment: toAssignmentDto(assignmentRow, input.volunteerIds),
      isReplay: false,
    };
  };

  return client ? run(client) : withTransaction(run);
}

export async function createPickup(
  input: CreatePickup,
  actorUserId?: string,
  foodPort: FoodPort = defaultFoodPort,
  client?: PoolClient
): Promise<PickupDetail> {
  // Precondition via FoodPort: food request status SUBMITTED and safety_review=APPROVED
  const foodRequest = await foodPort.getFoodRequest(input.foodRequestId, client);
  if (!foodRequest) {
    throw new HttpError(404, 'NOT_FOUND', 'Food request not found.');
  }
  if (foodRequest.status !== 'SUBMITTED') {
    throw new HttpError(409, 'RESOURCE_CONFLICT', `Food request must be in SUBMITTED status (currently ${foodRequest.status}).`);
  }
  if (foodRequest.safetyReview !== 'APPROVED') {
    throw new HttpError(409, 'RESOURCE_CONFLICT', `Food request safety review must be APPROVED before scheduling a pickup (currently ${foodRequest.safetyReview}).`);
  }

  const windowStartsAt = new Date(input.windowStartsAt);
  const windowEndsAt = new Date(input.windowEndsAt);
  const now = new Date();
  if (foodRequest.pickupDeadline <= now) {
    throw new HttpError(
      409,
      'RESOURCE_CONFLICT',
      `Food request pickup deadline expired at ${foodRequest.pickupDeadline.toISOString()}. Do not extend or reuse this request; ask the donor to submit a new request.`
    );
  }
  if (windowStartsAt <= now) {
    throw new HttpError(409, 'RESOURCE_CONFLICT', 'Pickup window must start in the future.');
  }
  if (windowStartsAt < foodRequest.readyAt) {
    throw new HttpError(
      409,
      'RESOURCE_CONFLICT',
      `Pickup window cannot start before the food is ready at ${foodRequest.readyAt.toISOString()}.`
    );
  }
  if (windowEndsAt > foodRequest.pickupDeadline) {
    throw new HttpError(
      409,
      'RESOURCE_CONFLICT',
      `Pickup window cannot end after the food request deadline at ${foodRequest.pickupDeadline.toISOString()}.`
    );
  }

  // Precondition: One pickup per food request -> 409
  const existing = await pickupRepository.findByFoodRequestId(input.foodRequestId, client);
  if (existing) {
    throw new HttpError(409, 'RESOURCE_CONFLICT', 'A pickup already exists for this food request.');
  }

  const run = async (txClient: PoolClient): Promise<PickupDetail> => {
    const row = await pickupRepository.createPickup(input, actorUserId, txClient);
    return toPickupDto(row);
  };

  return client ? run(client) : withTransaction(run);
}

export async function getPickupById(id: string, client?: PoolClient): Promise<PickupDetail> {
  const row = await pickupRepository.findById(id, client);
  if (!row) {
    throw new HttpError(404, 'NOT_FOUND', 'Pickup not found.');
  }
  return toPickupDto(row);
}

export async function listEligibleVolunteersForPickup(
  pickupId: string,
  volunteerPort: VolunteerPort = defaultVolunteerPort,
  client?: PoolClient,
  foodPort: FoodPort = defaultFoodPort
): Promise<{
  windowStartsAt: string;
  windowEndsAt: string;
  volunteerIds: string[];
  reservationConflictVolunteerIds: string[];
  blockingReason: string | null;
  foodPickupDeadline: string;
  requiresNewDonorRequest: boolean;
}> {
  const pickup = await pickupRepository.findById(pickupId, client);
  if (!pickup) throw new HttpError(404, 'NOT_FOUND', 'Pickup not found.');
  if (pickup.status !== 'PLANNED') {
    throw new HttpError(409, 'RESOURCE_CONFLICT', `Pickup cannot be assigned from status ${pickup.status}.`);
  }

  const foodRequest = await foodPort.getFoodRequest(pickup.food_request_id, client);
  if (!foodRequest) {
    throw new HttpError(409, 'RESOURCE_CONFLICT', 'Pickup references a food request that no longer exists.');
  }

  const windowStartsAt = pickup.window_starts_at;
  const windowEndsAt = pickup.window_ends_at;
  const foodPickupDeadline = foodRequest.pickupDeadline.toISOString();
  const blocked = (blockingReason: string, requiresNewDonorRequest = false) => ({
    windowStartsAt: windowStartsAt.toISOString(),
    windowEndsAt: windowEndsAt.toISOString(),
    volunteerIds: [] as string[],
    reservationConflictVolunteerIds: [] as string[],
    blockingReason,
    foodPickupDeadline,
    requiresNewDonorRequest,
  });

  if (foodRequest.status !== 'SUBMITTED') {
    return blocked(`Food request must be in SUBMITTED status before assignment (currently ${foodRequest.status}).`);
  }
  if (foodRequest.safetyReview !== 'APPROVED') {
    return blocked(`Food request safety review must be APPROVED before assignment (currently ${foodRequest.safetyReview}).`);
  }
  if (foodRequest.pickupDeadline <= new Date()) {
    return blocked(
      `Food request pickup deadline expired at ${foodPickupDeadline}. Do not extend or reuse this request. Ask the donor to submit a new request through the normal donor flow, then wait for safety approval and schedule that request.`,
      true
    );
  }
  if (windowStartsAt < foodRequest.readyAt) {
    return blocked(
      `Pickup window starts before food is ready. It must be within the food request's valid window (${foodRequest.readyAt.toISOString()} to ${foodPickupDeadline}). Reschedule the pickup.`
    );
  }
  if (windowEndsAt > foodRequest.pickupDeadline) {
    return blocked(
      `Pickup window ends after the food request deadline. It must be within the food request's valid window (${foodRequest.readyAt.toISOString()} to ${foodPickupDeadline}). Reschedule the pickup.`
    );
  }
  if (windowStartsAt <= new Date()) {
    return blocked(
      `Pickup window has started or expired. Assignment is blocked; any replacement window must remain within the original food request's valid window ending ${foodPickupDeadline}.`
    );
  }

  const eligible = await volunteerPort.listEligibleVolunteers(
    { startAt: windowStartsAt, endAt: windowEndsAt },
    client
  );
  const reservedPersonIds = new Set(await pickupRepository.listReservedPersonIds(
    eligible.map(volunteer => volunteer.personId),
    windowStartsAt,
    windowEndsAt,
    client
  ));
  const reservationConflictVolunteerIds = eligible
    .filter(volunteer => reservedPersonIds.has(volunteer.personId))
    .map(volunteer => volunteer.id);

  return {
    windowStartsAt: windowStartsAt.toISOString(),
    windowEndsAt: windowEndsAt.toISOString(),
    volunteerIds: eligible
      .filter(volunteer => !reservedPersonIds.has(volunteer.personId))
      .map(volunteer => volunteer.id),
    reservationConflictVolunteerIds,
    blockingReason: null,
    foodPickupDeadline,
    requiresNewDonorRequest: false,
  };
}

export async function listPickups(
  query: ListPickupsQuery,
  client?: PoolClient
): Promise<Page<PickupDetail>> {
  const result = await pickupRepository.listPickups(query, client);
  return {
    items: result.rows.map(toPickupDto),
    nextCursor: result.nextCursor,
  };
}

type TransitionRule = {
  allowedFrom: AssignmentStatus[];
  toStatus: AssignmentStatus;
  pickupNextStatus: PickupStatus | 'STAYS_ASSIGNED' | 'RETURN_PLANNED';
  isTerminal: boolean;
};

const TRANSITIONS: Record<AssignmentTransition['action'], TransitionRule> = {
  ACCEPT: {
    allowedFrom: ['PENDING'],
    toStatus: 'ACCEPTED',
    pickupNextStatus: 'STAYS_ASSIGNED',
    isTerminal: false,
  },
  REJECT: {
    allowedFrom: ['PENDING'],
    toStatus: 'REJECTED',
    pickupNextStatus: 'RETURN_PLANNED',
    isTerminal: true,
  },
  START: {
    allowedFrom: ['ACCEPTED'],
    toStatus: 'EN_ROUTE',
    pickupNextStatus: 'EN_ROUTE',
    isTerminal: false,
  },
  ARRIVE: {
    allowedFrom: ['EN_ROUTE'],
    toStatus: 'ARRIVED_AT_DONOR',
    pickupNextStatus: 'ARRIVED_AT_DONOR',
    isTerminal: false,
  },
  COLLECT: {
    allowedFrom: ['ARRIVED_AT_DONOR'],
    toStatus: 'FOOD_COLLECTED',
    pickupNextStatus: 'FOOD_COLLECTED',
    isTerminal: false,
  },
  DELIVER: {
    allowedFrom: ['FOOD_COLLECTED'],
    toStatus: 'DELIVERED',
    pickupNextStatus: 'DELIVERED',
    isTerminal: true,
  },
  CANCEL: {
    allowedFrom: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED_AT_DONOR', 'FOOD_COLLECTED'],
    toStatus: 'CANCELLED',
    pickupNextStatus: 'CANCELLED',
    isTerminal: true,
  },
  FAIL: {
    allowedFrom: ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED_AT_DONOR', 'FOOD_COLLECTED'],
    toStatus: 'FAILED',
    pickupNextStatus: 'RETURN_PLANNED',
    isTerminal: true,
  },
};

export type TransitionAssignmentParams = {
  assignmentId: string;
  input: AssignmentTransition;
  actor: AppUser;
};

export async function transitionAssignmentStatus(
  params: TransitionAssignmentParams,
  client?: PoolClient
): Promise<Assignment> {
  const { assignmentId, input, actor } = params;

  // Authorization checks based on action
  if (['DELIVER', 'CANCEL', 'FAIL'].includes(input.action)) {
    if (actor.role !== 'ADMIN') {
      throw new HttpError(403, 'FORBIDDEN', `Action ${input.action} is restricted to administrators.`);
    }
    if (['CANCEL', 'FAIL'].includes(input.action) && (!input.reason || !input.reason.trim())) {
      throw new HttpError(400, 'VALIDATION_ERROR', `A reason is required when action is ${input.action}.`);
    }
  } else if (['ACCEPT', 'REJECT', 'START', 'ARRIVE', 'COLLECT'].includes(input.action)) {
    if (actor.role !== 'VOLUNTEER') {
      throw new HttpError(403, 'FORBIDDEN', `Action ${input.action} is restricted to assigned volunteers.`);
    }
  }

  const run = async (txClient: PoolClient): Promise<Assignment> => {
    const assignment = await pickupRepository.findAssignmentForUpdate(assignmentId, txClient);
    if (!assignment) {
      throw new HttpError(404, 'NOT_FOUND', 'Assignment not found.');
    }

    if (['ACCEPT', 'REJECT', 'START', 'ARRIVE', 'COLLECT'].includes(input.action) && actor.role !== 'ADMIN') {
      const isAssigned = await pickupRepository.isVolunteerAssignedToAssignment(assignmentId, actor.id, txClient);
      if (!isAssigned) {
        throw new HttpError(403, 'FORBIDDEN', 'Volunteer is not assigned to this assignment.');
      }
    }

    if (assignment.version !== input.expectedVersion) {
      throw new HttpError(
        409,
        'VERSION_CONFLICT',
        `Assignment version conflict. Expected version ${input.expectedVersion} but found ${assignment.version}.`
      );
    }

    const rule = TRANSITIONS[input.action];
    if (!rule.allowedFrom.includes(assignment.status)) {
      throw new HttpError(
        409,
        'INVALID_TRANSITION',
        `Cannot perform action ${input.action} on assignment in status ${assignment.status}.`
      );
    }

    const updatedAssignment = await pickupRepository.updateAssignmentStatus(
      {
        assignmentId,
        fromStatus: assignment.status,
        toStatus: rule.toStatus,
        actorUserId: actor.id,
        reason: input.reason,
      },
      txClient
    );

    const pickup = await pickupRepository.findPickupForUpdate(assignment.pickup_id, txClient);
    if (pickup) {
      let targetPickupStatus: PickupStatus | null = null;
      if (rule.pickupNextStatus === 'RETURN_PLANNED') {
        targetPickupStatus = 'PLANNED';
      } else if (rule.pickupNextStatus !== 'STAYS_ASSIGNED') {
        targetPickupStatus = rule.pickupNextStatus;
      }

      if (targetPickupStatus && targetPickupStatus !== pickup.status) {
        await pickupRepository.updatePickupStatus(
          {
            pickupId: pickup.id,
            fromStatus: pickup.status,
            toStatus: targetPickupStatus,
            actorUserId: actor.id,
            reason: input.reason ?? `Assignment ${input.action.toLowerCase()}`,
          },
          txClient
        );
      }
    }

    if (rule.isTerminal) {
      await pickupRepository.releaseReservations(assignmentId, txClient);
      await pickupRepository.releaseVesselIssuancesForPickup(
        assignment.pickup_id,
        txClient,
        `Assignment ${input.action.toLowerCase()}`
      );
    }

    const volunteerIds = await pickupRepository.getAssignmentVolunteerIds(assignmentId, txClient);
    return toAssignmentDto(updatedAssignment, volunteerIds);
  };

  return client ? run(client) : withTransaction(run);
}

export async function getVolunteerAssignments(
  actorUserId: string,
  client?: PoolClient
): Promise<Page<Assignment>> {
  const pairs = await pickupRepository.listAssignmentsForVolunteer(actorUserId, client);
  return {
    items: pairs.map(p => toAssignmentDto(p.assignment, p.volunteerIds)),
    nextCursor: null,
  };
}

export async function cancelForFoodRequest(
  client: PoolClient,
  foodRequestId: string
): Promise<PickupDetail | null> {
  const pickup = await pickupRepository.findPickupByFoodRequestIdForUpdate(foodRequestId, client);
  if (!pickup) return null;

  if (pickup.status === 'CANCELLED') {
    return toPickupDto(pickup);
  }

  if (['EN_ROUTE', 'ARRIVED_AT_DONOR', 'FOOD_COLLECTED', 'DELIVERED'].includes(pickup.status)) {
    throw new HttpError(
      409,
      'INVALID_TRANSITION',
      `Cannot cancel pickup after travel has begun (current status: ${pickup.status}).`
    );
  }

  if (pickup.status === 'ASSIGNED') {
    const assignment = await pickupRepository.findActiveAssignmentByPickupIdForUpdate(pickup.id, client);
    if (assignment) {
      await pickupRepository.updateAssignmentStatus(
        {
          assignmentId: assignment.id,
          fromStatus: assignment.status,
          toStatus: 'CANCELLED',
          reason: 'Food request cancelled by donor',
        },
        client
      );
      await pickupRepository.releaseReservations(assignment.id, client);
    }
  }

  await pickupRepository.releaseVesselIssuancesForPickup(pickup.id, client);

  const updatedPickup = await pickupRepository.updatePickupStatus(
    {
      pickupId: pickup.id,
      fromStatus: pickup.status,
      toStatus: 'CANCELLED',
      reason: 'Food request cancelled by donor',
    },
    client
  );

  return toPickupDto(updatedPickup);
}

export async function getActiveAssignmentForPickup(
  pickupId: string,
  client?: PoolClient
): Promise<Assignment | null> {
  const pickup = await pickupRepository.findById(pickupId, client);
  if (!pickup) {
    throw new HttpError(404, 'NOT_FOUND', 'Pickup not found.');
  }

  const activeAssignments = await pickupRepository.findActiveAssignmentsByPickupId(pickupId, client);
  if (activeAssignments.length === 0) {
    return null;
  }

  if (activeAssignments.length > 1) {
    throw new HttpError(
      500,
      'INTERNAL_ERROR',
      `Data invariant violation: pickup ${pickupId} has ${activeAssignments.length} active assignments.`
    );
  }

  const assignmentRow = activeAssignments[0];
  const volunteerIds = await pickupRepository.getAssignmentVolunteerIds(assignmentRow.id, client);
  return toAssignmentDto(assignmentRow, volunteerIds);
}
export async function getPickupByFoodRequestId(
  foodRequestId: string,
  client?: PoolClient
): Promise<PickupDetail | null> {
  const row = await pickupRepository.findByFoodRequestId(foodRequestId, client);
  return row ? toPickupDto(row) : null;
}
