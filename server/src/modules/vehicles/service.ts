import type { PoolClient } from 'pg';
import { HttpError } from '../../middleware/errorHandler';
import type {
  CreateVehicle,
  CreateVehicleMaintenanceRecord,
  FleetSummary,
  ListVehiclesQuery,
  UpdateVehicle,
} from '@aaharaconnect/shared';
import type { CreateEmployeeDriver, UpdateEmployeeDriver } from '@aaharaconnect/shared';
import * as vehicleRepo from './repository';
import {
  createEmployeeDriver,
  findDriverWithVehicle,
  listDriversWithVehicles,
  listVehicleOptionsForNewDriver,
  updateEmployeeDriver,
} from './employeeDrivers';

export async function listVehicles(params: ListVehiclesQuery, client?: PoolClient) {
  return vehicleRepo.listVehicles(params, client);
}

export async function getVehicleById(id: string, client?: PoolClient) {
  const vehicle = await vehicleRepo.findVehicleById(id, client);
  if (!vehicle) {
    throw new HttpError(404, 'NOT_FOUND', 'Vehicle not found.');
  }
  return vehicle;
}

export async function createVehicle(input: CreateVehicle, client?: PoolClient) {
  const vehicle = await vehicleRepo.createVehicle(input, client);
  if (!vehicle) {
    throw new HttpError(500, 'INTERNAL_ERROR', 'Failed to retrieve vehicle after creation.');
  }
  return vehicle;
}

export async function updateVehicle(
  id: string,
  patch: UpdateVehicle,
  client?: PoolClient
) {
  const existing = await vehicleRepo.findVehicleById(id, client);
  if (!existing) {
    throw new HttpError(404, 'NOT_FOUND', 'Vehicle not found.');
  }
  const updated = await vehicleRepo.updateVehicle(id, patch, client);
  if (!updated) {
    throw new HttpError(404, 'NOT_FOUND', 'Vehicle not found.');
  }
  return updated;
}

export async function getFleetSummary(client?: PoolClient): Promise<FleetSummary> {
  return vehicleRepo.getFleetSummary(client);
}

export async function listMaintenanceHistory(vehicleId: string, client?: PoolClient) {
  // Confirm vehicle exists
  await getVehicleById(vehicleId, client);
  return vehicleRepo.listMaintenanceHistory(vehicleId, client);
}

export async function createMaintenanceRecord(
  vehicleId: string,
  input: CreateVehicleMaintenanceRecord,
  actorId?: string,
  client?: PoolClient
) {
  return vehicleRepo.createMaintenanceRecord(vehicleId, input, actorId ?? null, client);
}

export async function listDrivers(client?: PoolClient) {
  return listDriversWithVehicles(client);
}

export async function listVehicleOptionsForDriver(client?: PoolClient) {
  return listVehicleOptionsForNewDriver(client);
}

export async function registerEmployeeDriver(input: CreateEmployeeDriver, actorUserId: string, client?: PoolClient) {
  return createEmployeeDriver(input, actorUserId, client);
}

export async function editEmployeeDriver(driverId: string, input: UpdateEmployeeDriver, client?: PoolClient) {
  return updateEmployeeDriver(driverId, input, client);
}

export async function getDriver(driverId: string, client?: PoolClient) {
  const driver = await findDriverWithVehicle(driverId, client);
  if (!driver) throw new HttpError(404, 'DRIVER_NOT_FOUND', 'Driver not found.');
  return driver;
}

export async function removeVehicle(id: string, client?: PoolClient) {
  return vehicleRepo.deleteVehicle(id, client);
}
