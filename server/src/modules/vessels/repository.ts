import type { PoolClient } from 'pg';
import { getPool } from '../../db/pool';
import { HttpError } from '../../middleware/errorHandler';
import type {
  CreateVessel,
  CreateVesselLog,
  IssueVessel,
  ListVesselsQuery,
  ReturnVessel,
  UpdateVessel,
  VesselItem,
  VesselLogItem,
  VesselsSummary,
} from '@aaharaconnect/shared';

export function handleVesselDbError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  if (error && typeof error === 'object' && 'code' in error) {
    const pgError = error as { code: string; message?: string; detail?: string };
    if (pgError.code === '23505') {
      throw new HttpError(
        409,
        'RESOURCE_CONFLICT',
        pgError.detail || 'A vessel with this identifier or code already exists.'
      );
    }
    if (pgError.code === '23514') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        pgError.detail || pgError.message || 'Data violates vessel integrity rules.'
      );
    }
  }
  throw error;
}

interface VesselDbRow {
  id: string;
  vessel_code: string;
  name: string;
  vessel_type: string;
  material: string;
  capacity_value: string | number;
  capacity_unit: string;
  food_grade_certified: boolean;
  temperature_suitability: string;
  has_insulation: boolean;
  has_tight_lid: boolean;
  status: string;
  cleaning_status: string;
  last_cleaned_at: Date | string | null;
  next_cleaning_due: Date | string | null;
  last_inspected_at: Date | string | null;
  inspection_result: string | null;
  maintenance_condition: string;
  storage_location: string;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  issuance_id?: string | null;
  pickup_id?: string | null;
  vehicle_id?: string | null;
  registration_number?: string | null;
  food_request_id?: string | null;
  source_name?: string | null;
  pickup_address?: string | null;
  issued_at?: Date | string | null;
}

function mapVesselRow(row: VesselDbRow): VesselItem {
  return {
    id: row.id,
    vesselCode: row.vessel_code,
    name: row.name,
    vesselType: row.vessel_type as any,
    material: row.material as any,
    capacityValue: Number(row.capacity_value),
    capacityUnit: row.capacity_unit as any,
    foodGradeCertified: row.food_grade_certified,
    temperatureSuitability: row.temperature_suitability as any,
    hasInsulation: row.has_insulation,
    hasTightLid: row.has_tight_lid,
    status: row.status as any,
    cleaningStatus: row.cleaning_status as any,
    lastCleanedAt: row.last_cleaned_at ? new Date(row.last_cleaned_at).toISOString() : null,
    nextCleaningDue: row.next_cleaning_due ? new Date(row.next_cleaning_due).toISOString() : null,
    lastInspectedAt: row.last_inspected_at ? new Date(row.last_inspected_at).toISOString() : null,
    inspectionResult: row.inspection_result as any,
    maintenanceCondition: row.maintenance_condition as any,
    storageLocation: row.storage_location,
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    activeIssuance: row.issuance_id
      ? {
          issuanceId: row.issuance_id,
          pickupId: row.pickup_id ?? null,
          vehicleId: row.vehicle_id ?? null,
          registrationNumber: row.registration_number ?? null,
          foodRequestId: row.food_request_id ?? undefined,
          sourceName: row.source_name ?? undefined,
          pickupAddress: row.pickup_address ?? undefined,
          issuedAt: new Date(row.issued_at!).toISOString(),
        }
      : null,
  };
}

const VESSEL_SELECT_SQL = `
  SELECT
    v.id,
    v.vessel_code,
    v.name,
    v.vessel_type,
    v.material,
    v.capacity_value,
    v.capacity_unit,
    v.food_grade_certified,
    v.temperature_suitability,
    v.has_insulation,
    v.has_tight_lid,
    v.status,
    v.cleaning_status,
    v.last_cleaned_at,
    v.next_cleaning_due,
    v.last_inspected_at,
    v.inspection_result,
    v.maintenance_condition,
    v.storage_location,
    v.notes,
    v.created_at,
    v.updated_at,
    vi.id as issuance_id,
    vi.pickup_id,
    vi.vehicle_id,
    vi.registration_number,
    vi.issued_at,
    p.food_request_id,
    fr.source_name,
    fr.pickup_address
  FROM app.vessels v
  LEFT JOIN app.vessel_issuances vi ON vi.vessel_id = v.id AND vi.status = 'ACTIVE'
  LEFT JOIN app.pickups p ON p.id = vi.pickup_id
  LEFT JOIN app.food_requests fr ON fr.id = p.food_request_id
`;

