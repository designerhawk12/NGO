import { z } from 'zod';
import { uuidSchema } from './common';

export const vehicleStatusSchema = z.enum(['ACTIVE', 'MAINTENANCE', 'RETIRED']);
export const vehicleSizeCategorySchema = z.enum(['SMALL', 'MEDIUM', 'LARGE']);
export const vehicleConditionSchema = z.enum(['GOOD', 'NEEDS_SERVICE', 'UNSAFE']);
export const vehicleSchema = z.object({
  id: uuidSchema,
  registrationNumber: z.string(),
  kind: z.string(),
  capacityKg: z.number().positive(),
  status: vehicleStatusSchema,
  sizeCategory: vehicleSizeCategorySchema.nullable().optional(),
  indicativeMaxVessels: z.number().int().positive().nullable().optional(),
});
export const driverSchema = z.object({ id: uuidSchema, personId: uuidSchema, licenceNumber: z.string(), licenceExpiresOn: z.string().date(), status: z.enum(['ACTIVE', 'INACTIVE']) });
export const vehicleMaintenanceRecordSchema = z.object({
  id: uuidSchema,
  vehicleId: uuidSchema,
  servicedOn: z.string().date(),
  condition: vehicleConditionSchema,
  summary: z.string().min(1),
  nextServiceDueOn: z.string().date().nullable(),
  recordedBy: uuidSchema.nullable(),
});
export const createVehicleMaintenanceRecordSchema = vehicleMaintenanceRecordSchema.omit({ id: true, vehicleId: true, recordedBy: true }).extend({
  nextServiceDueOn: z.string().date().nullable().optional(),
});
export type Vehicle = z.infer<typeof vehicleSchema>;
export type Driver = z.infer<typeof driverSchema>;
export type VehicleMaintenanceRecord = z.infer<typeof vehicleMaintenanceRecordSchema>;
export type CreateVehicleMaintenanceRecord = z.infer<typeof createVehicleMaintenanceRecordSchema>;

export const createVehicleSchema = z.object({
  registrationNumber: z.string().trim().min(1).max(32).transform(s => s.toUpperCase()),
  kind: z.string().trim().min(1).max(64),
  capacityKg: z.number().positive(),
  status: vehicleStatusSchema.optional().default('ACTIVE'),
  sizeCategory: vehicleSizeCategorySchema.nullable().optional(),
  indicativeMaxVessels: z.number().int().positive().nullable().optional(),
  assignedDriverId: z.string().nullable().optional(),
});
export type CreateVehicle = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = z.object({
  registrationNumber: z.string().trim().min(1).max(32).transform(s => s.toUpperCase()).optional(),
  kind: z.string().trim().min(1).max(64).optional(),
  capacityKg: z.number().positive().optional(),
  status: vehicleStatusSchema.optional(),
  sizeCategory: vehicleSizeCategorySchema.nullable().optional(),
  indicativeMaxVessels: z.number().int().positive().nullable().optional(),
  assignedDriverId: z.string().nullable().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});
export type UpdateVehicle = z.infer<typeof updateVehicleSchema>;

export const listVehiclesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: vehicleStatusSchema.optional(),
  kind: z.string().optional(),
  search: z.string().optional(),
});
export type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>;

export const readinessSeveritySchema = z.enum(['BLOCKING', 'WARNING']);
export type ReadinessSeverity = z.infer<typeof readinessSeveritySchema>;

export const readinessReasonCodeSchema = z.enum([
  'RETIRED_STATUS',
  'MAINTENANCE_STATUS',
  'ACTIVE_DOWNTIME_RESTRICTION',
  'ACTIVE_ASSIGNMENT_CONFLICT',
  'MAINTENANCE_CONDITION_UNSAFE',
  'SERVICE_OVERDUE',
  'SERVICE_RECOMMENDED',
]);
export type ReadinessReasonCode = z.infer<typeof readinessReasonCodeSchema>;

export const vehicleReadinessReasonSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: readinessSeveritySchema,
});
export type VehicleReadinessReason = z.infer<typeof vehicleReadinessReasonSchema>;

export const dispatchReadinessStatusSchema = z.enum(['READY', 'DISPATCHED', 'MAINTENANCE_RESTRICTED', 'RETIRED']);
export type DispatchReadinessStatus = z.infer<typeof dispatchReadinessStatusSchema>;

export const vehicleReadinessSchema = z.object({
  isReady: z.boolean(),
  dispatchStatus: dispatchReadinessStatusSchema,
  reasons: z.array(vehicleReadinessReasonSchema),
});
export type VehicleReadiness = z.infer<typeof vehicleReadinessSchema>;

export const fleetSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
  onTrip: z.number().int().nonnegative(),
  maintenance: z.number().int().nonnegative(),
  retired: z.number().int().nonnegative(),
});
export type FleetSummary = z.infer<typeof fleetSummarySchema>;

export const vehicleUnavailabilitySchema = z.object({
  id: uuidSchema,
  vehicleId: uuidSchema,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().min(1),
});
export type VehicleUnavailability = z.infer<typeof vehicleUnavailabilitySchema>;

export const createVehicleUnavailabilitySchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().min(1),
}).refine(data => new Date(data.endsAt) > new Date(data.startsAt), {
  message: 'endsAt must be after startsAt',
});
export type CreateVehicleUnavailability = z.infer<typeof createVehicleUnavailabilitySchema>;

// Keep old imports working while the tracking contracts live in their own module file.
export { trackingConsentInputSchema, vehicleLocationInputSchema } from './tracking';
export type { TrackingConsentInput, VehicleLocationInput } from './tracking';
