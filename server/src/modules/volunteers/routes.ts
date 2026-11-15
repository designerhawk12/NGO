import { Router } from 'express';
import { z } from 'zod';
import { identityProofSchema, uuidSchema } from '@aaharaconnect/shared';
import { identityForAdmin, reviewIdentity, replaceOwnIdentity } from './identity';
import { sendSuccess } from '../../utils/response';
import { isPublicVolunteerRegistrationEnabled } from '../../config/env';
import { requireAuth } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { HttpError } from '../../middleware/errorHandler';
import { validateBody } from '../../middleware/validate';
import {
  deleteAdminTeamHandler,
  createAdminTeamHandler,
  createAdminVolunteerHandler,
  decideAdminVolunteerApplicationHandler,
  createOwnAvailabilityHandler,
  getAdminTeamHandler,
  getAdminVolunteerHandler,
  getAdminVolunteerDriverDetailsHandler,
  getOwnProfileHandler,
  listAdminTeamsHandler,
  listAdminVolunteerApplicationsHandler,
  listAdminVolunteersHandler,
  listOwnAvailabilityHandler,
  listOwnTeamsHandler,
  replaceOwnAvailabilityHandler,
  registerVolunteerHandler,
  updateAdminTeamHandler,
  updateAdminVolunteerHandler,
  updateOwnProfileHandler,
} from './controller';
import {
  availabilityWriteSchema,
  createSelfRegistrationSchema,
  createTeamSchema,
  decideVolunteerApplicationSchema,
  updateAdminVolunteerSchema,
  updateOwnProfileSchema,
  updateTeamSchema,
} from './schemas';

export const volunteerRoutes = Router();
const selfProfileRoutes = Router();
const teamRoutes = Router();

selfProfileRoutes.get('/:id/identity', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-store'); sendSuccess(res, await identityForAdmin(uuidSchema.parse(req.params.id))); }
  catch (error) { next(error); }
});
selfProfileRoutes.post('/:id/identity/review', requireAuth, requireRole('ADMIN'), validateBody(z.strictObject({ status: z.enum(['VERIFIED','REJECTED']), reason: z.string().trim().min(1).max(500) })), async (req, res, next) => {
  try { sendSuccess(res, await reviewIdentity(uuidSchema.parse(req.params.id), res.locals.appUser.id, res.locals.validatedBody.status, res.locals.validatedBody.reason)); }
  catch (error) { next(error); }
});
selfProfileRoutes.put('/me/identity', requireAuth, validateBody(identityProofSchema), async (_req, res, next) => {
  try {
    if (res.locals.appUser.role !== 'VOLUNTEER') throw new HttpError(403, 'FORBIDDEN', 'A Volunteer account is required.');
    sendSuccess(res, await replaceOwnIdentity(res.locals.appUser.id, res.locals.validatedBody));
  } catch (error) { next(error); }
});

selfProfileRoutes.get('/me', requireAuth, requireRole('VOLUNTEER'), getOwnProfileHandler);
selfProfileRoutes.post('/register', (_request, _response, next) => {
  if (!isPublicVolunteerRegistrationEnabled()) {
    next(new HttpError(403, 'REGISTRATION_DISABLED', 'Public Volunteer registration is unavailable. Ask an administrator for an invitation.'));
    return;
  }
  next();
}, validateBody(createSelfRegistrationSchema), registerVolunteerHandler);
selfProfileRoutes.get('/applications', requireAuth, requireRole('ADMIN'), listAdminVolunteerApplicationsHandler);
selfProfileRoutes.patch('/:id/approval', requireAuth, requireRole('ADMIN'), validateBody(decideVolunteerApplicationSchema), decideAdminVolunteerApplicationHandler);
selfProfileRoutes.patch('/me', requireAuth, requireRole('VOLUNTEER'), validateBody(updateOwnProfileSchema), updateOwnProfileHandler);
selfProfileRoutes.get('/me/availability', requireAuth, requireRole('VOLUNTEER'), listOwnAvailabilityHandler);
selfProfileRoutes.get('/me/teams', requireAuth, requireRole('VOLUNTEER'), listOwnTeamsHandler);
selfProfileRoutes.post('/me/availability', requireAuth, requireRole('VOLUNTEER'), validateBody(availabilityWriteSchema), createOwnAvailabilityHandler);
selfProfileRoutes.patch('/me/availability/:id', requireAuth, requireRole('VOLUNTEER'), validateBody(availabilityWriteSchema), replaceOwnAvailabilityHandler);
selfProfileRoutes.get('/', requireAuth, requireRole('ADMIN'), listAdminVolunteersHandler);
// Retired: answers 410 so old clients get a clear message; it never creates accounts.
selfProfileRoutes.post('/', requireAuth, requireRole('ADMIN'), createAdminVolunteerHandler);
selfProfileRoutes.get('/:id/driver-details', requireAuth, requireRole('ADMIN'), getAdminVolunteerDriverDetailsHandler);
selfProfileRoutes.get('/:id', requireAuth, requireRole('ADMIN'), getAdminVolunteerHandler);
selfProfileRoutes.patch('/:id', requireAuth, requireRole('ADMIN'), validateBody(updateAdminVolunteerSchema), updateAdminVolunteerHandler);

teamRoutes.get('/', requireAuth, requireRole('ADMIN'), listAdminTeamsHandler);
teamRoutes.get('/:id', requireAuth, requireRole('ADMIN'), getAdminTeamHandler);
teamRoutes.post('/', requireAuth, requireRole('ADMIN'), validateBody(createTeamSchema), createAdminTeamHandler);
teamRoutes.patch('/:id', requireAuth, requireRole('ADMIN'), validateBody(updateTeamSchema), updateAdminTeamHandler);
teamRoutes.delete('/:id', requireAuth, requireRole('ADMIN'), deleteAdminTeamHandler);

// The central router mounts this module at both /volunteers and /teams.
volunteerRoutes.use((request, response, next) => {
  if (request.baseUrl.endsWith('/volunteers')) return selfProfileRoutes(request, response, next);
  if (request.baseUrl.endsWith('/teams')) {
    if (request.path === '/me' || request.path.startsWith('/me/')) return next();
    return teamRoutes(request, response, next);
  }
  next();
});
