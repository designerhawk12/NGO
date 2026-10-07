import { apiRequest } from '../../api/client'
import { getLiveAccessToken } from './adapters'
import type {
  CreateAssignmentInput,
  CreatePickupInput,
  LiveAssignment,
  Pickup,
  VehicleAssignmentSummary,
} from './types'

function getAuthHeaders(): Record<string, string> {
  const token = getLiveAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchPickups(
  cursor?: string | null
): Promise<{ items: Pickup[]; nextCursor: string | null }> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return apiRequest<{ items: Pickup[]; nextCursor: string | null }>(`pickups${query}`, {
    headers: getAuthHeaders(),
  })
}

export async function fetchPickupById(id: string): Promise<Pickup> {
  return apiRequest<Pickup>(`pickups/${id}`, {
    headers: getAuthHeaders(),
  })
}

export async function createPickup(input: CreatePickupInput): Promise<Pickup> {
  return apiRequest<Pickup>('pickups', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: input,
  })
}

export async function createAssignment(
  pickupId: string,
  input: CreateAssignmentInput,
  idempotencyKey: string
): Promise<LiveAssignment> {
  return apiRequest<LiveAssignment>(`pickups/${pickupId}/assignments`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Idempotency-Key': idempotencyKey,
    },
    body: input,
  })
}

export async function transitionAssignment(
  assignmentId: string,
  action: 'DELIVER' | 'CANCEL' | 'FAIL',
  expectedVersion: number,
  reason?: string
): Promise<LiveAssignment> {
  return apiRequest<LiveAssignment>(`assignments/${assignmentId}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
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
      headers: getAuthHeaders(),
    }
  )
  return response.items || []
}