export async function listVessels(params: ListVesselsQuery, client?: PoolClient) {
  const db = client ?? getPool();
  const limit = Math.min(params.limit ?? 50, 100);
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.search) {
    values.push(`%${params.search}%`);
    conditions.push(`(v.vessel_code ILIKE $${values.length} OR v.name ILIKE $${values.length} OR v.storage_location ILIKE $${values.length})`);
  }
  if (params.vesselType) {
    values.push(params.vesselType);
    conditions.push(`v.vessel_type = $${values.length}`);
  }
  if (params.status) {
    values.push(params.status);
    conditions.push(`v.status = $${values.length}`);
  }
  if (params.cleaningStatus) {
    values.push(params.cleaningStatus);
    conditions.push(`v.cleaning_status = $${values.length}`);
  }
  if (params.temperatureSuitability) {
    values.push(params.temperatureSuitability);
    conditions.push(`v.temperature_suitability = $${values.length}`);
  }
  if (params.storageLocation) {
    values.push(params.storageLocation);
    conditions.push(`v.storage_location = $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit);

  const query = `
    ${VESSEL_SELECT_SQL}
    ${whereClause}
    ORDER BY v.vessel_code ASC, v.created_at DESC
    LIMIT $${values.length}
  `;

  try {
    const result = await db.query<VesselDbRow>(query, values);
    return {
      items: result.rows.map(mapVesselRow),
    };
  } catch (error) {
    handleVesselDbError(error);
  }
}

export async function findVesselById(id: string, client?: PoolClient) {
  const db = client ?? getPool();
  try {
    const result = await db.query<VesselDbRow>(
      `${VESSEL_SELECT_SQL} WHERE v.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return mapVesselRow(result.rows[0]);
  } catch (error) {
    handleVesselDbError(error);
  }
}

export async function findVesselByCode(code: string, client?: PoolClient) {
  const db = client ?? getPool();
  try {
    const result = await db.query<VesselDbRow>(
      `${VESSEL_SELECT_SQL} WHERE LOWER(TRIM(v.vessel_code)) = LOWER(TRIM($1))`,
      [code]
    );
    if (result.rows.length === 0) return null;
    return mapVesselRow(result.rows[0]);
  } catch (error) {
    handleVesselDbError(error);
  }
}

