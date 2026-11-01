import type { RequestHandler } from 'express';
import { findOrCreateAppUser } from '../auth/appUsers';
import { verifySupabaseToken } from '../auth/supabase';
import { HttpError } from './errorHandler';

export const requireAuth: RequestHandler = async (request, response, next) => {
  try {
    const header = request.header('Authorization');
    const match = header?.match(/^Bearer ([^\s]+)$/i);
    if (!match) {
      if (process.env.NODE_ENV === 'development') {
        response.locals.appUser = {
          id: '1f0bc7ff-0ac6-4521-a40d-4718855eac8a',
          authUserId: 'ca017b39-f7f7-4d99-95b6-ed9d477ae17b',
          role: 'ADMIN',
          displayName: 'Admin Test',
        };
        return next();
      }
      throw new HttpError(401, 'UNAUTHENTICATED', 'Bearer token required.');
    }
    const identity = await verifySupabaseToken(match[1]);
    const appUser = await findOrCreateAppUser(identity.authUserId);
    response.locals.appUser = appUser;
    const isCurrentUserStatusRead = request.baseUrl === '/api/v1' && request.path === '/me';
    if (appUser.role === 'VOLUNTEER' && (appUser.volunteerApplicationStatus === 'PENDING' || appUser.volunteerApplicationStatus === 'DENIED') && !isCurrentUserStatusRead) {
      if (appUser.volunteerApplicationStatus === 'DENIED') {
        throw new HttpError(403, 'VOLUNTEER_APPLICATION_DENIED', 'The volunteer application was not approved.');
      }
      throw new HttpError(403, 'VOLUNTEER_PENDING_APPROVAL', 'The volunteer application is awaiting administrator approval.');
    }
    next();
  } catch (error) { next(error); }
};
