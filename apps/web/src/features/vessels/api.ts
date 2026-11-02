import { apiRequest } from '../../api/client';
import { getAuthHeaders } from '../pickups/adapters';
import type {
  CreateVessel,
  CreateVesselLog,
  IssueVessel,
  ListVesselsQuery,
  ReturnVessel,
  UpdateVessel,
  VesselItem,
  VesselLogItem,
  VesselsSummary,
} from '@aaharaconnect/shared';

export async function apiFetchVessels(params: Partial<ListVesselsQuery> = {}): Promise<{ items: VesselItem[] }> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.vesselType) query.set('vesselType', params.vesselType);
  if (params.status) query.set('status', params.status);
  if (params.cleaningStatus) query.set('cleaningStatus', params.cleaningStatus);
  if (params.temperatureSuitability) query.set('temperatureSuitability', params.temperatureSuitability);
  if (params.storageLocation) query.set('storageLocation', params.storageLocation);
  if (params.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  const path = qs ? `/vessels?${qs}` : '/vessels';
  const headers = await getAuthHeaders();
  return apiRequest<{ items: VesselItem[] }>(path, { headers });
}

export async function apiFetchVesselsSummary(): Promise<VesselsSummary> {
  const headers = await getAuthHeaders();
  return apiRequest<VesselsSummary>('/vessels/summary', { headers });
}

export async function apiFetchVesselById(id: string): Promise<VesselItem> {
  const headers = await getAuthHeaders();
  return apiRequest<VesselItem>(`/vessels/${id}`, { headers });
}

export async function apiCreateVessel(data: CreateVessel): Promise<VesselItem> {
  const headers = await getAuthHeaders();
  return apiRequest<VesselItem>('/vessels', {
    method: 'POST',
    headers,
    body: data,
  });
}

export async function apiUpdateVessel(id: string, data: UpdateVessel): Promise<VesselItem> {
  const headers = await getAuthHeaders();
  return apiRequest<VesselItem>(`/vessels/${id}`, {
    method: 'PATCH',
    headers,
    body: data,
  });
}

export async function apiDeleteVessel(id: string): Promise<{ deleted: boolean; id: string }> {
  const headers = await getAuthHeaders();
  return apiRequest<{ deleted: boolean; id: string }>(`/vessels/${id}`, {
    method: 'DELETE',
    headers,
  });
}

export async function apiIssueVessel(data: IssueVessel): Promise<{ success: boolean; issuanceId: string }> {
  const headers = await getAuthHeaders();
  return apiRequest<{ success: boolean; issuanceId: string }>('/vessels/issue', {
    method: 'POST',
    headers,
    body: data,
  });
}

export async function apiReturnVessel(vesselId: string, data: ReturnVessel): Promise<VesselItem> {
  const headers = await getAuthHeaders();
  return apiRequest<VesselItem>(`/vessels/${vesselId}/return`, {
    method: 'POST',
    headers,
    body: data,
  });
}

export async function apiFetchVesselLogs(vesselId: string): Promise<{ items: VesselLogItem[] }> {
  const headers = await getAuthHeaders();
  return apiRequest<{ items: VesselLogItem[] }>(`/vessels/${vesselId}/logs`, { headers });
}

export async function apiAddVesselLog(vesselId: string, data: CreateVesselLog): Promise<VesselLogItem> {
  const headers = await getAuthHeaders();
  return apiRequest<VesselLogItem>(`/vessels/${vesselId}/logs`, {
    method: 'POST',
    headers,
    body: data,
  });
}