export async function createVessel(input: CreateVessel, client?: PoolClient) {
  const db = client ?? getPool();
  try {
    const res = await db.query<VesselDbRow>(
      `INSERT INTO app.vessels (
        vessel_code,
        name,
        vessel_type,
        material,
        capacity_value,
        capacity_unit,
        food_grade_certified,
        temperature_suitability,
        has_insulation,
        has_tight_lid,
        status,
        cleaning_status,
        last_cleaned_at,
        next_cleaning_due,
        last_inspected_at,
        inspection_result,
        maintenance_condition,
        storage_location,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        input.vesselCode,
        input.name,
        input.vesselType,
        input.material,
        input.capacityValue,
        input.capacityUnit,
        input.foodGradeCertified,
        input.temperatureSuitability,
        input.hasInsulation,
        input.hasTightLid,
        input.status,
        input.cleaningStatus,
        input.lastCleanedAt ?? null,
        input.nextCleaningDue ?? null,
        input.lastInspectedAt ?? null,
        input.inspectionResult ?? null,
        input.maintenanceCondition,
        input.storageLocation,
        input.notes ?? null,
      ]
    );
    return mapVesselRow(res.rows[0]);
  } catch (error) {
    handleVesselDbError(error);
  }
}

export async function updateVessel(id: string, patch: UpdateVessel, client?: PoolClient) {
  const db = client ?? getPool();
  const setClauses: string[] = [];
  const values: unknown[] = [id];

  const mapField = (field: string, col: string) => {
    if (field in patch) {
      values.push((patch as any)[field]);
      setClauses.push(`${col} = $${values.length}`);
    }
  };

  mapField('vesselCode', 'vessel_code');
  mapField('name', 'name');
  mapField('vesselType', 'vessel_type');
  mapField('material', 'material');
  mapField('capacityValue', 'capacity_value');
  mapField('capacityUnit', 'capacity_unit');
  mapField('foodGradeCertified', 'food_grade_certified');
  mapField('temperatureSuitability', 'temperature_suitability');
  mapField('hasInsulation', 'has_insulation');
  mapField('hasTightLid', 'has_tight_lid');
  mapField('status', 'status');
  mapField('cleaningStatus', 'cleaning_status');
  mapField('lastCleanedAt', 'last_cleaned_at');
  mapField('nextCleaningDue', 'next_cleaning_due');
  mapField('lastInspectedAt', 'last_inspected_at');
  mapField('inspectionResult', 'inspection_result');
  mapField('maintenanceCondition', 'maintenance_condition');
  mapField('storageLocation', 'storage_location');
  mapField('notes', 'notes');

  setClauses.push(`updated_at = now()`);

  if (setClauses.length === 1) {
    return findVesselById(id, client);
  }

  const query = `
    UPDATE app.vessels
    SET ${setClauses.join(', ')}
    WHERE id = $1
    RETURNING id
  `;

  try {
    const res = await db.query(query, values);
    if (res.rows.length === 0) return null;
    return findVesselById(id, client);
  } catch (error) {
    handleVesselDbError(error);
  }
}

export async function deleteVessel(idOrCode: string, client?: PoolClient) {
  const db = client ?? getPool();
  try {
    const vCheck = await db.query(
      `SELECT id FROM app.vessels WHERE id::text = $1 OR UPPER(vessel_code) = UPPER($1)`,
      [idOrCode]
    );
    if (vCheck.rows.length === 0) {
      return true;
    }
    const vesselId = vCheck.rows[0].id;

    // Cascade delete logs and return/issuance records
    await db.query(`DELETE FROM app.vessel_logs WHERE vessel_id = $1`, [vesselId]);
    await db.query(`DELETE FROM app.vessel_issuances WHERE vessel_id = $1`, [vesselId]);
    const res = await db.query(`DELETE FROM app.vessels WHERE id = $1 RETURNING id`, [vesselId]);
    return res.rows.length > 0;
  } catch (error) {
    handleVesselDbError(error);
  }
}

export async function getVesselsSummary(client?: PoolClient): Promise<VesselsSummary> {
  const db = client ?? getPool();
  try {
    const res = await db.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'AVAILABLE')::int AS available,
        COUNT(*) FILTER (WHERE status = 'IN_USE')::int AS in_use,
        COUNT(*) FILTER (WHERE status = 'CLEANING_REQUIRED' OR cleaning_status <> 'CLEAN')::int AS cleaning_required,
        COUNT(*) FILTER (WHERE status = 'INSPECTION_REQUIRED')::int AS inspection_required,
        COUNT(*) FILTER (WHERE status = 'MAINTENANCE' OR maintenance_condition IN ('NEEDS_REPAIR', 'UNSAFE'))::int AS maintenance,
        COUNT(*) FILTER (WHERE status = 'RETIRED')::int AS retired
      FROM app.vessels
    `);
    const row = res.rows[0];
    return {
      total: Number(row.total) || 0,
      available: Number(row.available) || 0,
      inUse: Number(row.in_use) || 0,
      cleaningRequired: Number(row.cleaning_required) || 0,
      inspectionRequired: Number(row.inspection_required) || 0,
      maintenance: Number(row.maintenance) || 0,
      retired: Number(row.retired) || 0,
    };
  } catch (error) {
    handleVesselDbError(error);
  }
}

