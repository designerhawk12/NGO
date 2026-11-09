import type { PoolClient } from 'pg';
import type { VehicleLocationInput } from '@aaharaconnect/shared';
import { getPool, withTransaction } from '../../db/pool';
import { HttpError } from '../../middleware/errorHandler';
import { getOwnDriverProfile } from '../vehicles/service';
import { lockDriverTrackingDuty } from '../pickups/trackingPort';
import { cacheLocality } from './geocoding';

async function duty(userId: string, pickupId: string, tx: PoolClient, requestedVehicleId?: string) {
  const profile = await getOwnDriverProfile(userId, tx, true);
  if (profile.status !== 'ACTIVE' || !profile.vehicle || (requestedVehicleId && profile.vehicle.id !== requestedVehicleId)) {
    throw new HttpError(403, 'FORBIDDEN', 'An active Driver and their fixed vehicle are required.');
  }
  const assignment = await lockDriverTrackingDuty(pickupId, profile.driverId, profile.vehicle.id, tx);
  if (!assignment) throw new HttpError(403, 'FORBIDDEN', 'No active accepted pickup duty authorizes location sharing.');
  return { profile, assignment };
}
export async function startSharing(userId: string, pickupId: string) {
  return withTransaction(async tx => {
    const { profile } = await duty(userId, pickupId, tx);
    await tx.query('SELECT id FROM app.app_users WHERE id = $1 FOR UPDATE', [userId]);
    await tx.query('UPDATE app.vehicle_tracking_consents SET withdrawn_at = now() WHERE app_user_id = $1 AND withdrawn_at IS NULL', [userId]);
    const result = await tx.query(`INSERT INTO app.vehicle_tracking_consents(pickup_id, app_user_id)
      VALUES ($1, $2) ON CONFLICT (pickup_id, app_user_id) DO UPDATE SET granted_at = now(), withdrawn_at = NULL
      RETURNING id, granted_at AS "startedAt"`, [pickupId, userId]);
    return { ...result.rows[0], vehicleId: profile.vehicle!.id, registrationNumber: profile.vehicle!.registrationNumber };
  });
}
export async function stopSharing(userId: string, pickupId: string) {
  await getPool().query('UPDATE app.vehicle_tracking_consents SET withdrawn_at = now() WHERE app_user_id = $1 AND pickup_id = $2 AND withdrawn_at IS NULL', [userId, pickupId]);
}
export function validateReadingTime(recordedAt: string, now = Date.now()) {
  const timestamp = new Date(recordedAt).getTime();
  if (!Number.isFinite(timestamp) || timestamp > now + 30_000 || timestamp < now - 120_000) {
    throw new HttpError(409, 'STALE_LOCATION', 'Report a current GPS reading (within two minutes).');
  }
  return timestamp;
}
export async function reportLocation(userId: string, vehicleId: string, input: VehicleLocationInput) {
  const timestamp = validateReadingTime(input.recordedAt);
  const result = await withTransaction(async tx => {
    const { assignment } = await duty(userId, input.pickupId, tx, vehicleId);
    const consent = await tx.query<{ id: string; granted_at: Date }>(`SELECT id, granted_at FROM app.vehicle_tracking_consents
      WHERE pickup_id = $1 AND app_user_id = $2 AND withdrawn_at IS NULL
        AND granted_at >= $3 AND granted_at > now() - interval '12 hours' FOR UPDATE`, [input.pickupId, userId, assignment.created_at]);
    const started = consent.rows[0] && new Date(consent.rows[0].granted_at).getTime();
    if (!started || !input.sessionStartedAt || Date.parse(input.sessionStartedAt) !== started || timestamp < started - 30_000) {
      throw new HttpError(403, 'TRACKING_CONSENT_REQUIRED', 'Start location sharing for this pickup again.');
    }
    const latest = await tx.query<{ recorded_at: Date }>('SELECT recorded_at FROM app.vehicle_locations WHERE vehicle_id = $1 ORDER BY recorded_at DESC LIMIT 1', [vehicleId]);
    const previous = latest.rows[0] && new Date(latest.rows[0].recorded_at).getTime();
    if (previous && timestamp <= previous) throw new HttpError(409, 'STALE_LOCATION', 'Out-of-order location ignored.');
    if (previous && timestamp - previous < 10_000) return { accepted: false, reason: 'RATE_LIMITED' };
    await tx.query(`INSERT INTO app.vehicle_locations(vehicle_id, pickup_id, reporter_user_id, tracking_consent_id, latitude, longitude, recorded_at, expires_at, accuracy_meters, speed_mps)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7::timestamptz + interval '15 minutes',$8,$9)`,
    [vehicleId, input.pickupId, userId, consent.rows[0].id, input.latitude, input.longitude, input.recordedAt,input.accuracyMeters??null,input.speedMps??null]);
    await tx.query('DELETE FROM app.vehicle_locations WHERE vehicle_id = $1 AND recorded_at < $2', [vehicleId, input.recordedAt]);
    await tx.query('DELETE FROM app.vehicle_locations WHERE id IN (SELECT id FROM app.vehicle_locations WHERE expires_at < now() LIMIT 100)');
    return { accepted: true };
  });
  if(result.accepted) await cacheLocality(input.latitude,input.longitude);
  return result;
}
export async function listFleetLocations() {
  const result = await getPool().query(`SELECT v.id, v.registration_number AS "registrationNumber", p.name AS "driverName",
    COALESCE(s.active, false) AS sharing, l.latitude, l.longitude, l.recorded_at AS "recordedAt", l.accuracy_meters AS "accuracyMeters",l.speed_mps AS "speedMps",gc.locality
    FROM app.vehicles v LEFT JOIN app.drivers d ON d.id = v.assigned_driver_id
    LEFT JOIN app.people p ON p.id = d.person_id
    LEFT JOIN LATERAL (SELECT true AS active FROM app.vehicle_tracking_consents c
      JOIN app.assignments a ON a.pickup_id = c.pickup_id AND a.driver_id = d.id AND a.vehicle_id = v.id
      JOIN app.pickups pk ON pk.id = a.pickup_id
      WHERE c.app_user_id = p.app_user_id AND c.withdrawn_at IS NULL AND d.status = 'ACTIVE'
        AND c.granted_at >= a.created_at AND c.granted_at > now() - interval '12 hours'
        AND a.status IN ('PENDING','ACCEPTED','EN_ROUTE','ARRIVED_AT_DONOR','FOOD_COLLECTED')
        AND pk.status NOT IN ('DELIVERED','CANCELLED','FAILED') LIMIT 1) s ON true
    LEFT JOIN LATERAL (SELECT latitude, longitude, recorded_at, accuracy_meters, speed_mps FROM app.vehicle_locations
      WHERE vehicle_id = v.id AND expires_at > now() ORDER BY recorded_at DESC LIMIT 1) l ON true
    LEFT JOIN app.tracking_geocode_cache gc ON gc.cell=to_char(l.latitude,'FM990.00')||','||to_char(l.longitude,'FM990.00') AND gc.expires_at>now()
    ORDER BY v.registration_number`);
  return { items: result.rows };
}
/** Enable only after the staging APK has passed physical GPS tests. */
export async function requireSharingForStart(pickupId: string, vehicleId: string, assignmentId: string, tx: PoolClient) {
  if (process.env.DRIVER_TRACKING_REQUIRED !== 'true') return;
  const result = await tx.query(`SELECT l.id FROM app.vehicle_locations l
    JOIN app.vehicle_tracking_consents c ON c.id = l.tracking_consent_id
    JOIN app.assignments a ON a.pickup_id=l.pickup_id AND a.vehicle_id=l.vehicle_id
    JOIN app.drivers d ON d.id=a.driver_id AND d.driver_type='EMPLOYEE' AND d.status='ACTIVE'
    JOIN app.people p ON p.id=d.person_id AND p.app_user_id=c.app_user_id
    JOIN app.vehicles v ON v.id=l.vehicle_id AND v.assigned_driver_id=d.id
    WHERE l.pickup_id = $1 AND l.vehicle_id = $2 AND c.withdrawn_at IS NULL
      AND a.id = $3 AND a.status IN ('PENDING','ACCEPTED')
      AND c.granted_at>=a.created_at AND a.driver_acceptance='ACCEPTED'
      AND l.recorded_at >= c.granted_at - interval '30 seconds' AND l.recorded_at > now() - interval '2 minutes'
      AND c.granted_at > now() - interval '12 hours' LIMIT 1`, [pickupId, vehicleId, assignmentId]);
  if (!result.rows[0]) throw new HttpError(409, 'GPS_SHARING_REQUIRED', 'The Driver must turn on GPS location sharing before starting.');
}
