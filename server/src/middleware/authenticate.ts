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
    response.locals.appUser = await findOrCreateAppUser(identity.authUserId);
    next();
  } catch (error) { next(error); }
};
