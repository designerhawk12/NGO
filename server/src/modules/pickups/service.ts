import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { requireSharingForStart } from '../tracking/service';
import { enqueueForPeople } from '../notifications/service';
import { enqueuePush } from '../push/service';
import { getPool, withTransaction } from '../../db/pool';
import { HttpError } from '../../middleware/errorHandler';
import { requireActiveCenterAddress } from '../distribution/service';
import {
  assessVehicleCapacity,
  validateVesselSelection,
  type AppUser,
  type CancelPickup,
  type ContainerAssignmentOptions,
  type DriverAssignmentOptions,
  type DriverJob,
  type UpdatePickup,
} from '@aaharaconnect/shared';
import {
  buildContainerOptions,
  buildDriverOptions,
  defaultPlanningPort,
  type PlanningPort,
} from './planning';
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
    operationalNotes: row.operational_notes ?? null,
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
    ...(row.pickup_address ? { pickupAddress: row.pickup_address } : {}),
    ...(row.window_starts_at ? { windowStartsAt: row.window_starts_at.toISOString() } : {}),
    ...(row.window_ends_at ? { windowEndsAt: row.window_ends_at.toISOString() } : {}),
    ...(row.pickup_address !== undefined && row.created_at ? { createdAt: row.created_at.toISOString() } : {}),
    ...(row.terminal_at ? { completedAt: row.terminal_at.toISOString() } : {}),
    ...(row.driver_acceptance ? { driverAcceptance: row.driver_acceptance } : {}),
    ...(row.own_response ? { ownResponse: row.own_response } : {}),
    ...(row.delivery_address ? { deliveryAddress: row.delivery_address } : {}),
  };
}

