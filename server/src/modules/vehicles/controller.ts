import type { RequestHandler } from 'express';
import {
  listVehiclesQuerySchema,
  uuidSchema,
  type AppUser,
  type CreateEmployeeDriver,
  type UpdateEmployeeDriver,
  type CreateVehicle,
  type CreateVehicleMaintenanceRecord,
  type UpdateVehicle,
} from '@aaharaconnect/shared';
import { HttpError } from '../../middleware/errorHandler';
import { sendSuccess } from '../../utils/response';
import * as vehicleService from './service';

export const listVehiclesHandler: RequestHandler = async (request, response, next) => {
  try {
    const queryResult = listVehiclesQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid query parameters.', [
        ...queryResult.error.issues.map(i => ({ field: i.path.join('.'), reason: i.message })),
      ]);
    }
    const result = await vehicleService.listVehicles(queryResult.data);
    sendSuccess(response, result);
  } catch (error) {
    next(error);
  }
};

export const getFleetSummaryHandler: RequestHandler = async (_request, response, next) => {
  try {
    const summary = await vehicleService.getFleetSummary();
    sendSuccess(response, summary);
  } catch (error) {
    next(error);
  }
};

export const getVehicleByIdHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Vehicle ID must be a UUID.');
    }
    const vehicle = await vehicleService.getVehicleById(idResult.data);
    sendSuccess(response, vehicle);
  } catch (error) {
    next(error);
  }
};

export const createVehicleHandler: RequestHandler = async (_request, response, next) => {
  try {
    const input = response.locals.validatedBody as CreateVehicle;
    const vehicle = await vehicleService.createVehicle(input);
    sendSuccess(response, vehicle, 201);
  } catch (error) {
    next(error);
  }
};

export const updateVehicleHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Vehicle ID must be a UUID.');
    }
    const input = response.locals.validatedBody as UpdateVehicle;
    const vehicle = await vehicleService.updateVehicle(idResult.data, input);
    sendSuccess(response, vehicle);
  } catch (error) {
    next(error);
  }
};

export const listMaintenanceHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Vehicle ID must be a UUID.');
    }
    const history = await vehicleService.listMaintenanceHistory(idResult.data);
    sendSuccess(response, { items: history });
  } catch (error) {
    next(error);
  }
};

export const createMaintenanceHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Vehicle ID must be a UUID.');
    }
    const input = response.locals.validatedBody as CreateVehicleMaintenanceRecord;
    const actor = response.locals.appUser as AppUser | undefined;
    const record = await vehicleService.createMaintenanceRecord(idResult.data, input, actor?.id);
    sendSuccess(response, record, 201);
  } catch (error) {
    next(error);
  }
};

export const listDriversHandler: RequestHandler = async (_request, response, next) => {
  try {
    const drivers = await vehicleService.listDrivers();
    sendSuccess(response, { items: drivers });
  } catch (error) {
    next(error);
  }
};

export const listDriverVehicleOptionsHandler: RequestHandler = async (_request, response, next) => {
  try {
    sendSuccess(response, { items: await vehicleService.listVehicleOptionsForDriver() });
  } catch (error) {
    next(error);
  }
};

export const getDriverHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Driver ID must be a UUID.');
    sendSuccess(response, await vehicleService.getDriver(idResult.data));
  } catch (error) {
    next(error);
  }
};

export const createEmployeeDriverHandler: RequestHandler = async (_request, response, next) => {
  try {
    const actor = response.locals.appUser as AppUser | undefined;
    if (!actor?.id) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
    const input = response.locals.validatedBody as CreateEmployeeDriver;
    sendSuccess(response, await vehicleService.registerEmployeeDriver(input, actor.id), 201);
  } catch (error) {
    next(error);
  }
};

export const updateEmployeeDriverHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Driver ID must be a UUID.');
    const input = response.locals.validatedBody as UpdateEmployeeDriver;
    sendSuccess(response, await vehicleService.editEmployeeDriver(idResult.data, input));
  } catch (error) {
    next(error);
  }
};

// Reject any attempt to change the fixed vehicle before generic validation, with a clear code.
export const rejectFixedVehicleChange: RequestHandler = (request, _response, next) => {
  const body = request.body as Record<string, unknown> | undefined;
  if (body && typeof body === 'object' && ['vehicleId', 'assignedVehicleId', 'vehicleRegistrationNumber'].some(key => key in body)) {
    next(new HttpError(409, 'FIXED_VEHICLE_IMMUTABLE', 'A driver’s vehicle is fixed when the driver is registered and cannot be changed.'));
    return;
  }
  next();
};

export const deleteVehicleHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Vehicle ID must be a UUID.');
    }
    await vehicleService.removeVehicle(idResult.data);
    sendSuccess(response, { success: true });
  } catch (error) {
    next(error);
  }
};
