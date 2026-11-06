import { Router } from 'express';
import { assignableAppRoleSchema, uuidSchema, type AppRole, type AppUser } from '@aaharaconnect/shared';
import { setAppUserRole } from '../auth/appUsers';
import { requireAuth } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { HttpError } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { sendSuccess } from '../utils/response';
import { z } from 'zod';

export const authRouter = Router();
authRouter.get('/me', requireAuth, (_request, response) => sendSuccess(response, response.locals.appUser as AppUser));
authRouter.patch('/admin/users/:id/role', requireAuth, requireRole('ADMIN'), validateBody(z.object({ role: assignableAppRoleSchema })), async (request, response, next) => {
  try {
    const id = uuidSchema.safeParse(request.params.id);
    if (!id.success) throw new HttpError(400, 'VALIDATION_ERROR', 'User ID must be a UUID.');
    const role = (response.locals.validatedBody as { role: AppRole }).role;
    const actor = response.locals.appUser as AppUser;
    sendSuccess(response, await setAppUserRole(id.data, role, actor.id));
  } catch (error) { next(error); }
});
