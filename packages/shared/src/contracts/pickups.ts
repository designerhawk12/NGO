import { z } from 'zod';
import { utcDateTimeSchema, uuidSchema } from './common';

export const assignmentStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED_AT_DONOR', 'FOOD_COLLECTED', 'DELIVERED', 'REJECTED', 'CANCELLED', 'FAILED']);
export const pickupStatusSchema = z.enum(['PLANNED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED_AT_DONOR', 'FOOD_COLLECTED', 'DELIVERED', 'CANCELLED', 'FAILED']);
export const containerPlanInputSchema = z.object({ containerType: z.string().min(1).max(100), count: z.number().int().positive(), estimatedLoadKg: z.number().nonnegative().nullable() });
export const createPickupSchema = z.object({ foodRequestId: uuidSchema, windowStartsAt: utcDateTimeSchema, windowEndsAt: utcDateTimeSchema, deliveryAddress: z.string().min(1).max(500) }).refine(value => new Date(value.windowStartsAt) < new Date(value.windowEndsAt), { path: ['windowEndsAt'], message: 'End must follow start.' });
export const createAssignmentSchema = z.object({ teamId: uuidSchema.nullable(), volunteerIds: z.array(uuidSchema).min(1), driverId: uuidSchema, vehicleId: uuidSchema, vesselIds: z.array(uuidSchema).optional(), role: z.string().min(1).max(100), windowStartsAt: utcDateTimeSchema, windowEndsAt: utcDateTimeSchema, containers: z.array(containerPlanInputSchema) }).superRefine((value, context) => {
  if (new Date(value.windowStartsAt) >= new Date(value.windowEndsAt)) context.addIssue({ code: 'custom', path: ['windowEndsAt'], message: 'End must follow start.' });
  if (new Set(value.volunteerIds).size !== value.volunteerIds.length) context.addIssue({ code: 'custom', path: ['volunteerIds'], message: 'Volunteer IDs must be unique.' });
  if (value.vesselIds && new Set(value.vesselIds).size !== value.vesselIds.length) context.addIssue({ code: 'custom', path: ['vesselIds'], message: 'Vessel IDs must be unique.' });
});
export const assignmentTransitionSchema = z.object({ action: z.enum(['ACCEPT', 'REJECT', 'START', 'ARRIVE', 'COLLECT', 'DELIVER', 'CANCEL', 'FAIL']), expectedVersion: z.number().int().nonnegative(), reason: z.string().max(1000).optional() });
export const assignmentSchema = z.object({ id: uuidSchema, pickupId: uuidSchema, status: assignmentStatusSchema, version: z.number().int().nonnegative(), volunteerIds: z.array(uuidSchema), teamId: uuidSchema.nullable(), driverId: uuidSchema, vehicleId: uuidSchema });
export const pickupSchema = z.object({ id: uuidSchema, foodRequestId: uuidSchema, status: pickupStatusSchema, windowStartsAt: utcDateTimeSchema, windowEndsAt: utcDateTimeSchema, version: z.number().int().nonnegative() });
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
export type VehicleAssignmentSummary = z.infer<typeof vehicleAssignmentSummarySchema>;
export type VehicleAssignments = z.infer<typeof vehicleAssignmentsSchema>;
