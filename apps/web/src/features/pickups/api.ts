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
    cache: 'no-store',
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

// Four-step assignment planning. The server recalculates every decisive check on confirm.
export async function fetchDriverOptions(pickupId: string): Promise<import('@aaharaconnect/shared').DriverAssignmentOptions> {
  return apiRequest(`pickups/${pickupId}/driver-options`, { headers: await getAuthHeaders() })
}

export async function fetchContainerOptions(
  pickupId: string,
  driverId: string
): Promise<import('@aaharaconnect/shared').ContainerAssignmentOptions> {
  return apiRequest(`pickups/${pickupId}/container-options?driverId=${encodeURIComponent(driverId)}`, {
    headers: await getAuthHeaders(),
  })
}

// Admin schedule edit. Time and delivery location change only while no crew is assigned.
export async function updatePickup(
  pickupId: string,
  input: {
    expectedVersion: number
    windowStartsAt?: string
    windowEndsAt?: string
    deliveryAddress?: string
    distributionCenterId?: string
    operationalNotes?: string | null
  }
): Promise<Pickup> {
  return apiRequest<Pickup>(`pickups/${pickupId}`, { method: 'PATCH', headers: await getAuthHeaders(), body: input })
}

// "Delete pickup": a safe cancellation that keeps history and the donor's food request.
export async function cancelPickup(
  pickupId: string,
  input: { expectedVersion: number; reason: string }
): Promise<Pickup & { alreadyCancelled: boolean }> {
  return apiRequest<Pickup & { alreadyCancelled: boolean }>(`pickups/${pickupId}/cancel`, {
    method: 'POST', headers: await getAuthHeaders(), body: input,
  })
}
