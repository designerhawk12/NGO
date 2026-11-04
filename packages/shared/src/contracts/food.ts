import { z } from 'zod';
import { phoneE164Schema, utcDateTimeSchema, uuidSchema } from './common';

export const quantityUnitSchema = z.enum(['MEALS', 'KG', 'LITRES', 'PACKAGES']);
export const safetyReviewSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export const foodItemInputSchema = z.object({ foodType: z.string().min(1).max(160), quantity: z.number().positive(), unit: quantityUnitSchema, handlingRequirements: z.string().max(2000), estimatedMeals: z.number().positive().optional(), estimatedWeightKg: z.number().positive().optional() });
const foodRequestFields = z.object({
  sourceName: z.string().min(1).max(200), sourceType: z.string().min(1).max(80), pickupAddress: z.string().min(1).max(500),
  preparedAt: utcDateTimeSchema, readyAt: utcDateTimeSchema, pickupDeadline: utcDateTimeSchema,
  contactName: z.string().min(1).max(160), contactPhoneE164: phoneE164Schema,
  handlingRequirements: z.string().max(2000), donorSafetyDeclaration: z.literal(true), notes: z.string().max(2000).optional(),
  items: z.array(foodItemInputSchema).min(1), estimatedWeightKg: z.number().positive().nullable(),
});
export const createFoodRequestSchema = foodRequestFields.refine(value => new Date(value.preparedAt) <= new Date(value.readyAt) && new Date(value.readyAt) <= new Date(value.pickupDeadline), { path: ['pickupDeadline'], message: 'Preparation, ready and pickup deadline must be in order.' });
export const foodRequestSchema = foodRequestFields.extend({ id: uuidSchema, donorId: uuidSchema, status: z.enum(['SUBMITTED', 'CANCELLED']), safetyReview: safetyReviewSchema, createdAt: utcDateTimeSchema });
export type CreateFoodRequest = z.infer<typeof createFoodRequestSchema>;
export type FoodRequest = z.infer<typeof foodRequestSchema>;
