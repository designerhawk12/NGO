import { z } from 'zod';
import { utcDateTimeSchema, uuidSchema } from './common';

export const assignmentStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED_AT_DONOR', 'FOOD_COLLECTED', 'DELIVERED', 'REJECTED', 'CANCELLED', 'FAILED']);
export const driverAcceptanceSchema = z.enum(['NOT_REQUIRED', 'PENDING', 'ACCEPTED', 'DECLINED']);
export const pickupStatusSchema = z.enum(['PLANNED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED_AT_DONOR', 'FOOD_COLLECTED', 'DELIVERED', 'CANCELLED', 'FAILED']);
export const containerPlanInputSchema = z.object({ containerType: z.string().min(1).max(100), count: z.number().int().positive(), estimatedLoadKg: z.number().nonnegative().nullable() });
export const createPickupSchema = z.object({ foodRequestId: uuidSchema, windowStartsAt: utcDateTimeSchema, windowEndsAt: utcDateTimeSchema, deliveryAddress: z.string().min(1).max(500).optional(), distributionCenterId: uuidSchema.optional() }).refine(value => new Date(value.windowStartsAt) < new Date(value.windowEndsAt), { path: ['windowEndsAt'], message: 'End must follow start.' });
export const createAssignmentSchema = z.object({ teamId: uuidSchema.nullable(), volunteerIds: z.array(uuidSchema), driverId: uuidSchema, vehicleId: uuidSchema.optional(), vesselIds: z.array(uuidSchema).optional(), role: z.string().min(1).max(100), windowStartsAt: utcDateTimeSchema, windowEndsAt: utcDateTimeSchema, containers: z.array(containerPlanInputSchema) }).superRefine((value, context) => {
  if (new Date(value.windowStartsAt) >= new Date(value.windowEndsAt)) context.addIssue({ code: 'custom', path: ['windowEndsAt'], message: 'End must follow start.' });
  if (new Set(value.volunteerIds).size !== value.volunteerIds.length) context.addIssue({ code: 'custom', path: ['volunteerIds'], message: 'Volunteer IDs must be unique.' });
  if (value.vesselIds && new Set(value.vesselIds).size !== value.vesselIds.length) context.addIssue({ code: 'custom', path: ['vesselIds'], message: 'Vessel IDs must be unique.' });
});
export const assignmentTransitionSchema = z.object({ action: z.enum(['ACCEPT', 'REJECT', 'START', 'ARRIVE', 'COLLECT', 'DELIVER', 'CANCEL', 'FAIL']), expectedVersion: z.number().int().nonnegative(), reason: z.string().max(1000).optional() });
export const assignmentSchema = z.object({ id: uuidSchema, pickupId: uuidSchema, status: assignmentStatusSchema, version: z.number().int().nonnegative(), volunteerIds: z.array(uuidSchema), teamId: uuidSchema.nullable(), driverId: uuidSchema, vehicleId: uuidSchema, pickupAddress: z.string().optional(), windowStartsAt: utcDateTimeSchema.optional(), windowEndsAt: utcDateTimeSchema.optional(), createdAt: utcDateTimeSchema.optional(), completedAt: utcDateTimeSchema.optional(), driverAcceptance: driverAcceptanceSchema.optional(), deliveryAddress: z.string().optional() });
// The NGO employee driver's own response, separate from the shared crew status.
export type DriverAcceptance = z.infer<typeof driverAcceptanceSchema>;
// One job as shown to the assigned NGO employee driver on Android (from GET /assignments/driver).
export type DriverJob = {
  assignmentId: string;
  pickupId: string;
  status: AssignmentStatus;
  driverAcceptance: DriverAcceptance;
  version: number;
  donorName: string;
  pickupAddress: string;
  deliveryAddress: string;
  windowStartsAt: string;
  windowEndsAt: string;
  contactName: string | null;
  contactPhone: string | null;
  handlingRequirements: string | null;
  operationalNotes: string | null;
  foodItems: Array<{ foodType: string; quantity: number; unit: string; estimatedWeightKg: number | null }>;
  vehicle: { id: string; registrationNumber: string; kind: string; capacityKg: number };
  crew: Array<{ name: string }>;
  createdAt: string;
  completedAt: string | null;
};
export const pickupSchema = z.object({ id: uuidSchema, foodRequestId: uuidSchema, status: pickupStatusSchema, windowStartsAt: utcDateTimeSchema, windowEndsAt: utcDateTimeSchema, version: z.number().int().nonnegative(), operationalNotes: z.string().nullable().optional() });
// Admin schedule edits. Window and delivery address can change only while the pickup is PLANNED;
// operational notes can also change while an assignment is pending or accepted.
export const updatePickupSchema = z.strictObject({
  expectedVersion: z.number().int().nonnegative(),
  windowStartsAt: utcDateTimeSchema.optional(),
  windowEndsAt: utcDateTimeSchema.optional(),
  deliveryAddress: z.string().trim().min(1).max(500).optional(),
  distributionCenterId: uuidSchema.optional(),
  operationalNotes: z.string().trim().max(1000).nullable().optional(),
}).superRefine((value, context) => {
  if ((value.windowStartsAt === undefined) !== (value.windowEndsAt === undefined)) {
    context.addIssue({ code: 'custom', path: ['windowEndsAt'], message: 'Provide both the new start and end of the pickup window.' });
  }
  if (value.windowStartsAt && value.windowEndsAt && new Date(value.windowStartsAt) >= new Date(value.windowEndsAt)) {
    context.addIssue({ code: 'custom', path: ['windowEndsAt'], message: 'End must follow start.' });
  }
  if (value.windowStartsAt === undefined && value.deliveryAddress === undefined && value.distributionCenterId === undefined && value.operationalNotes === undefined) {
    context.addIssue({ code: 'custom', path: [], message: 'Provide at least one pickup field to update.' });
  }
});
// "Delete" in the Admin UI is a safe cancellation that keeps history and the donor's food request.
export const cancelPickupSchema = z.strictObject({
  expectedVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(3, 'Give a short reason for removing this pickup.').max(500),
});
// Module 3 projects this from canonical assignments for Module 5's admin view.
export const vehicleAssignmentSummarySchema = z.object({
  assignmentId: uuidSchema,
  pickupId: uuidSchema,
  status: assignmentStatusSchema,
  windowStartsAt: utcDateTimeSchema,
  windowEndsAt: utcDateTimeSchema,
  driverId: uuidSchema,
  volunteerIds: z.array(uuidSchema),
});
export const vehicleAssignmentsSchema = z.object({
  items: z.array(vehicleAssignmentSummarySchema),
  nextCursor: z.string().nullable(),
});
export type AssignmentStatus = z.infer<typeof assignmentStatusSchema>;
export type PickupStatus = z.infer<typeof pickupStatusSchema>;
export type CreatePickup = z.infer<typeof createPickupSchema>;
export type CreateAssignment = z.infer<typeof createAssignmentSchema>;
export type AssignmentTransition = z.infer<typeof assignmentTransitionSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type Pickup = z.infer<typeof pickupSchema>;
export type UpdatePickup = z.infer<typeof updatePickupSchema>;
export type CancelPickup = z.infer<typeof cancelPickupSchema>;
export type VehicleAssignmentSummary = z.infer<typeof vehicleAssignmentSummarySchema>;
export type VehicleAssignments = z.infer<typeof vehicleAssignmentsSchema>;

