import { Router } from 'express';
import {
  assignmentTransitionSchema,
  cancelPickupSchema,
  createAssignmentSchema,
  createPickupSchema,
  updatePickupSchema,
  uuidSchema,
} from '@aaharaconnect/shared';
import { requireAuth } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { HttpError } from '../../middleware/errorHandler';
import { validateBody } from '../../middleware/validate';
import { sendSuccess } from '../../utils/response';
import {
  cancelPickupHandler,
  getContainerOptionsHandler,
  getDriverOptionsHandler,
  updatePickupHandler,
  createAssignmentHandler,
  createPickupHandler,
  getActiveAssignmentHandler,
  getEligibleVolunteersForPickupHandler,
  getPickupByIdHandler,
  getVolunteerAssignmentsHandler,
  listPickupsHandler,
  updateAssignmentStatusHandler,
} from './controller';
import { listVehicleAssignments } from './vehicleAssignments';

// Team 3 owns assignment creation, reservations, and pickup transitions.
const pickupSubRouter = Router();
pickupSubRouter.post('/', requireAuth, requireRole('ADMIN'), validateBody(createPickupSchema), createPickupHandler);
pickupSubRouter.post(
  '/:id/assignments',
  requireAuth,
  requireRole('ADMIN'),
  validateBody(createAssignmentSchema),
  createAssignmentHandler
);
pickupSubRouter.get('/', requireAuth, requireRole('ADMIN'), listPickupsHandler);
pickupSubRouter.get('/:id/eligible-volunteers', requireAuth, requireRole('ADMIN'), getEligibleVolunteersForPickupHandler);
pickupSubRouter.get('/:id/assignment', requireAuth, requireRole('ADMIN'), getActiveAssignmentHandler);
pickupSubRouter.get('/:id/driver-options', requireAuth, requireRole('ADMIN'), getDriverOptionsHandler);
pickupSubRouter.get('/:id/container-options', requireAuth, requireRole('ADMIN'), getContainerOptionsHandler);
pickupSubRouter.patch('/:id', requireAuth, requireRole('ADMIN'), validateBody(updatePickupSchema), updatePickupHandler);
// Admin "Delete pickup": a safe cancellation that keeps history and the donor's food request.
pickupSubRouter.post('/:id/cancel', requireAuth, requireRole('ADMIN'), validateBody(cancelPickupSchema), cancelPickupHandler);
pickupSubRouter.get('/:id', requireAuth, requireRole('ADMIN'), getPickupByIdHandler);

const assignmentSubRouter = Router();
assignmentSubRouter.get('/me', requireAuth, requireRole('VOLUNTEER'), getVolunteerAssignmentsHandler);
assignmentSubRouter.patch(
  '/:id/status',
  requireAuth,
  validateBody(assignmentTransitionSchema),
  updateAssignmentStatusHandler
);

export const pickupRoutes = Router();
pickupRoutes.use((req, res, next) => {
  if (req.baseUrl.endsWith('/assignments')) {
    return assignmentSubRouter(req, res, next);
  }
  return pickupSubRouter(req, res, next);
});

// This Module 3 projection is the sole source for Module 5's assigned-people view.
export const vehicleAssignmentRoutes = Router();
vehicleAssignmentRoutes.get('/:vehicleId/assignments', requireAuth, requireRole('ADMIN'), async (request, response, next) => {
  try {
    const id = uuidSchema.safeParse(request.params.vehicleId);
    if (!id.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Vehicle ID must be a UUID.');
    sendSuccess(response, await listVehicleAssignments(id.data));
  } catch (error) { next(error); }
});