async function enqueueCrewClosure(tx:PoolClient,assignment:AssignmentRow){
  const crew=await tx.query<{id:string}>(`SELECT d.person_id AS id FROM app.drivers d WHERE d.id=$1 UNION
    SELECT v.person_id AS id FROM app.assignment_members am JOIN app.volunteers v ON v.id=am.volunteer_id WHERE am.assignment_id=$2`,
    [assignment.driver_id,assignment.id]);
  if(crew.rows.length)await enqueuePush(tx,'ASSIGNMENT_CLOSED',assignment.id,`assignment-closed:${assignment.id}`,{personIds:crew.rows.map(row=>row.id)});
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
  planningPort?: PlanningPort;
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
  const planningPort = ports.planningPort ?? defaultPlanningPort;

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
    // Only NGO employee drivers drive NGO vehicles. Their vehicle is the fixed one linked in
    // Assign Driver; the client may echo it but can never choose a different one.
    if (driver.driverType !== 'EMPLOYEE' || !driver.fixedVehicleId) {
      throw new HttpError(409, 'DRIVER_NOT_ELIGIBLE', 'Only NGO employee drivers registered in Assign Driver can be assigned to a pickup.');
    }
    if (input.vehicleId && input.vehicleId !== driver.fixedVehicleId) {
      throw new HttpError(409, 'DRIVER_VEHICLE_MISMATCH', 'The selected vehicle is not the vehicle permanently assigned to this driver.');
    }
    const vehicleId = driver.fixedVehicleId;
    if (driver.status !== 'ACTIVE') {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'Driver is not active.');
    }
    const licenceExpiryDate = driver.licenceExpiresOn.toISOString().slice(0, 10);
    const assignmentEndDate = windowEndsAt.toISOString().slice(0, 10);
    if (licenceExpiryDate < assignmentEndDate) {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'Driver licence is expired or expires before assignment window ends.');
    }

    // Vehicle ACTIVE with capacity_kg >= estimated load:
    const vehicle = await vehiclePort.getVehicle(vehicleId, txClient);
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
    // Authoritative load from the stored donor request, independent of client-supplied estimates.
    const load = await planningPort.getPickupLoad(pickup.food_request_id, txClient);
    const capacity = assessVehicleCapacity(load, vehicle.capacityKg);
    if (capacity.status === 'EXCEEDS') {
      throw new HttpError(409, 'VEHICLE_CAPACITY_INSUFFICIENT', capacity.message);
    }
    const estimatedLoad = input.containers.reduce((sum, c) => sum + (c.estimatedLoadKg ?? 0), 0);
    if (vehicle.capacityKg < estimatedLoad) {
      throw new HttpError(409, 'RESOURCE_CONFLICT', `Vehicle capacity (${vehicle.capacityKg} kg) is insufficient for estimated load (${estimatedLoad} kg).`);
    }
    const vehicleConflict = await planningPort.hasVehicleConflict(vehicleId, windowStartsAt, windowEndsAt, txClient);
    if (vehicleConflict) {
      throw new HttpError(409, 'RESOURCE_CONFLICT', vehicleConflict);
    }

    // Containers: real, clean, available inventory that holds the load and fits the vehicle.
    const vesselIds = input.vesselIds ?? [];
    const selectedVessels = vesselIds.length ? await planningPort.listVessels(txClient, vesselIds) : [];
    if (selectedVessels.length !== vesselIds.length) {
      throw new HttpError(404, 'NOT_FOUND', 'One or more selected containers were not found.');
    }
    const vesselProblems = validateVesselSelection(load, selectedVessels, vehicle.indicativeMaxVessels ?? null);
    if (vesselProblems.length) {
      throw new HttpError(409, 'CONTAINER_PLAN_INVALID', vesselProblems.join(' '));
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
        data: { ...input, driverId: driver.id, vehicleId },
        distinctPersonIds,
        requestHash,
        idempotencyKey,
        pickupPreviousStatus: pickup.status,
      },
      txClient
    );

    await vesselPort.issueForAssignment({
      vesselIds,
      pickupId,
      vehicleId: vehicle.id,
      actorUserId,
    }, txClient);

    await enqueueForPeople(txClient, 'driver_assignment', assignmentRow.id, [driver.personId], input.windowStartsAt);
    await enqueueForPeople(txClient, 'volunteer_assignment', assignmentRow.id, volunteerPersonIds, input.windowStartsAt);
    await enqueuePush(txClient,'PICKUP_SCHEDULED',pickup.food_request_id,`pickup-scheduled:${assignmentRow.id}`,{donorFoodRequestId:pickup.food_request_id});
    await enqueuePush(txClient,'DRIVER_ASSIGNED',assignmentRow.id,`driver-assigned:${assignmentRow.id}`,{personIds:[driver.personId]});
    if(volunteerPersonIds.length)await enqueuePush(txClient,'VOLUNTEER_ASSIGNED',assignmentRow.id,`volunteer-assigned:${assignmentRow.id}`,{personIds:volunteerPersonIds});

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
  // The delivery destination must be a registered Distribution Center; refuse early, before any lookup.
  if (!input.distributionCenterId) {
    throw new HttpError(400, 'DISTRIBUTION_CENTER_REQUIRED', 'Select a Distribution Center for the delivery destination.');
  }
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
  // A pickup the Admin cancelled ("deleted") no longer blocks scheduling a new one.
  if (existing && existing.status !== 'CANCELLED') {
    throw new HttpError(409, 'RESOURCE_CONFLICT', 'A pickup already exists for this food request.');
  }

  const run = async (txClient: PoolClient): Promise<PickupDetail> => {
    const center = await requireActiveCenterAddress(input.distributionCenterId, txClient);
    const row = await pickupRepository.createPickup({ ...input, deliveryAddress: center.address, distributionCenterId: center.id }, actorUserId, txClient);
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
  if (['CANCEL', 'FAIL'].includes(input.action)) {
    if (actor.role !== 'ADMIN') {
      throw new HttpError(403, 'FORBIDDEN', `Action ${input.action} is restricted to administrators.`);
    }
    if (!input.reason?.trim()) {
      throw new HttpError(400, 'VALIDATION_ERROR', `A reason is required when action is ${input.action}.`);
    }
  } else if (input.action === 'DELIVER') {
    if (actor.role !== 'ADMIN' && actor.role !== 'VOLUNTEER' && actor.role !== 'DRIVER') {
      throw new HttpError(403, 'FORBIDDEN', 'Delivery is restricted to administrators and the assigned crew and driver.');
    }
  } else if (actor.role !== 'VOLUNTEER' && actor.role !== 'DRIVER') {
    throw new HttpError(403, 'FORBIDDEN', `Action ${input.action} is restricted to the assigned crew and driver.`);
  }
  if (actor.role === 'DRIVER' && input.action === 'REJECT' && !input.reason?.trim()) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Give a reason when declining a job so the Admin can reassign it.');
  }

  const run = async (txClient: PoolClient): Promise<Assignment> => {
    const assignment = await pickupRepository.findAssignmentForUpdate(assignmentId, txClient);
    if (!assignment) {
      throw new HttpError(404, 'NOT_FOUND', 'Assignment not found.');
    }

    if (actor.role === 'VOLUNTEER' && ['ACCEPT', 'REJECT', 'START', 'ARRIVE', 'COLLECT', 'DELIVER'].includes(input.action)) {
      const isAssigned = await pickupRepository.isVolunteerAssignedToAssignment(assignmentId, actor.id, txClient);
      if (!isAssigned) {
        throw new HttpError(403, 'FORBIDDEN', 'Volunteer is not assigned to this assignment.');
      }
    }
    // An NGO employee driver may act only on jobs where they are the assigned driver.
    if (actor.role === 'DRIVER') {
      const isDriver = await pickupRepository.isDriverOfAssignment(assignmentId, actor.id, txClient);
      if (!isDriver) {
        throw new HttpError(403, 'FORBIDDEN', 'You are not the driver of this assignment.');
      }
    }

    if (assignment.version !== input.expectedVersion) {
      throw new HttpError(
        409,
        'VERSION_CONFLICT',
        `Assignment version conflict. Expected version ${input.expectedVersion} but found ${assignment.version}.`
      );
    }

    const driverAcceptance = assignment.driver_acceptance ?? 'NOT_REQUIRED';
    if (actor.role === 'VOLUNTEER' && (input.action === 'ACCEPT' || input.action === 'REJECT')) {
      if (assignment.status!=='PENDING') throw new HttpError(409,'INVALID_TRANSITION','This assignment is no longer open for a crew response.');
      const member=await txClient.query(`UPDATE app.assignment_members am SET response=$3,responded_at=now(),response_reason=$4
        FROM app.volunteers v JOIN app.people p ON p.id=v.person_id
        WHERE am.assignment_id=$1 AND am.volunteer_id=v.id AND p.app_user_id=$2 AND am.response='PENDING'
        RETURNING am.volunteer_id`,[assignmentId,actor.id,input.action==='ACCEPT'?'ACCEPTED':'DECLINED',input.reason??null]);
      if(!member.rows[0])throw new HttpError(409,'INVALID_TRANSITION','You already responded or are no longer assigned.');
      if(input.action==='REJECT') {
        const reason='Volunteer declined the assignment';
        const rejected=await pickupRepository.updateAssignmentStatus({assignmentId,fromStatus:assignment.status,toStatus:'REJECTED',actorUserId:actor.id,reason},txClient);
        const pickup=await pickupRepository.findPickupForUpdate(assignment.pickup_id,txClient);
        if(pickup && pickup.status!=='PLANNED')await pickupRepository.updatePickupStatus({pickupId:pickup.id,fromStatus:pickup.status,toStatus:'PLANNED',actorUserId:actor.id,reason},txClient);
        await pickupRepository.releaseReservations(assignmentId,txClient);
        await pickupRepository.releaseVesselIssuancesForPickup(assignment.pickup_id,txClient,reason);
        await enqueuePush(txClient,'CREW_DECLINED',assignmentId,`crew-declined:${assignmentId}:${actor.id}`,'ADMINS');
        await enqueueCrewClosure(txClient,assignment);
        if(pickup)await enqueuePush(txClient,'PICKUP_STATUS',pickup.food_request_id,`pickup-status:${pickup.id}:PLANNED:${rejected.version}`,{donorFoodRequestId:pickup.food_request_id});
        return toAssignmentDto(rejected,await pickupRepository.getAssignmentVolunteerIds(assignmentId,txClient));
      }
      const pending=await txClient.query("SELECT count(*)::int AS count FROM app.assignment_members WHERE assignment_id=$1 AND response<>'ACCEPTED'",[assignmentId]);
      const allAccepted=pending.rows[0].count===0;
      if(input.action==='ACCEPT' && allAccepted && driverAcceptance==='ACCEPTED' && assignment.status==='PENDING') {
        const accepted=await pickupRepository.updateAssignmentStatus({assignmentId,fromStatus:'PENDING',toStatus:'ACCEPTED',actorUserId:actor.id,reason:'All assigned crew accepted'},txClient);
        return toAssignmentDto(accepted,await pickupRepository.getAssignmentVolunteerIds(assignmentId,txClient));
      }
      const result=await txClient.query<AssignmentRow>(`UPDATE app.assignments SET version=version+1 WHERE id=$1
        RETURNING id,pickup_id,team_id,driver_id,vehicle_id,role,status,version,created_at,driver_acceptance`,[assignmentId]);
      return toAssignmentDto(result.rows[0],await pickupRepository.getAssignmentVolunteerIds(assignmentId,txClient));
    }
    // Driver acknowledgement is recorded separately so it never stands in for the Volunteers' acceptance.
    if (actor.role === 'DRIVER' && input.action === 'ACCEPT') {
      if (!['PENDING', 'ACCEPTED'].includes(assignment.status) || driverAcceptance !== 'PENDING') {
        throw new HttpError(409, 'INVALID_TRANSITION',
          driverAcceptance === 'ACCEPTED' ? 'You have already accepted this job.' : `This job can no longer be accepted (status ${assignment.status}).`);
      }
      const crew = await pickupRepository.getAssignmentVolunteerIds(assignmentId, txClient);
      let accepted = await pickupRepository.setDriverAcceptance({
        assignmentId, acceptance: 'ACCEPTED', status: assignment.status, actorUserId: actor.id, reason: 'Driver accepted the job',
      }, txClient);
      const pending=crew.length ? await txClient.query("SELECT count(*)::int AS count FROM app.assignment_members WHERE assignment_id=$1 AND response<>'ACCEPTED'",[assignmentId]) : null;
      if ((!pending || pending.rows[0].count===0) && assignment.status === 'PENDING') {
        accepted = await pickupRepository.updateAssignmentStatus({
          assignmentId, fromStatus: 'PENDING', toStatus: 'ACCEPTED', actorUserId: actor.id,
          reason: crew.length ? 'Driver and all assigned Volunteers accepted' : 'Driver-only pickup accepted; no Volunteer acceptance required',
        }, txClient);
      }
      return toAssignmentDto(accepted, await pickupRepository.getAssignmentVolunteerIds(assignmentId, txClient));
    }
    // A driver declining before the trip starts returns the pickup to planning for reassignment.
    if (actor.role === 'DRIVER' && input.action === 'REJECT') {
      if (!['PENDING', 'ACCEPTED'].includes(assignment.status)) {
        throw new HttpError(409, 'INVALID_TRANSITION', `A job cannot be declined after the trip has started (status ${assignment.status}).`);
      }
      const reason = `Driver declined: ${input.reason!.trim()}`;
      await pickupRepository.setDriverAcceptance({
        assignmentId, acceptance: 'DECLINED', status: assignment.status, actorUserId: actor.id, reason,
      }, txClient);
      const rejected = await pickupRepository.updateAssignmentStatus({
        assignmentId, fromStatus: assignment.status, toStatus: 'REJECTED', actorUserId: actor.id, reason,
      }, txClient);
      const pickup = await pickupRepository.findPickupForUpdate(assignment.pickup_id, txClient);
      if (pickup && pickup.status !== 'PLANNED') {
        await pickupRepository.updatePickupStatus({
          pickupId: pickup.id, fromStatus: pickup.status, toStatus: 'PLANNED', actorUserId: actor.id, reason,
        }, txClient);
      }
      await pickupRepository.releaseReservations(assignmentId, txClient);
      await pickupRepository.releaseVesselIssuancesForPickup(assignment.pickup_id, txClient, reason);
      await enqueuePush(txClient,'CREW_DECLINED',assignmentId,`crew-declined:${assignmentId}:${actor.id}`,'ADMINS');
      await enqueueCrewClosure(txClient,assignment);
      if(pickup)await enqueuePush(txClient,'PICKUP_STATUS',pickup.food_request_id,`pickup-status:${pickup.id}:PLANNED:${pickup.version+1}`,{donorFoodRequestId:pickup.food_request_id});
      return toAssignmentDto(rejected, await pickupRepository.getAssignmentVolunteerIds(assignmentId, txClient));
    }
    // Nobody starts the trip until the NGO driver has accepted the job.
    if (input.action === 'START' && (driverAcceptance === 'PENDING' || driverAcceptance === 'DECLINED')) {
      throw new HttpError(409, 'DRIVER_NOT_ACCEPTED', 'Waiting for the NGO driver to accept this job before the trip can start.');
    }
    const driverOnlyStart = actor.role === 'DRIVER' && input.action === 'START' && assignment.status === 'PENDING'
      && (await pickupRepository.getAssignmentVolunteerIds(assignmentId, txClient)).length === 0;
    if (input.action === 'START') await requireSharingForStart(assignment.pickup_id, assignment.vehicle_id, assignment.id, txClient);
    if (actor.role === 'DRIVER' && input.action === 'START' && assignment.status === 'PENDING' && !driverOnlyStart) {
      throw new HttpError(409, 'CREW_NOT_ACCEPTED', 'Waiting for a crew volunteer to accept this job before the trip can start.');
    }

    const rule = TRANSITIONS[input.action];
    if (!rule.allowedFrom.includes(assignment.status) && !driverOnlyStart) {
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
        await enqueuePush(txClient,'PICKUP_STATUS',pickup.food_request_id,`pickup-status:${pickup.id}:${targetPickupStatus}:${pickup.version+1}`,{donorFoodRequestId:pickup.food_request_id});
      }
    }

    if (rule.isTerminal) {
      await pickupRepository.releaseReservations(assignmentId, txClient);
      await pickupRepository.releaseVesselIssuancesForPickup(
        assignment.pickup_id,
        txClient,
        `Assignment ${input.action.toLowerCase()}`
      );
      if(input.action==='CANCEL'||input.action==='FAIL')await enqueueCrewClosure(txClient,assignment);
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
      await enqueueCrewClosure(client,assignment);
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
  await enqueuePush(client,'PICKUP_CANCELLED',pickup.food_request_id,`pickup-cancelled:${pickup.id}:${updatedPickup.version}`,{donorFoodRequestId:pickup.food_request_id});

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
  const responses=await (client??getPool()).query<{volunteer_id:string;response:'PENDING'|'ACCEPTED'|'DECLINED'|'CANCELLED'}>(
    'SELECT volunteer_id,response FROM app.assignment_members WHERE assignment_id=$1 ORDER BY volunteer_id',[assignmentRow.id]);
  return {...toAssignmentDto(assignmentRow, volunteerIds),crewResponses:responses.rows.map(row=>({volunteerId:row.volunteer_id,response:row.response}))};
}
export async function getPickupByFoodRequestId(
  foodRequestId: string,
  client?: PoolClient
): Promise<PickupDetail | null> {
  const row = await pickupRepository.findByFoodRequestId(foodRequestId, client);
  return row ? toPickupDto(row) : null;
}

