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
    response.locals.appUser = await findOrCreateAppUser(identity.authUserId);
    next();
  } catch (error) { next(error); }
};
