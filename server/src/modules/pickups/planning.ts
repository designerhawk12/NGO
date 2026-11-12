import type { PoolClient } from 'pg';
import {
  assessFoodLoad,
  assessVehicleCapacity,
  recommendVessels,
  vesselUnavailableReason,
  type ContainerAssignmentOptions,
  type DriverAssignmentOption,
  type DriverAssignmentOptions,
  type PickupLoadSummary,
  type PlanningVessel,
} from '@aaharaconnect/shared';
import { getPool } from '../../db/pool';
import { HttpError } from '../../middleware/errorHandler';
import { defaultVehiclePort, type VehiclePort } from './ports';

// Read-only planning projections for the assignment wizard. createAssignment recomputes the
// decisive parts (driver, fixed vehicle, capacity, containers) inside its own transaction.

type Db = PoolClient | ReturnType<typeof getPool>;

export type PlanningDriver = {
  driverId: string;
  personId: string;
  name: string;
  phone: string;
  employeeCode: string | null;
  licenceNumber: string;
  licenceExpiresOn: string;
  status: 'ACTIVE' | 'INACTIVE';
  vehicleId: string;
  registrationNumber: string;
  kind: string;
  capacityKg: number;
  vehicleStatus: 'ACTIVE' | 'MAINTENANCE' | 'RETIRED';
  indicativeMaxVessels: number | null;
};

export interface PlanningPort {
  getPickupLoad(foodRequestId: string, client?: PoolClient): Promise<PickupLoadSummary>;
  listEmployeeDrivers(client?: PoolClient): Promise<PlanningDriver[]>;
  getEmployeeDriver(driverId: string, client?: PoolClient): Promise<PlanningDriver | null>;
  listVessels(client?: PoolClient, vesselIds?: string[]): Promise<PlanningVessel[]>;
  hasVehicleConflict(vehicleId: string, startsAt: Date, endsAt: Date, client?: PoolClient): Promise<string | null>;
  hasPersonReservation(personId: string, startsAt: Date, endsAt: Date, client?: PoolClient): Promise<boolean>;
}

const DRIVER_SELECT = `
  SELECT d.id AS driver_id, d.person_id, p.name, p.phone_e164, d.employee_code, d.licence_number,
         d.licence_expires_on::text AS licence_expires_on, d.status,
         v.id AS vehicle_id, v.registration_number, v.kind, v.capacity_kg, v.status AS vehicle_status,
         v.indicative_max_vessels
  FROM app.drivers d
  JOIN app.people p ON p.id = d.person_id
  JOIN app.vehicles v ON v.assigned_driver_id = d.id
  WHERE d.driver_type = 'EMPLOYEE'`;

type DriverDbRow = {
  driver_id: string; person_id: string; name: string; phone_e164: string | null; employee_code: string | null;
  licence_number: string; licence_expires_on: string; status: 'ACTIVE' | 'INACTIVE'; vehicle_id: string;
  registration_number: string; kind: string; capacity_kg: string | number;
  vehicle_status: 'ACTIVE' | 'MAINTENANCE' | 'RETIRED'; indicative_max_vessels: number | null;
};

function toPlanningDriver(row: DriverDbRow): PlanningDriver {
  return {
    driverId: row.driver_id,
    personId: row.person_id,
    name: row.name,
    phone: row.phone_e164 ?? '',
    employeeCode: row.employee_code,
    licenceNumber: row.licence_number,
    licenceExpiresOn: row.licence_expires_on.slice(0, 10),
    status: row.status,
    vehicleId: row.vehicle_id,
    registrationNumber: row.registration_number,
    kind: row.kind,
    capacityKg: Number(row.capacity_kg),
    vehicleStatus: row.vehicle_status,
    indicativeMaxVessels: row.indicative_max_vessels,
  };
}

export class DefaultPlanningPort implements PlanningPort {
  async getPickupLoad(foodRequestId: string, client?: PoolClient): Promise<PickupLoadSummary> {
    const db: Db = client ?? getPool();
    const request = await db.query<{ estimated_weight_kg: string | number | null; handling_requirements: string }>(
      'SELECT estimated_weight_kg, handling_requirements FROM app.food_requests WHERE id = $1', [foodRequestId]
    );
    if (!request.rows.length) throw new HttpError(404, 'NOT_FOUND', 'Food request not found.');
    const items = await db.query<{
      food_type: string; quantity: string | number; unit: string; handling_requirements: string;
      estimated_weight_kg: string | number | null;
    }>(
      `SELECT food_type, quantity, unit, handling_requirements, estimated_weight_kg
       FROM app.food_items WHERE food_request_id = $1 ORDER BY id`, [foodRequestId]
    );
    return buildLoadSummary(
      items.rows.map(item => ({
        name: item.food_type,
        quantity: Number(item.quantity),
        unit: item.unit,
        estimatedWeightKg: item.estimated_weight_kg == null ? null : Number(item.estimated_weight_kg),
        handlingRequirements: item.handling_requirements,
      })),
      request.rows[0].estimated_weight_kg == null ? null : Number(request.rows[0].estimated_weight_kg),
      request.rows[0].handling_requirements,
    );
  }

