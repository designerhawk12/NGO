import type { RequestHandler } from 'express';
import { uuidSchema, type AppUser, type CreateFoodRequest } from '@aaharaconnect/shared';
import { HttpError } from '../../middleware/errorHandler';
import { sendSuccess } from '../../utils/response';
import * as foodService from './service';
import { dispatchBestEffort } from '../push/service';
import type { ListFoodRequestsQuery } from './types';

export const createFoodRequestHandler: RequestHandler = async (_request, response, next) => {
  try {
    const user = response.locals.appUser as AppUser;
    const input = response.locals.validatedBody as CreateFoodRequest;
    const result = await foodService.createFoodRequest(user, input);
    await dispatchBestEffort();
    sendSuccess(response, result, 201);
  } catch (error) {
    next(error);
  }
};

export const getFoodRequestByIdHandler: RequestHandler = async (request, response, next) => {
  try {
    const parsedId = uuidSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Food request ID must be a valid UUID.');
    }
    const user = response.locals.appUser as AppUser;
    const result = await foodService.getFoodRequestById(parsedId.data, user);
    sendSuccess(response, result);
  } catch (error) {
    next(error);
  }
};

export const listFoodRequestsHandler: RequestHandler = async (request, response, next) => {
  try {
    const user = response.locals.appUser as AppUser;
    const query: ListFoodRequestsQuery = {};

    if (request.query.status === 'SUBMITTED' || request.query.status === 'CANCELLED') {
      query.status = request.query.status;
    }
    if (
      request.query.safetyReview === 'PENDING' ||
      request.query.safetyReview === 'APPROVED' ||
      request.query.safetyReview === 'REJECTED'
    ) {
      query.safetyReview = request.query.safetyReview;
    }
    if (request.query.limit) {
      const limit = parseInt(request.query.limit as string, 10);
      if (!isNaN(limit)) query.limit = limit;
    }

    const result = await foodService.listFoodRequests(user, query);
    sendSuccess(response, result);
  } catch (error) {
    next(error);
  }
};

export const cancelFoodRequestHandler: RequestHandler = async (request, response, next) => {
  try {
    const parsedId = uuidSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Food request ID must be a valid UUID.');
    }
    const user = response.locals.appUser as AppUser;
    const result = await foodService.cancelFoodRequest(parsedId.data, user);
    await dispatchBestEffort();
    sendSuccess(response, result);
  } catch (error) {
    next(error);
  }
};

export const safetyReviewHandler: RequestHandler = async (request, response, next) => {
  try {
    const parsedId = uuidSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Food request ID must be a valid UUID.');
    }
    const user = response.locals.appUser as AppUser;
    const body = response.locals.validatedBody as { review: 'APPROVED' | 'REJECTED' };
    const result = await foodService.reviewFoodSafety(parsedId.data, body.review, user);
    sendSuccess(response, result);
  } catch (error) {
    next(error);
  }
};
