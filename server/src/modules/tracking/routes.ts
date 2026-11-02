import { requireRole } from '../../middleware/authorize';
import { Router } from 'express';
import {
  trackingConsentInputSchema,
  vehicleLocationInputSchema,
  uuidSchema,
} from '@aaharaconnect/shared';

import { requireAuth } from '../../middleware/authenticate';
import { validateBody } from '../../middleware/validate';
import { HttpError } from '../../middleware/errorHandler';
import { sendSuccess } from '../../utils/response';
import { getPool } from '../../db/pool';

export const vehicleTrackingRoutes = Router();
export const pickupTrackingRoutes = Router();

/**
 * POST /api/v1/pickups/:id/tracking-consent
 */
pickupTrackingRoutes.post(
  '/:id/tracking-consent',
  requireAuth,
  validateBody(trackingConsentInputSchema),
  async (request, response, next) => {
    try {
      const pickupId = uuidSchema.safeParse(request.params.id);

      if (!pickupId.success) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Pickup ID must be a UUID.'
        );
      }

      const body = response.locals.validatedBody as {
        pickupId: string;
        consent: true;
      };

      if (body.pickupId !== pickupId.data) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Pickup ID does not match request body.'
        );
      }

      const appUser = response.locals.appUser;
      const pool = getPool();

      // Check that the logged-in user is assigned to this pickup.
      const assignment = await pool.query(
        `
        SELECT a.id
        FROM app.assignments a
        JOIN app.assignment_members am
          ON am.assignment_id = a.id
        JOIN app.volunteers v
          ON v.id = am.volunteer_id
        JOIN app.people p
          ON p.id = v.person_id
        WHERE a.pickup_id = $1
          AND p.app_user_id = $2
          AND a.status NOT IN ('REJECTED', 'CANCELLED', 'FAILED')
        LIMIT 1
        `,
        [pickupId.data, appUser.id]
      );

      if (assignment.rowCount === 0) {
        throw new HttpError(
          403,
          'FORBIDDEN',
          'You are not assigned to this pickup.'
        );
      }

      const result = await pool.query(
        `
        INSERT INTO app.vehicle_tracking_consents
          (pickup_id, app_user_id, granted_at, withdrawn_at)
        VALUES ($1, $2, now(), NULL)
        ON CONFLICT (pickup_id, app_user_id)
        DO UPDATE SET
          granted_at = now(),
          withdrawn_at = NULL
        RETURNING
          id,
          pickup_id AS "pickupId",
          app_user_id AS "appUserId",
          granted_at AS "grantedAt"
        `,
        [pickupId.data, appUser.id]
      );

      sendSuccess(response, result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/vehicles/:id/locations
 */
vehicleTrackingRoutes.post(
  '/:id/locations',
  requireAuth,
  validateBody(vehicleLocationInputSchema),
  async (request, response, next) => {
    try {
      const vehicleId = uuidSchema.safeParse(request.params.id);

      if (!vehicleId.success) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Vehicle ID must be a UUID.'
        );
      }

      const body = response.locals.validatedBody as {
        pickupId: string;
        latitude: number;
        longitude: number;
        recordedAt: string;
      };

      const appUser = response.locals.appUser;
      const pool = getPool();

      // Check that the vehicle exists.
      const vehicle = await pool.query(
        `
        SELECT id
        FROM app.vehicles
        WHERE id = $1
        `,
        [vehicleId.data]
      );

      if (vehicle.rowCount === 0) {
        throw new HttpError(
          404,
          'NOT_FOUND',
          'Vehicle not found.'
        );
      }

      // Check that the user is assigned to this pickup
      // and this vehicle.
      const assignment = await pool.query(
        `
        SELECT a.id
        FROM app.assignments a
        JOIN app.assignment_members am
          ON am.assignment_id = a.id
        JOIN app.volunteers v
          ON v.id = am.volunteer_id
        JOIN app.people p
          ON p.id = v.person_id
        WHERE a.pickup_id = $1
          AND a.vehicle_id = $2
          AND p.app_user_id = $3
          AND a.status NOT IN ('REJECTED', 'CANCELLED', 'FAILED')
        LIMIT 1
        `,
        [body.pickupId, vehicleId.data, appUser.id]
      );

      if (assignment.rowCount === 0) {
        throw new HttpError(
          403,
          'FORBIDDEN',
          'You are not authorized to report this vehicle location.'
        );
      }

      // Check active tracking consent.
      const consent = await pool.query(
        `
        SELECT id
        FROM app.vehicle_tracking_consents
        WHERE pickup_id = $1
          AND app_user_id = $2
          AND withdrawn_at IS NULL
        LIMIT 1
        `,
        [body.pickupId, appUser.id]
      );

      if (consent.rowCount === 0) {
        throw new HttpError(
          403,
          'TRACKING_CONSENT_REQUIRED',
          'Tracking consent is required before sending vehicle locations.'
        );
      }

      const recordedAt = new Date(body.recordedAt);

      if (Number.isNaN(recordedAt.getTime())) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'recordedAt must be a valid date.'
        );
      }

      // Keep each location active for 15 minutes.
      const expiresAt = new Date(
        recordedAt.getTime() + 15 * 60 * 1000
      );

      const result = await pool.query(
        `
        INSERT INTO app.vehicle_locations
          (
            vehicle_id,
            pickup_id,
            reporter_user_id,
            tracking_consent_id,
            latitude,
            longitude,
            recorded_at,
            expires_at
          )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          id,
          vehicle_id AS "vehicleId",
          pickup_id AS "pickupId",
          latitude,
          longitude,
          recorded_at AS "recordedAt",
          expires_at AS "expiresAt"
        `,
        [
          vehicleId.data,
          body.pickupId,
          appUser.id,
          consent.rows[0].id,
          body.latitude,
          body.longitude,
          recordedAt.toISOString(),
          expiresAt.toISOString(),
        ]
      );

      sendSuccess(response, result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);
/**
 * GET /api/v1/vehicles/:id/locations
 * Returns recent, non-expired locations for a vehicle.
 */
vehicleTrackingRoutes.get(
  '/:id/locations',
  requireAuth,
  requireRole('ADMIN'),
  async (request, response, next) => {
    try {
      const vehicleId = uuidSchema.safeParse(request.params.id);

      if (!vehicleId.success) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Vehicle ID must be a UUID.'
        );
      }

      const pool = getPool();

      const result = await pool.query(
        `
        SELECT
          id,
          vehicle_id AS "vehicleId",
          pickup_id AS "pickupId",
          latitude,
          longitude,
          recorded_at AS "recordedAt",
          expires_at AS "expiresAt"
        FROM app.vehicle_locations
        WHERE vehicle_id = $1
          AND expires_at > now()
        ORDER BY recorded_at DESC
        LIMIT 100
        `,
        [vehicleId.data]
      );

      sendSuccess(response, { items: result.rows });
    } catch (error) {
      next(error);
    }
  }
);