// ---------------------------------------------------------------------------------------------
// The signed-in NGO employee driver's jobs (only their own).

export async function getDriverJobs(appUserId: string, client?: PoolClient): Promise<Page<DriverJob>> {
  const rows = await pickupRepository.listJobsForDriverAppUser(appUserId, client);
  return {
    items: rows.map(row => ({
      assignmentId: row.assignment_id,
      pickupId: row.pickup_id,
      status: row.status,
      driverAcceptance: row.driver_acceptance as DriverJob['driverAcceptance'],
      version: row.version,
      donorName: row.donor_name,
      pickupAddress: row.pickup_address,
      deliveryAddress: row.delivery_address,
      windowStartsAt: row.window_starts_at.toISOString(),
      windowEndsAt: row.window_ends_at.toISOString(),
      contactName: row.contact_name,
      contactPhone: row.contact_phone_e164,
      handlingRequirements: row.handling_requirements,
      operationalNotes: row.operational_notes,
      foodItems: (row.food_items ?? []).map(item => ({
        foodType: item.foodType, quantity: Number(item.quantity), unit: item.unit,
        estimatedWeightKg: item.estimatedWeightKg == null ? null : Number(item.estimatedWeightKg),
      })),
      vehicle: { id: row.vehicle_id, registrationNumber: row.registration_number, kind: row.kind, capacityKg: Number(row.capacity_kg) },
      crew: row.crew ?? [],
      createdAt: row.created_at.toISOString(),
      completedAt: row.terminal_at ? row.terminal_at.toISOString() : null,
    })),
    nextCursor: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Assignment planning (read-only guidance for the Admin wizard; createAssignment re-checks).

async function loadAssignablePickup(pickupId: string, client?: PoolClient, foodPort: FoodPort = defaultFoodPort) {
  const pickup = await pickupRepository.findById(pickupId, client);
  if (!pickup) throw new HttpError(404, 'NOT_FOUND', 'Pickup not found.');
  let blockingReason: string | null = null;
  if (pickup.status !== 'PLANNED') {
    blockingReason = `Pickup cannot be assigned from status ${pickup.status}.`;
  } else if (pickup.window_starts_at <= new Date()) {
    blockingReason = 'Pickup window has started or expired. Edit the pickup schedule before assigning resources.';
  } else {
    const foodRequest = await foodPort.getFoodRequest(pickup.food_request_id, client);
    if (!foodRequest) blockingReason = 'Pickup references a food request that no longer exists.';
    else if (foodRequest.status !== 'SUBMITTED') blockingReason = `Food request is ${foodRequest.status.toLowerCase()}.`;
    else if (foodRequest.safetyReview !== 'APPROVED') blockingReason = 'Food safety review must be approved before assignment.';
    else if (foodRequest.pickupDeadline <= new Date()) blockingReason = 'Food request pickup deadline has expired.';
  }
  return { pickup, blockingReason };
}

export async function getDriverOptionsForPickup(
  pickupId: string,
  ports: { planningPort?: PlanningPort; vehiclePort?: VehiclePort; foodPort?: FoodPort } = {},
  client?: PoolClient
): Promise<DriverAssignmentOptions> {
  const { pickup, blockingReason } = await loadAssignablePickup(pickupId, client, ports.foodPort);
  return buildDriverOptions(
    { id: pickup.id, windowStartsAt: pickup.window_starts_at, windowEndsAt: pickup.window_ends_at, foodRequestId: pickup.food_request_id },
    blockingReason,
    ports,
    client
  );
}

export async function getContainerOptionsForPickup(
  pickupId: string,
  driverId: string,
  ports: { planningPort?: PlanningPort } = {},
  client?: PoolClient
): Promise<ContainerAssignmentOptions> {
  const planningPort = ports.planningPort ?? defaultPlanningPort;
  const pickup = await pickupRepository.findById(pickupId, client);
  if (!pickup) throw new HttpError(404, 'NOT_FOUND', 'Pickup not found.');
  const driver = await planningPort.getEmployeeDriver(driverId, client);
  if (!driver) {
    throw new HttpError(404, 'DRIVER_NOT_FOUND', 'Select an NGO employee driver registered in Assign Driver.');
  }
  return buildContainerOptions({ id: pickup.id, foodRequestId: pickup.food_request_id }, driver, { planningPort }, client);
}

// ---------------------------------------------------------------------------------------------
// Admin pickup edits. The schedule and delivery address can change only while no crew is
// assigned (PLANNED), so no driver's or Volunteer's trip is ever altered silently. Notes may
// also change while an assignment is pending or accepted.

export async function updatePickup(
  pickupId: string,
  input: UpdatePickup,
  actor: AppUser,
  foodPort: FoodPort = defaultFoodPort,
  client?: PoolClient
): Promise<PickupDetail> {
  if (actor.role !== 'ADMIN') throw new HttpError(403, 'FORBIDDEN', 'Only administrators can edit pickups.');
  const run = async (tx: PoolClient): Promise<PickupDetail> => {
    const pickup = await pickupRepository.findPickupForUpdate(pickupId, tx);
    if (!pickup) throw new HttpError(404, 'NOT_FOUND', 'Pickup not found.');
    if (pickup.version !== input.expectedVersion) {
      throw new HttpError(409, 'VERSION_CONFLICT', 'This pickup was changed by someone else. Reload the list and try again.');
    }
    const changesSchedule = input.windowStartsAt !== undefined || input.deliveryAddress !== undefined || input.distributionCenterId !== undefined;
    const center = input.distributionCenterId === undefined ? null : await requireActiveCenterAddress(input.distributionCenterId, tx);
    if (pickup.status === 'ASSIGNED') {
      if (changesSchedule) {
        throw new HttpError(409, 'PICKUP_SCHEDULE_LOCKED', 'This pickup already has an assigned crew and vehicle. Remove the pickup or cancel its assignment before changing the time or delivery location; only notes can be edited now.');
      }
      const assignment = await pickupRepository.findActiveAssignmentByPickupIdForUpdate(pickup.id, tx);
      if (assignment && !['PENDING', 'ACCEPTED'].includes(assignment.status)) {
        throw new HttpError(409, 'PICKUP_IN_PROGRESS', 'The crew has already started this pickup, so it can no longer be edited.');
      }
    } else if (pickup.status !== 'PLANNED') {
      throw new HttpError(409, 'PICKUP_NOT_EDITABLE', `A ${pickup.status.replaceAll('_', ' ').toLowerCase()} pickup cannot be edited.`);
    }

    let windowStartsAt = pickup.window_starts_at;
    let windowEndsAt = pickup.window_ends_at;
    if (input.windowStartsAt !== undefined && input.windowEndsAt !== undefined) {
      windowStartsAt = new Date(input.windowStartsAt);
      windowEndsAt = new Date(input.windowEndsAt);
      const foodRequest = await foodPort.getFoodRequest(pickup.food_request_id, tx);
      if (!foodRequest) throw new HttpError(409, 'RESOURCE_CONFLICT', 'Pickup references a food request that no longer exists.');
      if (foodRequest.status !== 'SUBMITTED') {
        throw new HttpError(409, 'RESOURCE_CONFLICT', `The donor's food request is ${foodRequest.status.toLowerCase()}; this pickup cannot be rescheduled.`);
      }
      if (windowStartsAt <= new Date()) {
        throw new HttpError(409, 'RESOURCE_CONFLICT', 'The new pickup window must start in the future.');
      }
      if (windowStartsAt < foodRequest.readyAt) {
        throw new HttpError(409, 'RESOURCE_CONFLICT', `The pickup cannot start before the food is ready at ${foodRequest.readyAt.toISOString()}.`);
      }
      if (windowEndsAt > foodRequest.pickupDeadline) {
        throw new HttpError(409, 'RESOURCE_CONFLICT', `The pickup must end before the donor's deadline at ${foodRequest.pickupDeadline.toISOString()}.`);
      }
    }
    const updated = await pickupRepository.updatePickupSchedule({
      pickupId: pickup.id,
      actorUserId: actor.id,
      previous: pickup,
      windowStartsAt,
      windowEndsAt,
      deliveryAddress: center?.address ?? input.deliveryAddress ?? pickup.delivery_address,
      distributionCenterId: center?.id,
      operationalNotes: input.operationalNotes === undefined
        ? pickup.operational_notes ?? null
        : (input.operationalNotes?.trim() || null),
    }, tx);
    if(changesSchedule)await enqueuePush(tx,'PICKUP_RESCHEDULED',pickup.food_request_id,`pickup-rescheduled:${pickup.id}:${updated.version}`,{donorFoodRequestId:pickup.food_request_id});
    return toPickupDto(updated);
  };
  return client ? run(client) : withTransaction(run);
}

// "Delete pickup" is a safe cancellation: the pickup row, its history, the donor's food request and
// any past assignment stay in the database. Active reservations and containers are released.
export async function cancelPickup(
  pickupId: string,
  input: CancelPickup,
  actor: AppUser,
  client?: PoolClient
): Promise<PickupDetail & { alreadyCancelled: boolean }> {
  if (actor.role !== 'ADMIN') throw new HttpError(403, 'FORBIDDEN', 'Only administrators can remove pickups.');
  const run = async (tx: PoolClient) => {
    const pickup = await pickupRepository.findPickupForUpdate(pickupId, tx);
    if (!pickup) throw new HttpError(404, 'NOT_FOUND', 'Pickup not found.');
    if (pickup.status === 'CANCELLED') {
      return { ...toPickupDto(pickup), alreadyCancelled: true };
    }
    if (pickup.version !== input.expectedVersion) {
      throw new HttpError(409, 'VERSION_CONFLICT', 'This pickup was changed by someone else. Reload the list and try again.');
    }
    if (pickup.status === 'DELIVERED') {
      throw new HttpError(409, 'PICKUP_COMPLETED', 'A delivered pickup is part of the permanent record and cannot be removed.');
    }
    if (['EN_ROUTE', 'ARRIVED_AT_DONOR', 'FOOD_COLLECTED'].includes(pickup.status)) {
      throw new HttpError(409, 'PICKUP_IN_PROGRESS', 'The crew has already started this pickup, so it cannot be removed.');
    }
    if (pickup.status !== 'PLANNED' && pickup.status !== 'ASSIGNED') {
      throw new HttpError(409, 'PICKUP_NOT_REMOVABLE', `A ${pickup.status.toLowerCase()} pickup cannot be removed.`);
    }
    const reason = `Removed by administrator: ${input.reason}`;
    const assignment = await pickupRepository.findActiveAssignmentByPickupIdForUpdate(pickup.id, tx);
    if (assignment) {
      if (!['PENDING', 'ACCEPTED'].includes(assignment.status)) {
        throw new HttpError(409, 'PICKUP_IN_PROGRESS', 'The crew has already started this pickup, so it cannot be removed.');
      }
      await pickupRepository.updateAssignmentStatus({
        assignmentId: assignment.id,
        fromStatus: assignment.status,
        toStatus: 'CANCELLED',
        actorUserId: actor.id,
        reason,
      }, tx);
      await pickupRepository.releaseReservations(assignment.id, tx);
    }
    await pickupRepository.releaseVesselIssuancesForPickup(pickup.id, tx, reason);
    const updated = await pickupRepository.updatePickupStatus({
      pickupId: pickup.id,
      fromStatus: pickup.status,
      toStatus: 'CANCELLED',
      actorUserId: actor.id,
      reason,
    }, tx);
    await enqueuePush(tx,'PICKUP_CANCELLED',pickup.food_request_id,`pickup-cancelled:${pickup.id}:${updated.version}`,{donorFoodRequestId:pickup.food_request_id});
    if(assignment)await enqueueCrewClosure(tx,assignment);
    return { ...toPickupDto(updated), alreadyCancelled: false };
  };
  return client ? run(client) : withTransaction(run);
}
