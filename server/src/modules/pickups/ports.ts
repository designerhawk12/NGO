import type { PoolClient } from 'pg';
import { getPool } from '../../db/pool';
import {
  DefaultVolunteerReadPort,
  type VolunteerReadPort,
} from '../volunteers/port';
import type { EligibleVolunteer } from '../volunteers/service';
import { evaluateVehicleReadiness } from '../vehicles/readiness';

export type FoodRequestSummary = {
  id: string;
  status: 'SUBMITTED' | 'CANCELLED';
  safetyReview: 'PENDING' | 'APPROVED' | 'REJECTED';
  pickupDeadline: Date;
  readyAt: Date;
  estimatedWeightKg?: number | null;
};

export interface FoodPort {
  getFoodRequest(foodRequestId: string, client?: PoolClient): Promise<FoodRequestSummary | null>;
}

// TODO(Team2): Replace temporary read-only database query with Team 2 Food service interface once implemented.
export class DefaultFoodPort implements FoodPort {
  async getFoodRequest(foodRequestId: string, client?: PoolClient): Promise<FoodRequestSummary | null> {
    const db = client ?? getPool();
    const result = await db.query<{
      id: string;
      status: 'SUBMITTED' | 'CANCELLED';
      safety_review: 'PENDING' | 'APPROVED' | 'REJECTED';
      pickup_deadline: Date;
      ready_at: Date;
      estimated_weight_kg?: string | number | null;
    }>(
      `SELECT id, status, safety_review, pickup_deadline, ready_at, estimated_weight_kg FROM app.food_requests WHERE id = $1`,
      [foodRequestId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      status: row.status,
      safetyReview: row.safety_review,
      pickupDeadline: new Date(row.pickup_deadline),
      readyAt: new Date(row.ready_at),
      estimatedWeightKg: row.estimated_weight_kg != null ? Number(row.estimated_weight_kg) : null,
    };
  }
}

export type VolunteerSummary = {
  id: string;
  personId: string;
  status: 'ACTIVE' | 'INACTIVE';
  isAvailable: boolean;
};

export interface VolunteerPort {
  listEligibleVolunteers(
    query: { startAt: Date; endAt: Date },
    client?: PoolClient
  ): Promise<EligibleVolunteer[]>;
  getVolunteerAvailability(
    volunteerId: string,
    windowStartsAt: Date,
    windowEndsAt: Date,
    client?: PoolClient
  ): Promise<VolunteerSummary | null>;
}

export class DefaultVolunteerPort implements VolunteerPort {
  constructor(private readonly volunteerReadPort: VolunteerReadPort = new DefaultVolunteerReadPort()) {}

  async listEligibleVolunteers(query: { startAt: Date; endAt: Date }, client?: PoolClient): Promise<EligibleVolunteer[]> {
    return this.volunteerReadPort.listEligibleVolunteers(query, client);
  }

  async getVolunteerAvailability(
    volunteerId: string,
    windowStartsAt: Date,
    windowEndsAt: Date,
    client?: PoolClient
  ): Promise<VolunteerSummary | null> {
    return this.volunteerReadPort.getVolunteerAvailability(
      volunteerId,
      windowStartsAt,
      windowEndsAt,
      client
    );
  }
}

export type DriverSummary = {
  id: string;
  personId: string;
  licenceNumber: string;
  licenceExpiresOn: Date;
  status: 'ACTIVE' | 'INACTIVE';
};

export interface DriverPort {
  getDriver(driverId: string, client?: PoolClient): Promise<DriverSummary | null>;
}

// TODO(Team5): Replace temporary read-only query with Team 5 Driver service interface once implemented.
export class DefaultDriverPort implements DriverPort {
  async getDriver(driverId: string, client?: PoolClient): Promise<DriverSummary | null> {
    const db = client ?? getPool();
    const result = await db.query<{
      id: string;
      person_id: string;
      licence_number: string;
      licence_expires_on: Date | string;
      status: 'ACTIVE' | 'INACTIVE';
    }>(
      `SELECT d.id, d.person_id, d.licence_number, d.licence_expires_on, d.status
       FROM app.drivers d
       WHERE d.id = $1`,
      [driverId]
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      personId: row.person_id,
      licenceNumber: row.licence_number,
      licenceExpiresOn: new Date(row.licence_expires_on),
      status: row.status,
    };
  }
}

export type VehicleSummary = {
  id: string;
  registrationNumber: string;
  kind: string;
  capacityKg: number;
  status: 'ACTIVE' | 'MAINTENANCE' | 'RETIRED';
  isReady?: boolean;
  reasons?: Array<{ code: string; message: string; severity: 'BLOCKING' | 'WARNING' }>;
};

export interface VehiclePort {
  getVehicle(vehicleId: string, client?: PoolClient): Promise<VehicleSummary | null>;
}

// Integrates Vehicle module specifications, active downtime, and maintenance condition readiness
export class DefaultVehiclePort implements VehiclePort {
  async getVehicle(vehicleId: string, client?: PoolClient): Promise<VehicleSummary | null> {
    const db = client ?? getPool();
    const result = await db.query<{
      id: string;
      registration_number: string;
      kind: string;
      capacity_kg: string | number;
      status: 'ACTIVE' | 'MAINTENANCE' | 'RETIRED';
      has_active_downtime?: boolean;
      latest_condition?: 'GOOD' | 'NEEDS_SERVICE' | 'UNSAFE' | null;
      latest_next_service_due_on?: Date | string | null;
    }>(
      `SELECT
         v.id,
         v.registration_number,
         v.kind,
         v.capacity_kg,
         v.status,
         COALESCE(downtime.has_active_downtime, false) AS has_active_downtime,
         latest_maint.condition AS latest_condition,
         latest_maint.next_service_due_on AS latest_next_service_due_on
       FROM app.vehicles v
       LEFT JOIN LATERAL (
         SELECT EXISTS (
           SELECT 1 FROM app.vehicle_unavailability vu
           WHERE vu.vehicle_id = v.id
             AND vu.starts_at <= now()
             AND vu.ends_at > now()
         ) AS has_active_downtime
       ) downtime ON true
       LEFT JOIN LATERAL (
         SELECT vmr.condition, vmr.next_service_due_on
         FROM app.vehicle_maintenance_records vmr
         WHERE vmr.vehicle_id = v.id
         ORDER BY vmr.serviced_on DESC, vmr.created_at DESC
         LIMIT 1
       ) latest_maint ON true
       WHERE v.id = $1`,
      [vehicleId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    const nextServiceDueOn = row.latest_next_service_due_on
      ? typeof row.latest_next_service_due_on === 'string'
        ? row.latest_next_service_due_on.slice(0, 10)
        : row.latest_next_service_due_on.toISOString().slice(0, 10)
      : null;

    const readiness = evaluateVehicleReadiness({
      status: row.status,
      hasActiveDowntime: Boolean(row.has_active_downtime),
      hasActiveAssignment: false,
      latestCondition: row.latest_condition ?? null,
      nextServiceDueOn,
    });

    return {
      id: row.id,
      registrationNumber: row.registration_number,
      kind: row.kind,
      capacityKg: Number(row.capacity_kg),
      status: row.status,
      isReady: readiness.isReady,
      reasons: readiness.reasons,
    };
  }
}

export const defaultFoodPort = new DefaultFoodPort();
export const defaultVolunteerPort = new DefaultVolunteerPort();
export const defaultDriverPort = new DefaultDriverPort();
export const defaultVehiclePort = new DefaultVehiclePort();
