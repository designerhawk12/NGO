import type { RequestHandler } from 'express';
import {
  pageQuerySchema,
  uuidSchema,
  type AppUser,
  type AssignmentTransition,
  type CancelPickup,
  type CreateAssignment,
  type CreatePickup,
  type UpdatePickup,
} from '@aaharaconnect/shared';
import { HttpError } from '../../middleware/errorHandler';
import { sendSuccess } from '../../utils/response';
import * as pickupService from './service';

export const createPickupHandler: RequestHandler = async (_request, response, next) => {
  try {
    const input = response.locals.validatedBody as CreatePickup;
    const actor = response.locals.appUser as AppUser | undefined;
    const pickup = await pickupService.createPickup(input, actor?.id);
    sendSuccess(response, pickup, 201);
  } catch (error) {
    next(error);
  }
};

export const createAssignmentHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Pickup ID must be a UUID.');
    }

    const idempotencyKey = request.header('Idempotency-Key');
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Idempotency-Key header is required.');
    }

    const actor = response.locals.appUser as AppUser | undefined;
    if (!actor?.id) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
    }

    const input = response.locals.validatedBody as CreateAssignment;
    const result = await pickupService.createAssignment(
      idResult.data,
      input,
      idempotencyKey.trim(),
      actor.id
    );

    sendSuccess(response, result.assignment, result.isReplay ? 200 : 201);
  } catch (error) {
    next(error);
  }
};

export const getPickupByIdHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Pickup ID must be a UUID.');
    }
    const pickup = await pickupService.getPickupById(idResult.data);
    sendSuccess(response, pickup);
  } catch (error) {
    next(error);
  }
};

export const getEligibleVolunteersForPickupHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Pickup ID must be a UUID.');
    sendSuccess(response, await pickupService.listEligibleVolunteersForPickup(idResult.data));
  } catch (error) {
    next(error);
  }
};

export const listPickupsHandler: RequestHandler = async (request, response, next) => {
  try {
    const parsed = pageQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid pagination query parameters.',
        parsed.error.issues.map(issue => ({ field: issue.path.join('.'), reason: issue.message }))
      );
    }
    const page = await pickupService.listPickups(parsed.data);
    sendSuccess(response, page);
  } catch (error) {
    next(error);
  }
};

export const updateAssignmentStatusHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Assignment ID must be a UUID.');
    }

    const actor = response.locals.appUser as AppUser | undefined;
    if (!actor?.id) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
    }

    const input = response.locals.validatedBody as AssignmentTransition;
    const assignment = await pickupService.transitionAssignmentStatus({
      assignmentId: idResult.data,
      input,
      actor,
    });

    sendSuccess(response, assignment);
  } catch (error) {
    next(error);
  }
};

export const getVolunteerAssignmentsHandler: RequestHandler = async (_request, response, next) => {
  try {
    const actor = response.locals.appUser as AppUser | undefined;
    if (!actor?.id) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
    }
    if (actor.role !== 'VOLUNTEER') {
      throw new HttpError(403, 'FORBIDDEN', 'Only volunteers can access their assignments.');
    }

    const page = await pickupService.getVolunteerAssignments(actor.id);
    sendSuccess(response, page);
  } catch (error) {
    next(error);
  }
};

function parsePickupId(value: unknown): string {
  const idResult = uuidSchema.safeParse(value);
  if (!idResult.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Pickup ID must be a UUID.');
  return idResult.data;
}

function requireActor(response: Parameters<RequestHandler>[1]): AppUser {
  const actor = response.locals.appUser as AppUser | undefined;
  if (!actor?.id) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
  return actor;
}

export const getDriverOptionsHandler: RequestHandler = async (request, response, next) => {
  try {
    sendSuccess(response, await pickupService.getDriverOptionsForPickup(parsePickupId(request.params.id)));
  } catch (error) {
    next(error);
  }
};

export const getContainerOptionsHandler: RequestHandler = async (request, response, next) => {
  try {
    const driverId = uuidSchema.safeParse(request.query.driverId);
    if (!driverId.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a driver (driverId) before planning containers.');
    sendSuccess(response, await pickupService.getContainerOptionsForPickup(parsePickupId(request.params.id), driverId.data));
  } catch (error) {
    next(error);
  }
};

export const updatePickupHandler: RequestHandler = async (request, response, next) => {
  try {
    const pickupId = parsePickupId(request.params.id);
    const input = response.locals.validatedBody as UpdatePickup;
    sendSuccess(response, await pickupService.updatePickup(pickupId, input, requireActor(response)));
  } catch (error) {
    next(error);
  }
};

export const cancelPickupHandler: RequestHandler = async (request, response, next) => {
  try {
    const pickupId = parsePickupId(request.params.id);
    const input = response.locals.validatedBody as CancelPickup;
    sendSuccess(response, await pickupService.cancelPickup(pickupId, input, requireActor(response)));
  } catch (error) {
    next(error);
  }
};

export const getActiveAssignmentHandler: RequestHandler = async (request, response, next) => {
  try {
    const idResult = uuidSchema.safeParse(request.params.id);
    if (!idResult.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Pickup ID must be a UUID.');
    }

    const assignment = await pickupService.getActiveAssignmentForPickup(idResult.data);
    sendSuccess(response, assignment);
  } catch (error) {
    next(error);
  }
};
