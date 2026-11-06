import { z } from 'zod';
import { phoneE164Schema, utcDateTimeSchema, uuidSchema } from './common';

export const quantityUnitSchema = z.enum(['MEALS', 'KG', 'LITRES', 'PACKAGES']);
export const safetyReviewSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export const foodItemInputSchema = z.object({ foodType: z.string().min(1).max(160), quantity: z.number().positive(), unit: quantityUnitSchema, handlingRequirements: z.string().max(2000), estimatedMeals: z.number().positive().optional(), estimatedWeightKg: z.number().positive().optional() });
const foodRequestFields = z.object({
  sourceName: z.string().min(1).max(200), sourceType: z.string().min(1).max(80), pickupAddress: z.string().min(1).max(500),
  preparedAt: utcDateTimeSchema, readyAt: utcDateTimeSchema.optional(), pickupDeadline: utcDateTimeSchema,
  contactName: z.string().min(1).max(160), contactPhoneE164: phoneE164Schema,
  handlingRequirements: z.string().max(2000), donorSafetyDeclaration: z.literal(true), notes: z.string().max(2000).optional(),
  items: z.array(foodItemInputSchema).min(1), estimatedWeightKg: z.number().positive().nullable(),
});
// Donors no longer enter a separate "food ready" time. Pickup becomes possible from the preparation
// time; the server stores that as ready_at when readyAt is omitted (older app builds may still send it).
export const createFoodRequestSchema = foodRequestFields.refine(value => {
  const prepared = new Date(value.preparedAt), deadline = new Date(value.pickupDeadline);
  const ready = value.readyAt ? new Date(value.readyAt) : prepared;
  return prepared <= ready && ready <= deadline;
}, { path: ['pickupDeadline'], message: 'The pickup deadline must not be earlier than the food preparation time.' });
export const foodRequestSchema = foodRequestFields.extend({ readyAt: utcDateTimeSchema, id: uuidSchema, donorId: uuidSchema, status: z.enum(['SUBMITTED', 'CANCELLED']), safetyReview: safetyReviewSchema, createdAt: utcDateTimeSchema });
export type CreateFoodRequest = z.infer<typeof createFoodRequestSchema>;
export type FoodRequest = z.infer<typeof foodRequestSchema>;
