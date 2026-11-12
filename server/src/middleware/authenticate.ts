import type { RequestHandler } from 'express';
import { findOrCreateAppUser } from '../auth/appUsers';
import { verifySupabaseToken } from '../auth/supabase';
import { HttpError } from './errorHandler';

export const requireAuth: RequestHandler = async (request, response, next) => {
  try {
    const header = request.header('Authorization');
    const match = header?.match(/^Bearer ([^\s]+)$/i);
    if (!match) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Your session has expired. Sign in again in Settings to continue.');
    }
    const identity = await verifySupabaseToken(match[1]);
    const appUser = await findOrCreateAppUser(identity.authUserId, identity.displayName);
    response.locals.appUser = appUser;
    const isCurrentUserStatusRead = request.baseUrl === '/api/v1' && request.path === '/me';
    // Narrow onboarding exception: identity service still verifies this user's pending application.
    const isOwnPendingIdentityWrite = appUser.volunteerApplicationStatus === 'PENDING'
      && request.method === 'PUT' && request.baseUrl === '/api/v1/volunteers' && request.path === '/me/identity';
    if (appUser.role === 'VOLUNTEER' && (appUser.volunteerApplicationStatus === 'PENDING' || appUser.volunteerApplicationStatus === 'DENIED') && !isCurrentUserStatusRead && !isOwnPendingIdentityWrite) {
      if (appUser.volunteerApplicationStatus === 'DENIED') {
        throw new HttpError(403, 'VOLUNTEER_APPLICATION_DENIED', 'The volunteer application was not approved.');
      }
      throw new HttpError(403, 'VOLUNTEER_PENDING_APPROVAL', 'The volunteer application is awaiting administrator approval.');
    }
    next();
  } catch (error) { next(error); }
};
