import type { PoolClient } from 'pg';
import type { CreateDistributionCenter, DistributionCenter, UpdateDistributionCenter } from '@aaharaconnect/shared';
import { getPool } from '../../db/pool';
import { HttpError } from '../../middleware/errorHandler';

type Row = { id: string; name: string | null; address: string; is_active: boolean; created_at: Date; updated_at: Date };
const columns = 'id, name, address, is_active, created_at, updated_at';
const toDto = (row: Row): DistributionCenter => ({
  id: row.id, name: row.name, address: row.address, isActive: row.is_active,
  createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
});

export async function listDistributionCenters(includeInactive: boolean): Promise<DistributionCenter[]> {
  const result = await getPool().query<Row>(
    `SELECT ${columns} FROM app.distribution_centers WHERE ($1 OR is_active) ORDER BY is_active DESC, lower(coalesce(name, address)), created_at`,
    [includeInactive]
  );
  return result.rows.map(toDto);
}

export async function createDistributionCenter(input: CreateDistributionCenter, actorUserId: string): Promise<DistributionCenter> {
  const result = await getPool().query<Row>(
    `INSERT INTO app.distribution_centers (name, address, created_by) VALUES ($1, $2, $3) RETURNING ${columns}`,
    [input.name ?? null, input.address, actorUserId]
  );
  return toDto(result.rows[0]);
}

export async function updateDistributionCenter(id: string, input: UpdateDistributionCenter): Promise<DistributionCenter> {
  const result = await getPool().query<Row>(
    `UPDATE app.distribution_centers
        SET name = CASE WHEN $2 THEN $3 ELSE name END,
            address = COALESCE($4, address),
            is_active = COALESCE($5, is_active),
            updated_at = now()
      WHERE id = $1 RETURNING ${columns}`,
    [id, input.name !== undefined, input.name ?? null, input.address ?? null, input.isActive ?? null]
  );
  if (!result.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Distribution center not found.');
  return toDto(result.rows[0]);
}

/**
 * Server-side enforcement for scheduling: the destination must be an existing, active center.
 * The returned address is the snapshot stored on the pickup, so later edits or archiving of the
 * center never rewrite historical deliveries.
 */
export async function requireActiveCenterAddress(id: string | undefined, client?: PoolClient): Promise<{ id: string; address: string }> {
  if (!id) throw new HttpError(400, 'DISTRIBUTION_CENTER_REQUIRED', 'Select a Distribution Center for the delivery destination.');
  const result = await (client ?? getPool()).query<{ id: string; address: string; is_active: boolean }>(
    'SELECT id, address, is_active FROM app.distribution_centers WHERE id = $1', [id]
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(400, 'DISTRIBUTION_CENTER_INVALID', 'The selected Distribution Center does not exist.');
  if (!row.is_active) throw new HttpError(409, 'DISTRIBUTION_CENTER_INACTIVE', 'The selected Distribution Center is archived. Choose an active one.');
  return { id: row.id, address: row.address };
}
