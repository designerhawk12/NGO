import type { PoolClient } from 'pg';

/** Module 3 owns assignment authorization. Tracking never writes assignments. */
export async function lockDriverTrackingDuty(pickupId: string, driverId: string, vehicleId: string, tx: PoolClient) {
  const result = await tx.query<{ id: string; created_at: Date }>(`
    SELECT a.id, a.created_at FROM app.assignments a JOIN app.pickups p ON p.id = a.pickup_id
    WHERE a.pickup_id = $1 AND a.driver_id = $2 AND a.vehicle_id = $3
      AND a.driver_acceptance = 'ACCEPTED'
      AND a.status NOT IN ('REJECTED', 'CANCELLED', 'FAILED', 'DELIVERED')
      AND p.status NOT IN ('CANCELLED', 'FAILED', 'DELIVERED')
      AND p.window_starts_at <= now() + interval '2 hours'
      AND p.window_ends_at >= now() - interval '12 hours'
    FOR UPDATE OF a`, [pickupId, driverId, vehicleId]);
  return result.rows[0] ?? null;
}
