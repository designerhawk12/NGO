import { Router, type RequestHandler } from 'express';
import {
  createDistributionCenterSchema, updateDistributionCenterSchema, uuidSchema,
  type AppUser, type CreateDistributionCenter, type UpdateDistributionCenter,
} from '@aaharaconnect/shared';
import { requireAuth } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { HttpError } from '../../middleware/errorHandler';
import { validateBody } from '../../middleware/validate';
import { sendSuccess } from '../../utils/response';
import * as service from './service';

export const distributionRoutes = Router();
const wrap = (run: (request: Parameters<RequestHandler>[0], response: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler =>
  async (request, response, next) => { try { await run(request, response); } catch (error) { next(error); } };
const idParam = (value: unknown): string => {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid identifier.');
  return parsed.data;
};

distributionRoutes.get('/', requireAuth, requireRole('ADMIN'), wrap(async (request, response) => {
  sendSuccess(response, { items: await service.listDistributionCenters(request.query.includeInactive === 'true') });
}));
distributionRoutes.post('/', requireAuth, requireRole('ADMIN'), validateBody(createDistributionCenterSchema), wrap(async (_request, response) => {
  const actor = response.locals.appUser as AppUser;
  sendSuccess(response, await service.createDistributionCenter(response.locals.validatedBody as CreateDistributionCenter, actor.id), 201);
}));
distributionRoutes.patch('/:id', requireAuth, requireRole('ADMIN'), validateBody(updateDistributionCenterSchema), wrap(async (request, response) => {
  sendSuccess(response, await service.updateDistributionCenter(idParam(request.params.id), response.locals.validatedBody as UpdateDistributionCenter));
}));
