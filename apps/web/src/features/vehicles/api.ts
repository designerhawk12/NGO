import { apiRequest } from '../../api/client';
import { getLiveAccessToken } from '../pickups/adapters';
import type {
  CreateVehicle,
  CreateVehicleMaintenanceRecord,
  FleetSummary,
  ListVehiclesQuery,
  UpdateVehicle,
  VehicleReadiness,
} from '@aaharaconnect/shared';

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const token = await getLiveAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export interface ApiVehicleItem {
  photoDataUrl?: string | null;
  id: string;
  registrationNumber: string;
  kind: string;
  capacityKg: number;
  status: 'ACTIVE' | 'MAINTENANCE' | 'RETIRED';
  sizeCategory: 'SMALL' | 'MEDIUM' | 'LARGE' | null;
  indicativeMaxVessels: number | null;
  createdAt: string;
  readiness: VehicleReadiness;
  currentDriver: {
    driverId: string;
    name: string;
    phone: string | null;
    licenceNumber: string;
  } | null;
  currentAssignment: {
    assignmentId: string;
    pickupId: string;
    status: string;
    windowStartsAt: string;
    windowEndsAt: string;
  } | null;
  latestMaintenance: {
    servicedOn: string;
    condition: 'GOOD' | 'NEEDS_SERVICE' | 'UNSAFE';
    summary: string;
    nextServiceDueOn: string | null;
  } | null;
}

export interface ApiDriverItem {
  driverId: string;
  personId: string;
  name: string;
  phone: string;
  licenceNumber: string;
  licenceExpiresOn: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface ApiMaintenanceItem {
  id: string;
  vehicleId: string;
  servicedOn: string;
  condition: 'GOOD' | 'NEEDS_SERVICE' | 'UNSAFE';
  summary: string;
  nextServiceDueOn: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export async function fetchVehicles(
  query?: ListVehiclesQuery
): Promise<{ items: ApiVehicleItem[]; nextCursor: string | null }> {
  const searchParams = new URLSearchParams();
  if (query?.cursor) searchParams.set('cursor', query.cursor);
  if (query?.limit) searchParams.set('limit', String(query.limit));
  if (query?.status) searchParams.set('status', query.status);
  if (query?.kind) searchParams.set('kind', query.kind);
  if (query?.search) searchParams.set('search', query.search);

  const qs = searchParams.toString();
  const endpoint = qs ? `vehicles?${qs}` : 'vehicles';

  return apiRequest<{ items: ApiVehicleItem[]; nextCursor: string | null }>(endpoint, {
    headers: await getAuthHeaders(),
  });
}

export async function fetchFleetSummary(): Promise<FleetSummary> {
  return apiRequest<FleetSummary>('vehicles/summary', {
    headers: await getAuthHeaders(),
  });
}

export async function fetchVehicleById(id: string): Promise<ApiVehicleItem> {
  return apiRequest<ApiVehicleItem>(`vehicles/${id}`, {
    headers: await getAuthHeaders(),
  });
}

export async function createVehicle(input: CreateVehicle): Promise<ApiVehicleItem> {
  return apiRequest<ApiVehicleItem>('vehicles', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: input,
  });
}

export async function updateVehicle(id: string, input: UpdateVehicle): Promise<ApiVehicleItem> {
  return apiRequest<ApiVehicleItem>(`vehicles/${id}`, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: input,
  });
}

export async function fetchVehicleMaintenance(vehicleId: string): Promise<{ items: ApiMaintenanceItem[] }> {
  return apiRequest<{ items: ApiMaintenanceItem[] }>(`vehicles/${vehicleId}/maintenance`, {
    headers: await getAuthHeaders(),
  });
}

export async function createVehicleMaintenance(
  vehicleId: string,
  input: CreateVehicleMaintenanceRecord
): Promise<ApiMaintenanceItem> {
  return apiRequest<ApiMaintenanceItem>(`vehicles/${vehicleId}/maintenance`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: input,
  });
}

export async function fetchDrivers(): Promise<{ items: ApiDriverItem[] }> {
  return apiRequest<{ items: ApiDriverItem[] }>('drivers', {
    headers: await getAuthHeaders(),
  });
}

export async function deleteVehicle(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`vehicles/${id}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });
}
export interface ApiVehicleLocation {
  id: string;
  vehicleId: string;
  pickupId: string;
  latitude: number;
  longitude: number;
  recordedAt: string;
  expiresAt: string;
}

export async function fetchVehicleLocations(
  vehicleId: string
): Promise<{ items: ApiVehicleLocation[] }> {
  return apiRequest<{ items: ApiVehicleLocation[] }>(
    `vehicles/${encodeURIComponent(vehicleId)}/locations`,
    {
      headers: await getAuthHeaders(),
    }
  );
}