// Assignment planning projections returned by the Pickup API. The server recalculates all of this
// again inside the assignment transaction; these are guidance for the Admin wizard.
export type PickupLoadSummary = {
  weightKg: number | null;
  knownWeightKg: number;
  basis: 'MEASURED' | 'ESTIMATED' | 'UNKNOWN';
  liquidLitres: number;
  unmeasuredItems: string[];
  verificationRequired: boolean;
  notes: string[];
  handlingRequirements: string[];
};
export type DriverAssignmentOption = {
  driverId: string;
  name: string;
  phone: string;
  employeeCode: string | null;
  licenceNumber: string;
  licenceExpiresOn: string;
  status: 'ACTIVE' | 'INACTIVE';
  vehicle: {
    id: string;
    registrationNumber: string;
    kind: string;
    capacityKg: number;
    status: 'ACTIVE' | 'MAINTENANCE' | 'RETIRED';
    indicativeMaxVessels: number | null;
  };
  capacity: { status: 'FITS' | 'EXCEEDS' | 'VERIFY'; message: string };
  eligible: boolean;
  reasons: string[];
  warnings: string[];
};
export type DriverAssignmentOptions = {
  pickupId: string;
  windowStartsAt: string;
  windowEndsAt: string;
  load: PickupLoadSummary;
  options: DriverAssignmentOption[];
  blockingReason: string | null;
};
export type ContainerOption = {
  id: string;
  vesselCode: string;
  name: string;
  vesselType: string;
  capacityValue: number;
  capacityUnit: string;
  temperatureSuitability: string;
  hasTightLid: boolean;
  available: boolean;
  reason: string | null;
};
export type ContainerAssignmentOptions = {
  pickupId: string;
  driverId: string;
  vehicleId: string;
  maxVessels: number | null;
  load: PickupLoadSummary;
  containers: ContainerOption[];
  recommendation: {
    vesselIds: string[];
    totalCapacityKg: number;
    sufficient: boolean;
    estimate: boolean;
    summary: string;
    reasons: string[];
  };
};
