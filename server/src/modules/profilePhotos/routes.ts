import { Router, type RequestHandler } from 'express';
import { profilePhotoLookupSchema, type ProfilePhotoLookup, uploadProfilePhotoSchema, type AppUser, type UploadProfilePhoto } from '@aaharaconnect/shared';
import { requireAuth } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { sendSuccess } from '../../utils/response';
import * as service from './service';

export const profilePhotoRoutes = Router();
const wrap = (run: (response: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler =>
  async (_request, response, next) => { try { await run(response); } catch (error) { next(error); } };

// Self-service only: there is no user id in the URL, so one user can never change another's photo.
profilePhotoRoutes.get('/me', requireAuth, wrap(async response => {
  sendSuccess(response, { photoUrl: await service.getOwnPhotoUrl((response.locals.appUser as AppUser).id) });
}));
profilePhotoRoutes.put('/me', requireAuth, validateBody(uploadProfilePhotoSchema), wrap(async response => {
  const actor = response.locals.appUser as AppUser;
  sendSuccess(response, { photoUrl: await service.setOwnPhoto(actor.id, response.locals.validatedBody as UploadProfilePhoto) });
}));
profilePhotoRoutes.post('/lookup', requireAuth, requireRole('ADMIN'), validateBody(profilePhotoLookupSchema), wrap(async response => {
  sendSuccess(response, await service.lookupPhotoUrls(response.locals.validatedBody as ProfilePhotoLookup));
}));
