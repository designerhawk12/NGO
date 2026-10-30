import type { RequestHandler } from 'express';
import {
  createVesselLogSchema,
  createVesselSchema,
  issueVesselSchema,
  listVesselsQuerySchema,
  returnVesselSchema,
  updateVesselSchema,
  uuidSchema,
  type AppUser,
  type CreateVessel,
  type CreateVesselLog,
  type IssueVessel,
  type ReturnVessel,
  type UpdateVessel,
} from '@aaharaconnect/shared';
import { HttpError } from '../../middleware/errorHandler';
import { sendSuccess } from '../../utils/response';
import * as vesselService from './service';

export const listVesselsHandler: RequestHandler = async (request, response, next) => {
  try {
    const queryResult = listVesselsQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid query parameters.', [
        ...queryResult.error.issues.map(i => ({ field: i.path.join('.'), reason: i.message })),
      ]);
    }
    const result = await vesselService.listVessels(queryResult.data);
    sendSuccess(response, result);
  } catch (error) {
    next(error);
  }
};

export const getVesselsSummaryHandler: RequestHandler = async (_request, response, next) => {
  try {
    const summary = await vesselService.getVesselsSummary();
    sendSuccess(response, summary);
  } catch (error) {
    next(error);
  }
};

export const getVesselByIdHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Vessel ID must be a UUID.');
    }
    const vessel = await vesselService.getVesselById(idResult.data);
    sendSuccess(response, vessel);
  } catch (error) {
    next(error);
  }
};

export const createVesselHandler: RequestHandler = async (_request, response, next) => {
  try {
    const input = response.locals.validatedBody as CreateVessel;
    const vessel = await vesselService.createVessel(input);
    sendSuccess(response, vessel, 201);
  } catch (error) {
    next(error);
  }
};

export const updateVesselHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Vessel ID must be a UUID.');
    }
    const input = response.locals.validatedBody as UpdateVessel;
    const vessel = await vesselService.updateVessel(idResult.data, input);
    sendSuccess(response, vessel);
  } catch (error) {
    next(error);
  }
};

export const deleteVesselHandler: RequestHandler = async (request, response, next) => {
  try {
    const id = request.params.id;
    if (!id || typeof id !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Vessel identifier is required.');
    }
    await vesselService.deleteVessel(id);
    sendSuccess(response, { deleted: true, id });
  } catch (error) {
    next(error);
  }
};

export const issueVesselHandler: RequestHandler = async (_request, response, next) => {
  try {
    const input = response.locals.validatedBody as IssueVessel;
    const actor = response.locals.appUser as AppUser | undefined;
    const result = await vesselService.issueVessel(input, actor?.id);
    sendSuccess(response, result, 200);
  } catch (error) {
    next(error);
  }
};

export const returnVesselHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Vessel ID must be a UUID.');
    }
    const input = response.locals.validatedBody as ReturnVessel;
    const actor = response.locals.appUser as AppUser | undefined;
    const result = await vesselService.returnVessel(idResult.data, input, actor?.id);
    sendSuccess(response, result, 200);
  } catch (error) {
    next(error);
  }
};

export const addVesselLogHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Vessel ID must be a UUID.');
    }
    const input = response.locals.validatedBody as CreateVesselLog;
    const actor = response.locals.appUser as AppUser | undefined;
    const log = await vesselService.addVesselLog(idResult.data, input, actor?.id);
    sendSuccess(response, log, 201);
  } catch (error) {
    next(error);
  }
};

export const listVesselLogsHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Vessel ID must be a UUID.');
    }
    const logs = await vesselService.listVesselLogs(idResult.data);
    sendSuccess(response, { items: logs });
  } catch (error) {
    next(error);
  }
};