// Issue Vessel to Vehicle / Pickup
export async function issueVessel(
  input: IssueVessel,
  actorUserId?: string,
  client?: PoolClient
) {
  const db = client ?? getPool();
  try {
    // 1. Fetch vessel with lock
    const vRes = await db.query<VesselDbRow>(
      `SELECT * FROM app.vessels WHERE id = $1 FOR UPDATE`,
      [input.vesselId]
    );
    if (vRes.rows.length === 0) {
      throw new HttpError(404, 'NOT_FOUND', 'Vessel not found.');
    }
    const vessel = vRes.rows[0];

    // Rule: Check eligibility (not dirty, damaged, or unsafe)
    if (vessel.status === 'RETIRED') {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'Cannot issue a retired vessel.');
    }
    if (vessel.status === 'IN_USE') {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'Vessel is already in use on an active assignment.');
    }
    if (vessel.cleaning_status !== 'CLEAN' || vessel.status === 'CLEANING_REQUIRED') {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'Cannot issue an uncleaned or sanitizing vessel. Clean vessel first.');
    }
    if (vessel.maintenance_condition === 'UNSAFE' || vessel.maintenance_condition === 'NEEDS_REPAIR' || vessel.status === 'MAINTENANCE') {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'Cannot issue a damaged or unsafe vessel.');
    }
    if (vessel.status === 'INSPECTION_REQUIRED' || vessel.inspection_result === 'FAILED') {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'Vessel requires inspection before it can be dispatched.');
    }

    let resolvedVehicleId: string | null = null;
    let resolvedRegistration: string | null = null;
    let resolvedPickupId: string | null = input.pickupId ?? null;

    // 2. Validate Registration Number against Vehicle Details if specified
    if (input.registrationNumber) {
      const trimmedReg = input.registrationNumber.trim();
      const vehRes = await db.query<{ id: string; registration_number: string; kind: string; status: string }>(
        `SELECT id, registration_number, kind, status FROM app.vehicles WHERE LOWER(TRIM(registration_number)) = LOWER($1)`,
        [trimmedReg]
      );
      if (vehRes.rows.length === 0) {
        throw new HttpError(
          400,
          'INVALID_REGISTRATION_NUMBER',
          `Vehicle registration number "${trimmedReg}" was not found in Vehicle Details. It must match a registered vehicle from Vehicle Details.`
        );
      }
      const vehicle = vehRes.rows[0];
      if (vehicle.status === 'RETIRED') {
        throw new HttpError(409, 'RESOURCE_CONFLICT', `Vehicle ${vehicle.registration_number} is retired and cannot receive vessel dispatches.`);
      }
      resolvedVehicleId = vehicle.id;
      resolvedRegistration = vehicle.registration_number;

      // Check if vehicle has an active assignment and pickup
      const asgRes = await db.query<{ pickup_id: string }>(
        `SELECT a.pickup_id
         FROM app.assignments a
         JOIN app.pickups p ON p.id = a.pickup_id
         WHERE a.vehicle_id = $1
           AND a.status NOT IN ('REJECTED', 'CANCELLED', 'FAILED')
           AND p.status NOT IN ('CANCELLED', 'FAILED', 'DELIVERED')
         ORDER BY a.created_at DESC
         LIMIT 1`,
        [vehicle.id]
      );
      if (asgRes.rows.length > 0) {
        resolvedPickupId = asgRes.rows[0].pickup_id;
      }
    } else if (resolvedPickupId) {
      // Backwards-compatibility when only pickupId is given
      const pRes = await db.query(`SELECT id, status FROM app.pickups WHERE id = $1`, [resolvedPickupId]);
      if (pRes.rows.length === 0) {
        throw new HttpError(404, 'NOT_FOUND', 'Pickup assignment not found.');
      }
    } else {
      throw new HttpError(400, 'BAD_REQUEST', 'Either a vehicle registration number or pickup ID must be specified.');
    }

    // 3. Create issuance
    const issRes = await db.query(
      `INSERT INTO app.vessel_issuances (vessel_id, pickup_id, vehicle_id, registration_number, issued_by, issued_notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
       RETURNING id, issued_at`,
      [input.vesselId, resolvedPickupId, resolvedVehicleId, resolvedRegistration, actorUserId ?? null, input.issuedNotes ?? null]
    );

    // 4. Update vessel status to IN_USE
    await db.query(
      `UPDATE app.vessels SET status = 'IN_USE', updated_at = now() WHERE id = $1`,
      [input.vesselId]
    );

    // 5. Append log
    const targetLabel = resolvedRegistration ? `vehicle ${resolvedRegistration}` : `pickup ${resolvedPickupId}`;
    await db.query(
      `INSERT INTO app.vessel_logs (vessel_id, log_type, performed_by, result_status, summary, details)
       VALUES ($1, 'STATUS_CHANGE', $2, 'ISSUED', 'Issued to dispatch', $3)`,
      [input.vesselId, actorUserId ?? null, `Issued for ${targetLabel}. Notes: ${input.issuedNotes || 'None'}`]
    );

    return {
      success: true,
      issuanceId: issRes.rows[0].id,
      issuedAt: issRes.rows[0].issued_at,
      vehicleId: resolvedVehicleId,
      registrationNumber: resolvedRegistration,
      pickupId: resolvedPickupId,
    };
  } catch (error) {
    handleVesselDbError(error);
  }
}

