import type {
  CreateEmployeeDriver,
  DriverVehicleOption,
  EmployeeDriver,
  UpdateEmployeeDriver,
} from '@aaharaconnect/shared'
import { apiRequest } from '../../api/client'
import { getAuthHeaders } from '../pickups/adapters'

// NGO employee drivers (Module 5 registry). Each driver is linked to exactly one vehicle at
// registration; the API rejects any later attempt to change that vehicle.
export async function listDrivers(): Promise<EmployeeDriver[]> {
  const response = await apiRequest<{ items: EmployeeDriver[] }>('drivers', { headers: await getAuthHeaders() })
  return response.items
}

export async function listDriverVehicleOptions(): Promise<DriverVehicleOption[]> {
  const response = await apiRequest<{ items: DriverVehicleOption[] }>('drivers/vehicle-options', { headers: await getAuthHeaders() })
  return response.items
}

export async function createEmployeeDriver(input: CreateEmployeeDriver): Promise<EmployeeDriver> {
  return apiRequest<EmployeeDriver>('drivers', { method: 'POST', headers: await getAuthHeaders(), body: input })
}

export async function updateEmployeeDriver(driverId: string, input: UpdateEmployeeDriver): Promise<EmployeeDriver> {
  return apiRequest<EmployeeDriver>(`drivers/${encodeURIComponent(driverId)}`, {
    method: 'PATCH', headers: await getAuthHeaders(), body: input,
  })
}
