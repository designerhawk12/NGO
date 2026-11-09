import { z } from 'zod';
import { utcDateTimeSchema, uuidSchema } from './common';

// Module 4 owns consent and observations, never the canonical vehicle registry.
export const trackingConsentInputSchema = z.object({ pickupId: uuidSchema, consent: z.literal(true) });
export const vehicleLocationInputSchema = z.object({
  pickupId: uuidSchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  recordedAt: utcDateTimeSchema,
  accuracyMeters: z.number().min(0).max(200).optional(),
  speedMps: z.number().min(0).max(100).nullable().optional(),
  sessionStartedAt: utcDateTimeSchema.optional(),
});
export type TrackingConsentInput = z.infer<typeof trackingConsentInputSchema>;
export type VehicleLocationInput = z.infer<typeof vehicleLocationInputSchema>;
export type FleetLocation = {
  id: string; registrationNumber: string; driverName: string | null; sharing: boolean;
  latitude: number | null; longitude: number | null; recordedAt: string | null;
  accuracyMeters?: number | null; speedMps?: number | null; locality?: string | null;
};