  async listEmployeeDrivers(client?: PoolClient): Promise<PlanningDriver[]> {
    const db: Db = client ?? getPool();
    const result = await db.query<DriverDbRow>(`${DRIVER_SELECT} ORDER BY p.name, d.id`);
    return result.rows.map(toPlanningDriver);
  }

  async getEmployeeDriver(driverId: string, client?: PoolClient): Promise<PlanningDriver | null> {
    const db: Db = client ?? getPool();
    const result = await db.query<DriverDbRow>(`${DRIVER_SELECT} AND d.id = $1`, [driverId]);
    return result.rows[0] ? toPlanningDriver(result.rows[0]) : null;
  }

  async listVessels(client?: PoolClient, vesselIds?: string[]): Promise<PlanningVessel[]> {
    const db: Db = client ?? getPool();
    const result = await db.query<{
      id: string; name: string; vessel_code: string; vessel_type: string; capacity_value: string | number;
      capacity_unit: string; temperature_suitability: string; food_grade_certified: boolean; has_tight_lid: boolean;
      status: string; cleaning_status: string; maintenance_condition: string; inspection_result: string | null;
    }>(
      `SELECT id, name, vessel_code, vessel_type, capacity_value, capacity_unit, temperature_suitability,
              food_grade_certified, has_tight_lid, status, cleaning_status, maintenance_condition, inspection_result
       FROM app.vessels
       WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
       ORDER BY capacity_value DESC, vessel_code
       ${vesselIds ? 'FOR UPDATE' : ''}`,
      [vesselIds ?? null]
    );
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      vesselCode: row.vessel_code,
      vesselType: row.vessel_type,
      capacityValue: Number(row.capacity_value),
      capacityUnit: row.capacity_unit,
      temperatureSuitability: row.temperature_suitability,
      foodGradeCertified: row.food_grade_certified,
      hasTightLid: row.has_tight_lid,
      status: row.status,
      cleaningStatus: row.cleaning_status,
      maintenanceCondition: row.maintenance_condition,
      inspectionResult: row.inspection_result,
    }));
  }

  async hasVehicleConflict(vehicleId: string, startsAt: Date, endsAt: Date, client?: PoolClient): Promise<string | null> {
    const db: Db = client ?? getPool();
    const reserved = await db.query(
      `SELECT 1 FROM app.resource_reservations
       WHERE vehicle_id = $1 AND state = 'ACTIVE' AND starts_at < $3 AND ends_at > $2 LIMIT 1`,
      [vehicleId, startsAt, endsAt]
    );
    if (reserved.rows.length) return 'Vehicle is already scheduled for another pickup in this window.';
    const downtime = await db.query(
      `SELECT 1 FROM app.vehicle_unavailability
       WHERE vehicle_id = $1 AND starts_at < $3 AND ends_at > $2 LIMIT 1`,
      [vehicleId, startsAt, endsAt]
    );
    if (downtime.rows.length) return 'Vehicle has planned downtime during this pickup window.';
    return null;
  }

  async hasPersonReservation(personId: string, startsAt: Date, endsAt: Date, client?: PoolClient): Promise<boolean> {
    const db: Db = client ?? getPool();
    const result = await db.query(
      `SELECT 1 FROM app.resource_reservations
       WHERE person_id = $1 AND state = 'ACTIVE' AND starts_at < $3 AND ends_at > $2 LIMIT 1`,
      [personId, startsAt, endsAt]
    );
    return result.rows.length > 0;
  }
}

export const defaultPlanningPort = new DefaultPlanningPort();

export function buildLoadSummary(
  items: Array<{ name: string; quantity: number; unit: string; estimatedWeightKg: number | null; handlingRequirements?: string }>,
  requestEstimatedWeightKg: number | null,
  requestHandling: string,
): PickupLoadSummary {
  const load = assessFoodLoad(items, requestEstimatedWeightKg);
  const handling = [requestHandling, ...items.map(item => item.handlingRequirements ?? '')]
    .map(value => value.trim()).filter(Boolean);
  return { ...load, handlingRequirements: [...new Set(handling)] };
}

