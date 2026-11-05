import { Router } from 'express';
import { requireAuth } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import {
  createEmployeeDriverSchema,
  inviteEmployeeDriverSchema,
  createVehicleMaintenanceRecordSchema,
  createVehicleSchema,
  updateEmployeeDriverSchema,
  updateVehicleSchema,
} from '@aaharaconnect/shared';
import {
  createEmployeeDriverHandler,
  getOwnDriverProfileHandler,
  inviteDriverHandler,
  getDriverHandler,
  listDriverVehicleOptionsHandler,
  rejectFixedVehicleChange,
  updateEmployeeDriverHandler,
  createMaintenanceHandler,
  createVehicleHandler,
  deleteVehicleHandler,
  getFleetSummaryHandler,
  getVehicleByIdHandler,
  listDriversHandler,
  listMaintenanceHandler,
  listVehiclesHandler,
  updateVehicleHandler,
} from './controller';

export const vehicleRoutes = Router();

const vehicleSubRouter = Router();
const driverSubRouter = Router();

// Summary / metrics endpoint must precede /:id to prevent matching 'summary' as an ID
vehicleSubRouter.get('/summary', requireAuth, requireRole('ADMIN'), getFleetSummaryHandler);
vehicleSubRouter.get('/', requireAuth, requireRole('ADMIN'), listVehiclesHandler);
vehicleSubRouter.post('/', requireAuth, requireRole('ADMIN'), validateBody(createVehicleSchema), createVehicleHandler);
vehicleSubRouter.get('/:id', requireAuth, requireRole('ADMIN'), getVehicleByIdHandler);
vehicleSubRouter.patch('/:id', requireAuth, requireRole('ADMIN'), validateBody(updateVehicleSchema), updateVehicleHandler);
vehicleSubRouter.delete('/:id', requireAuth, requireRole('ADMIN'), deleteVehicleHandler);
vehicleSubRouter.get('/:id/maintenance', requireAuth, requireRole('ADMIN'), listMaintenanceHandler);
vehicleSubRouter.post(
  '/:id/maintenance',
  requireAuth,
  requireRole('ADMIN'),
  validateBody(createVehicleMaintenanceRecordSchema),
  createMaintenanceHandler
);

// Driver registry. NGO employee drivers are created only here, each with one fixed vehicle.
// A signed-in NGO employee driver reads only their own profile and fixed vehicle.
driverSubRouter.get('/me', requireAuth, requireRole('DRIVER'), getOwnDriverProfileHandler);
driverSubRouter.get('/', requireAuth, requireRole('ADMIN'), listDriversHandler);
driverSubRouter.post('/:id/invite', requireAuth, requireRole('ADMIN'), validateBody(inviteEmployeeDriverSchema), inviteDriverHandler);
driverSubRouter.get('/vehicle-options', requireAuth, requireRole('ADMIN'), listDriverVehicleOptionsHandler);
driverSubRouter.post('/', requireAuth, requireRole('ADMIN'), validateBody(createEmployeeDriverSchema), createEmployeeDriverHandler);
driverSubRouter.get('/:id', requireAuth, requireRole('ADMIN'), getDriverHandler);
driverSubRouter.patch(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  rejectFixedVehicleChange,
  validateBody(updateEmployeeDriverSchema),
  updateEmployeeDriverHandler
);

// Dispatch to subrouters based on baseUrl mount point (/vehicles vs /drivers)
vehicleRoutes.use((request, response, next) => {
  if (request.baseUrl.endsWith('/drivers')) {
    return driverSubRouter(request, response, next);
  }
  return vehicleSubRouter(request, response, next);
});
