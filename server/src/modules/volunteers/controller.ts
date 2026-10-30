import type { RequestHandler } from 'express';
import { uuidSchema, type AppUser, type CreateAvailabilityRequest } from '@aaharaconnect/shared';
import { HttpError } from '../../middleware/errorHandler';
import { sendSuccess } from '../../utils/response';
import * as volunteerService from './service';
import {
  listTeamsQuerySchema,
  listVolunteersQuerySchema,
  type CreateAdminVolunteerInput,
  type CreateTeamInput,
  type UpdateAdminVolunteerInput,
  type SetAdminVolunteerPasswordInput,
  type UpdateOwnProfileInput,
  type UpdateTeamInput,
} from './schemas';

export const getOwnProfileHandler: RequestHandler = async (_request, response, next) => {
  try {
    const actor = response.locals.appUser as AppUser;
    sendSuccess(response, await volunteerService.getOwnProfile(actor));
  } catch (error) { next(error); }
};

export const listOwnTeamsHandler: RequestHandler = async (request, response, next) => {
  try {
    if (Object.keys(request.query).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Team query is invalid.');
    sendSuccess(response, await volunteerService.listOwnTeams(response.locals.appUser as AppUser));
  } catch (error) { next(error); }
};

export const updateOwnProfileHandler: RequestHandler = async (_request, response, next) => {
  try {
    const actor = response.locals.appUser as AppUser;
    const input = response.locals.validatedBody as UpdateOwnProfileInput;
    sendSuccess(response, await volunteerService.updateOwnProfile(actor, input));
  } catch (error) { next(error); }
};

export const listOwnAvailabilityHandler: RequestHandler = async (_request, response, next) => {
  try {
    const actor = response.locals.appUser as AppUser;
    sendSuccess(response, await volunteerService.listOwnAvailability(actor));
  } catch (error) { next(error); }
};

export const createOwnAvailabilityHandler: RequestHandler = async (_request, response, next) => {
  try {
    const actor = response.locals.appUser as AppUser;
    const input = response.locals.validatedBody as CreateAvailabilityRequest;
    sendSuccess(response, await volunteerService.createOwnAvailability(actor, input), 201);
  } catch (error) { next(error); }
};

export const replaceOwnAvailabilityHandler: RequestHandler = async (request, response, next) => {
  try {
    const id = uuidSchema.safeParse(request.params.id);
    if (!id.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Availability ID must be a UUID.');
    const actor = response.locals.appUser as AppUser;
    const input = response.locals.validatedBody as CreateAvailabilityRequest;
    sendSuccess(response, await volunteerService.replaceOwnAvailability(actor, id.data, input));
  } catch (error) { next(error); }
};

export const listAdminVolunteersHandler: RequestHandler = async (request, response, next) => {
  try {
    const query = listVolunteersQuerySchema.safeParse(request.query);
    if (!query.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Volunteer query is invalid.');
    sendSuccess(response, await volunteerService.listAdminVolunteers(response.locals.appUser as AppUser, query.data));
  } catch (error) { next(error); }
};

export const getAdminVolunteerHandler: RequestHandler = async (request, response, next) => {
  try {
    const id = uuidSchema.safeParse(request.params.id);
    if (!id.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Volunteer ID must be a UUID.');
    sendSuccess(response, await volunteerService.getAdminVolunteer(response.locals.appUser as AppUser, id.data));
  } catch (error) { next(error); }
};

export const createAdminVolunteerHandler: RequestHandler = async (_request, response, next) => {
  try {
    sendSuccess(response, await volunteerService.createAdminVolunteer(
      response.locals.appUser as AppUser, response.locals.validatedBody as CreateAdminVolunteerInput
    ), 201);
  } catch (error) { next(error); }
};

export const updateAdminVolunteerHandler: RequestHandler = async (request, response, next) => {
  try {
    const id = uuidSchema.safeParse(request.params.id);
    if (!id.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Volunteer ID must be a UUID.');
    sendSuccess(response, await volunteerService.updateAdminVolunteer(
      response.locals.appUser as AppUser, id.data, response.locals.validatedBody as UpdateAdminVolunteerInput
    ));
  } catch (error) { next(error); }
};

export const setAdminVolunteerPasswordHandler: RequestHandler = async (request, response, next) => {
  try {
    const id = uuidSchema.safeParse(request.params.id);
    if (!id.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Volunteer ID must be a UUID.');
    const input = response.locals.validatedBody as SetAdminVolunteerPasswordInput;
    await volunteerService.setAdminVolunteerPassword(response.locals.appUser as AppUser, id.data, input.password);
    sendSuccess(response, { message: 'Volunteer password updated.' });
  } catch (error) { next(error); }
};

export const listAdminTeamsHandler: RequestHandler = async (request, response, next) => {
  try {
    const query = listTeamsQuerySchema.safeParse(request.query);
    if (!query.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Team query is invalid.');
    sendSuccess(response, await volunteerService.listAdminTeams(response.locals.appUser as AppUser, query.data));
  } catch (error) { next(error); }
};

export const getAdminTeamHandler: RequestHandler = async (request, response, next) => {
  try {
    const id = uuidSchema.safeParse(request.params.id);
    if (!id.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Team ID must be a UUID.');
    sendSuccess(response, await volunteerService.getAdminTeam(response.locals.appUser as AppUser, id.data));
  } catch (error) { next(error); }
};

export const createAdminTeamHandler: RequestHandler = async (_request, response, next) => {
  try {
    sendSuccess(response, await volunteerService.createAdminTeam(
      response.locals.appUser as AppUser, response.locals.validatedBody as CreateTeamInput
    ), 201);
  } catch (error) { next(error); }
};

export const updateAdminTeamHandler: RequestHandler = async (request, response, next) => {
  try {
    const id = uuidSchema.safeParse(request.params.id);
    if (!id.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Team ID must be a UUID.');
    sendSuccess(response, await volunteerService.updateAdminTeam(
      response.locals.appUser as AppUser, id.data, response.locals.validatedBody as UpdateTeamInput
    ));
  } catch (error) { next(error); }
};