/** Decisive driver/vehicle checks shared by the wizard projection and the assignment transaction. */
export async function evaluateDriverForWindow(
  driver: PlanningDriver,
  window: { startsAt: Date; endsAt: Date },
  load: PickupLoadSummary,
  ports: { planningPort: PlanningPort; vehiclePort?: VehiclePort },
  client?: PoolClient,
): Promise<DriverAssignmentOption> {
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (driver.status !== 'ACTIVE') reasons.push('Driver is inactive.');
  const windowEndDate = window.endsAt.toISOString().slice(0, 10);
  if (driver.licenceExpiresOn < new Date().toISOString().slice(0, 10)) reasons.push('Driver’s licence has expired.');
  else if (driver.licenceExpiresOn < windowEndDate) reasons.push('Driver’s licence expires before this pickup.');
  if (driver.vehicleStatus !== 'ACTIVE') {
    reasons.push(driver.vehicleStatus === 'RETIRED' ? 'Vehicle is retired.' : 'Vehicle is under maintenance.');
  } else {
    const vehicle = await (ports.vehiclePort ?? defaultVehiclePort).getVehicle(driver.vehicleId, client);
    const blocking = vehicle?.reasons?.find(reason => reason.severity === 'BLOCKING');
    if (vehicle && vehicle.isReady === false && blocking) reasons.push(blocking.message);
    for (const warning of vehicle?.reasons?.filter(reason => reason.severity === 'WARNING') ?? []) warnings.push(warning.message);
  }
  const vehicleConflict = await ports.planningPort.hasVehicleConflict(driver.vehicleId, window.startsAt, window.endsAt, client);
  if (vehicleConflict) reasons.push(vehicleConflict);
  if (await ports.planningPort.hasPersonReservation(driver.personId, window.startsAt, window.endsAt, client)) {
    reasons.push('Driver is already scheduled for another pickup in this window.');
  }
  const capacity = assessVehicleCapacity(load, driver.capacityKg);
  if (capacity.status === 'EXCEEDS') reasons.push(capacity.message);
  if (capacity.status === 'VERIFY') warnings.push(capacity.message);
  if (load.handlingRequirements.length) {
    warnings.push(`Confirm the vehicle suits these handling needs: ${load.handlingRequirements.join('; ')}.`);
  }
  return {
    driverId: driver.driverId,
    name: driver.name,
    phone: driver.phone,
    employeeCode: driver.employeeCode,
    licenceNumber: driver.licenceNumber,
    licenceExpiresOn: driver.licenceExpiresOn,
    status: driver.status,
    vehicle: {
      id: driver.vehicleId,
      registrationNumber: driver.registrationNumber,
      kind: driver.kind,
      capacityKg: driver.capacityKg,
      status: driver.vehicleStatus,
      indicativeMaxVessels: driver.indicativeMaxVessels,
    },
    capacity,
    eligible: reasons.length === 0,
    reasons,
    warnings,
  };
}

export async function buildDriverOptions(
  pickup: { id: string; windowStartsAt: Date; windowEndsAt: Date; foodRequestId: string },
  blockingReason: string | null,
  ports: { planningPort?: PlanningPort; vehiclePort?: VehiclePort } = {},
  client?: PoolClient,
): Promise<DriverAssignmentOptions> {
  const planningPort = ports.planningPort ?? defaultPlanningPort;
  const load = await planningPort.getPickupLoad(pickup.foodRequestId, client);
  const drivers = await planningPort.listEmployeeDrivers(client);
  const options: DriverAssignmentOption[] = [];
  for (const driver of drivers) {
    options.push(await evaluateDriverForWindow(
      driver, { startsAt: pickup.windowStartsAt, endsAt: pickup.windowEndsAt }, load,
      { planningPort, vehiclePort: ports.vehiclePort }, client,
    ));
  }
  options.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.name.localeCompare(b.name));
  const anyEligible = options.some(option => option.eligible);
  return {
    pickupId: pickup.id,
    windowStartsAt: pickup.windowStartsAt.toISOString(),
    windowEndsAt: pickup.windowEndsAt.toISOString(),
    load,
    options,
    blockingReason: blockingReason ?? (options.length === 0
      ? 'No NGO employee drivers are registered. Add one from Assign Driver.'
      : anyEligible ? null : 'No eligible driver and vehicle available for this pickup.'),
  };
}

export async function buildContainerOptions(
  pickup: { id: string; foodRequestId: string },
  driver: PlanningDriver,
  ports: { planningPort?: PlanningPort } = {},
  client?: PoolClient,
): Promise<ContainerAssignmentOptions> {
  const planningPort = ports.planningPort ?? defaultPlanningPort;
  const load = await planningPort.getPickupLoad(pickup.foodRequestId, client);
  const vessels = await planningPort.listVessels(client);
  const recommendation = recommendVessels(load, vessels, driver.indicativeMaxVessels);
  return {
    pickupId: pickup.id,
    driverId: driver.driverId,
    vehicleId: driver.vehicleId,
    maxVessels: driver.indicativeMaxVessels,
    load,
    containers: vessels.map(vessel => {
      const reason = vesselUnavailableReason(vessel);
      return {
        id: vessel.id,
        vesselCode: vessel.vesselCode,
        name: vessel.name,
        vesselType: vessel.vesselType,
        capacityValue: vessel.capacityValue,
        capacityUnit: vessel.capacityUnit,
        temperatureSuitability: vessel.temperatureSuitability,
        hasTightLid: vessel.hasTightLid,
        available: reason === null,
        reason,
      };
    }),
    recommendation,
  };
}
