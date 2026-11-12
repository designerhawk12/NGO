import { Router } from 'express';
import { trackingConsentInputSchema, vehicleLocationInputSchema, uuidSchema } from '@aaharaconnect/shared';
import { requireAuth } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { HttpError } from '../../middleware/errorHandler';
import { sendSuccess } from '../../utils/response';
import { startSharing, stopSharing, reportLocation, listFleetLocations } from './service';

export const vehicleTrackingRoutes = Router();
export const pickupTrackingRoutes = Router();
function id(value: unknown) {
  const result = uuidSchema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'VALIDATION_ERROR', 'A UUID is required.');
  return result.data;
}
pickupTrackingRoutes.post('/:id/tracking-consent', requireAuth, requireRole('DRIVER'), validateBody(trackingConsentInputSchema), async (req, res, next) => {
  try {
    const pickupId = id(req.params.id);
    if (res.locals.validatedBody.pickupId !== pickupId) throw new HttpError(400, 'VALIDATION_ERROR', 'Pickup ID mismatch.');
    sendSuccess(res, await startSharing(res.locals.appUser.id, pickupId));
  } catch (error) { next(error); }
});
pickupTrackingRoutes.delete('/:id/tracking-consent', requireAuth, requireRole('DRIVER'), async (req, res, next) => {
  try { await stopSharing(res.locals.appUser.id, id(req.params.id)); res.status(204).end(); }
  catch (error) { next(error); }
});
vehicleTrackingRoutes.post('/:id/locations', requireAuth, requireRole('DRIVER'), validateBody(vehicleLocationInputSchema), async (req, res, next) => {
  try { sendSuccess(res, await reportLocation(res.locals.appUser.id, id(req.params.id), res.locals.validatedBody)); }
  catch (error) { next(error); }
});
vehicleTrackingRoutes.get('/tracking', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-store'); sendSuccess(res, await listFleetLocations()); }
  catch (error) { next(error); }
});
