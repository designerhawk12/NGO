import { apiRequest } from '../../api/client'
import { getAuthHeaders } from './adapters'
import type {
  CreateAssignmentInput,
  CreatePickupInput,
  LiveAssignment,
  Pickup,
  VehicleAssignmentSummary,
  FoodRequestSummary,
} from './types'


export async function fetchPickups(
  cursor?: string | null
): Promise<{ items: Pickup[]; nextCursor: string | null }> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return apiRequest<{ items: Pickup[]; nextCursor: string | null }>(`pickups${query}`, {
    headers: await getAuthHeaders(),
  })
}

export async function fetchPickupById(id: string): Promise<Pickup> {
  return apiRequest<Pickup>(`pickups/${id}`, {
    headers: await getAuthHeaders(),
  })
}

export async function fetchEligibleVolunteersForPickup(
  pickupId: string
): Promise<{
  windowStartsAt: string
  windowEndsAt: string
  volunteerIds: string[]
  reservationConflictVolunteerIds: string[]
  blockingReason: string | null
  foodPickupDeadline: string
  requiresNewDonorRequest: boolean
}> {
  return apiRequest<{
    windowStartsAt: string
    windowEndsAt: string
    volunteerIds: string[]
    reservationConflictVolunteerIds: string[]
    blockingReason: string | null
    foodPickupDeadline: string
    requiresNewDonorRequest: boolean
  }>(`pickups/${pickupId}/eligible-volunteers`, {
    headers: await getAuthHeaders(),
  })
}

export async function createPickup(input: CreatePickupInput): Promise<Pickup> {
  return apiRequest<Pickup>('pickups', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: input,
  })
}

export async function createAssignment(
  pickupId: string,
  input: CreateAssignmentInput,
  idempotencyKey: string
): Promise<LiveAssignment> {
  const authHeaders = await getAuthHeaders()
  return apiRequest<LiveAssignment>(`pickups/${pickupId}/assignments`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Idempotency-Key': idempotencyKey,
    },
    body: input,
  })
}

export async function transitionAssignment(
  assignmentId: string,
  action: 'ACCEPT' | 'START' | 'ARRIVE' | 'COLLECT' | 'DELIVER' | 'CANCEL' | 'FAIL',
  expectedVersion: number,
  reason?: string
): Promise<LiveAssignment> {
  return apiRequest<LiveAssignment>(`assignments/${assignmentId}/status`, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: {
      action,
      expectedVersion,
      reason,
    },
  })
}

export async function fetchVehicleAssignments(
  vehicleId: string
): Promise<VehicleAssignmentSummary[]> {
  const response = await apiRequest<{ items: VehicleAssignmentSummary[]; nextCursor: string | null }>(
    `vehicles/${vehicleId}/assignments`,
    {
      headers: await getAuthHeaders(),
    }
  )
  return response.items || []
}

export async function fetchActiveAssignment(
  pickupId: string
): Promise<LiveAssignment | null> {
  return apiRequest<LiveAssignment | null>(`pickups/${pickupId}/assignment`, {
    headers: await getAuthHeaders(),
  })
}
export async function reviewFoodSafety(
  foodRequestId: string,
  review: 'APPROVED' | 'REJECTED'
): Promise<unknown> {
  return apiRequest('food-requests/' + foodRequestId + '/safety-review', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: { review },
  });
}

export async function fetchFoodRequests(): Promise<{ items: FoodRequestSummary[]; nextCursor: string | null }> {
  return apiRequest<{ items: FoodRequestSummary[]; nextCursor: string | null }>('food-requests', {
    headers: await getAuthHeaders(),
  })
}

export async function fetchVolunteers(): Promise<{ items: unknown[]; nextCursor: string | null }> {
  return apiRequest<{ items: unknown[]; nextCursor: string | null }>('volunteers', {
    headers: await getAuthHeaders(),
  })
}

export async function fetchDrivers(): Promise<{ items: unknown[]; nextCursor: string | null }> {
  return apiRequest<{ items: unknown[]; nextCursor: string | null }>('drivers', {
    headers: await getAuthHeaders(),
  })
}

export async function fetchVehicles(): Promise<{ items: unknown[]; nextCursor: string | null }> {
  return apiRequest<{ items: unknown[]; nextCursor: string | null }>('vehicles', {
    headers: await getAuthHeaders(),
  })
}