// Return Vessel
export async function returnVessel(
  vesselId: string,
  input: ReturnVessel,
  actorUserId?: string,
  client?: PoolClient
) {
  const db = client ?? getPool();
  try {
    // 1. Find active issuance
    const issRes = await db.query(
      `SELECT id, pickup_id FROM app.vessel_issuances WHERE vessel_id = $1 AND status = 'ACTIVE' FOR UPDATE`,
      [vesselId]
    );
    if (issRes.rows.length === 0) {
      throw new HttpError(404, 'NOT_FOUND', 'No active issuance found for this vessel.');
    }
    const issuance = issRes.rows[0];

    // 2. Close issuance
    await db.query(
      `UPDATE app.vessel_issuances
       SET returned_at = now(),
           returned_by = $1,
           returned_condition = $2,
           return_cleanliness = $3,
           return_notes = $4,
           status = 'RETURNED'
       WHERE id = $5`,
      [actorUserId ?? null, input.returnedCondition, input.returnCleanliness, input.returnNotes ?? null, issuance.id]
    );

    // 3. Determine new vessel status based on return conditions
    // Rule: Returned vessel MUST remain unavailable until required cleaning and inspections are complete!
    let nextStatus = 'AVAILABLE';
    let nextCleanliness = input.returnCleanliness;

    if (input.returnCleanliness === 'DIRTY' || input.returnCleanliness === 'CONTAMINATED') {
      nextStatus = 'CLEANING_REQUIRED';
      nextCleanliness = 'DIRTY';
    } else if (input.returnedCondition === 'UNSAFE' || input.returnedCondition === 'NEEDS_REPAIR') {
      nextStatus = 'MAINTENANCE';
    } else if (input.immediateClean) {
      nextStatus = 'AVAILABLE';
      nextCleanliness = 'CLEAN';
    }

    await db.query(
      `UPDATE app.vessels
       SET status = $1,
           cleaning_status = $2,
           maintenance_condition = $3,
           last_cleaned_at = CASE WHEN $4 THEN now() ELSE last_cleaned_at END,
           updated_at = now()
       WHERE id = $5`,
      [nextStatus, nextCleanliness, input.returnedCondition, Boolean(input.immediateClean), vesselId]
    );

    // 4. Record log
    await db.query(
      `INSERT INTO app.vessel_logs (vessel_id, log_type, performed_by, result_status, summary, details)
       VALUES ($1, 'STATUS_CHANGE', $2, 'RETURNED', $3, $4)`,
      [
        vesselId,
        actorUserId ?? null,
        `Vessel returned from pickup. Condition: ${input.returnedCondition}, Cleanliness: ${input.returnCleanliness}`,
        input.returnNotes ?? null,
      ]
    );

    return findVesselById(vesselId, client);
  } catch (error) {
    handleVesselDbError(error);
  }
}

