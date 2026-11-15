import type { CreateDistributionCenter, DistributionCenter, UpdateDistributionCenter } from '@aaharaconnect/shared'
import { apiRequest } from '../../api/client'
import { getAuthHeaders } from '../pickups/adapters'

// Delivery destinations for scheduled pickups (stored in PostgreSQL, Admin-only API).
export async function listDistributionCenters(includeInactive = false): Promise<DistributionCenter[]> {
  const response = await apiRequest<{ items: DistributionCenter[] }>(
    `distribution-centers${includeInactive ? '?includeInactive=true' : ''}`, { headers: await getAuthHeaders() })
  return response.items
}
export async function createDistributionCenter(input: CreateDistributionCenter): Promise<DistributionCenter> {
  return apiRequest<DistributionCenter>('distribution-centers', { method: 'POST', headers: await getAuthHeaders(), body: input })
}
export async function updateDistributionCenter(id: string, input: UpdateDistributionCenter): Promise<DistributionCenter> {
  return apiRequest<DistributionCenter>(`distribution-centers/${encodeURIComponent(id)}`, { method: 'PATCH', headers: await getAuthHeaders(), body: input })
}
export const centerLabel = (center: Pick<DistributionCenter, 'name' | 'address'>) => center.name ? `${center.name} — ${center.address}` : center.address