// Add Log (Cleaning, Inspection, Maintenance)
export async function addVesselLog(
  vesselId: string,
  input: CreateVesselLog,
  actorUserId?: string,
  client?: PoolClient
): Promise<VesselLogItem> {
  const db = client ?? getPool();
  try {
    const res = await db.query(
      `INSERT INTO app.vessel_logs (
        vessel_id,
        log_type,
        performed_at,
        performed_by,
        result_status,
        summary,
        details,
        next_due_at
      ) VALUES ($1, $2, COALESCE($3, now()), $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        vesselId,
        input.logType,
        input.performedAt ?? null,
        actorUserId ?? null,
        input.resultStatus,
        input.summary,
        input.details ?? null,
        input.nextDueAt ?? null,
      ]
    );

    // Apply side-effects to vessel state
    if (input.logType === 'CLEANING') {
      const isClean = input.resultStatus.toUpperCase() === 'PASSED' || input.resultStatus.toUpperCase() === 'CLEAN';
      await db.query(
        `UPDATE app.vessels
         SET cleaning_status = $1,
             status = CASE WHEN status = 'CLEANING_REQUIRED' AND $2 THEN 'AVAILABLE' ELSE status END,
             last_cleaned_at = now(),
             next_cleaning_due = $3,
             updated_at = now()
         WHERE id = $4`,
        [isClean ? 'CLEAN' : 'DIRTY', isClean, input.nextDueAt ?? null, vesselId]
      );
    } else if (input.logType === 'INSPECTION') {
      const passed = input.resultStatus.toUpperCase() === 'PASSED';
      await db.query(
        `UPDATE app.vessels
         SET inspection_result = $1,
             last_inspected_at = now(),
             status = CASE WHEN status = 'INSPECTION_REQUIRED' AND $2 THEN 'AVAILABLE' ELSE status END,
             updated_at = now()
         WHERE id = $3`,
        [passed ? 'PASSED' : 'ACTION_REQUIRED', passed, vesselId]
      );
    }

    const row = res.rows[0];
    return {
      id: row.id,
      vesselId: row.vessel_id,
      logType: row.log_type,
      performedAt: new Date(row.performed_at).toISOString(),
      performedBy: row.performed_by,
      resultStatus: row.result_status,
      summary: row.summary,
      details: row.details,
      nextDueAt: row.next_due_at ? new Date(row.next_due_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    };
  } catch (error) {
    handleVesselDbError(error);
  }
}

export async function listVesselLogs(vesselId: string, client?: PoolClient): Promise<VesselLogItem[]> {
  const db = client ?? getPool();
  try {
    const res = await db.query(
      `SELECT
        vl.*,
        p.name AS performer_name
       FROM app.vessel_logs vl
       LEFT JOIN app.app_users u ON u.id = vl.performed_by
       LEFT JOIN app.people p ON p.id = u.person_id
       WHERE vl.vessel_id = $1
       ORDER BY vl.performed_at DESC, vl.created_at DESC`,
      [vesselId]
    );
    return res.rows.map(r => ({
      id: r.id,
      vesselId: r.vessel_id,
      logType: r.log_type,
      performedAt: new Date(r.performed_at).toISOString(),
      performedBy: r.performed_by,
      performerName: r.performer_name ?? null,
      resultStatus: r.result_status,
      summary: r.summary,
      details: r.details,
      nextDueAt: r.next_due_at ? new Date(r.next_due_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  } catch (error) {
    handleVesselDbError(error);
  }
}
