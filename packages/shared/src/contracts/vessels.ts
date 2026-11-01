import { z } from 'zod';
import { photoDataUrlSchema, utcDateTimeSchema, uuidSchema } from './common';

export const vesselTypeSchema = z.enum([
  'HOT_BOX',
  'INSULATED_BAG',
  'MILK_CAN',
  'CRATE',
  'COLD_BOX',
  'OTHER',
]);

export const vesselMaterialSchema = z.enum([
  'STAINLESS_STEEL',
  'FOOD_GRADE_PLASTIC',
  'ALUMINUM',
  'INSULATED_POLYMER',
  'OTHER',
]);

export const vesselCapacityUnitSchema = z.enum(['LITRES', 'KG']);

export const vesselTempSuitabilitySchema = z.enum([
  'AMBIENT',
  'CHILLED',
  'HOT',
  'FROZEN',
  'MULTI_TEMP',
]);

export const vesselStatusSchema = z.enum([
  'AVAILABLE',
  'IN_USE',
  'CLEANING_REQUIRED',
  'INSPECTION_REQUIRED',
  'MAINTENANCE',
  'RETIRED',
]);

export const vesselCleaningStatusSchema = z.enum([
  'CLEAN',
  'DIRTY',
  'SANITIZING',
]);

export const vesselInspectionResultSchema = z.enum([
  'PASSED',
  'ACTION_REQUIRED',
  'FAILED',
]);

export const vesselConditionSchema = z.enum([
  'GOOD',
  'MINOR_WEAR',
  'NEEDS_REPAIR',
  'UNSAFE',
]);

export const vesselLogTypeSchema = z.enum([
  'CLEANING',
  'INSPECTION',
  'MAINTENANCE',
  'STATUS_CHANGE',
]);

// Creation Schema
export const createVesselSchema = z.object({
  photoDataUrl: photoDataUrlSchema.nullable().optional(),
  vesselCode: z.string().trim().min(1, 'Vessel Code / ID is required').max(64),
  name: z.string().trim().min(1, 'Vessel Name is required').max(200),
  vesselType: vesselTypeSchema,
  material: vesselMaterialSchema,
  capacityValue: z.number().positive('Capacity must be greater than zero'),
  capacityUnit: vesselCapacityUnitSchema,
  foodGradeCertified: z.boolean().default(true),
  temperatureSuitability: vesselTempSuitabilitySchema,
  hasInsulation: z.boolean().default(false),
  hasTightLid: z.boolean().default(true),
  status: vesselStatusSchema.default('AVAILABLE'),
  cleaningStatus: vesselCleaningStatusSchema.default('CLEAN'),
  lastCleanedAt: utcDateTimeSchema.nullable().optional(),
  nextCleaningDue: utcDateTimeSchema.nullable().optional(),
  lastInspectedAt: utcDateTimeSchema.nullable().optional(),
  inspectionResult: vesselInspectionResultSchema.nullable().optional(),
  maintenanceCondition: vesselConditionSchema.default('GOOD'),
  storageLocation: z.string().trim().min(1, 'Storage location is required').max(255).default('Main Central Warehouse'),
  notes: z.string().max(1000).nullable().optional(),
});

// Update Schema
export const updateVesselSchema = createVesselSchema.partial().extend({
  foodGradeCertified: z.boolean().optional(),
  hasInsulation: z.boolean().optional(),
  hasTightLid: z.boolean().optional(),
  status: vesselStatusSchema.optional(),
  cleaningStatus: vesselCleaningStatusSchema.optional(),
  maintenanceCondition: vesselConditionSchema.optional(),
  storageLocation: z.string().trim().min(1).max(255).optional(),
}).refine(
  data => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update.' }
);

// Query / Filter Schema
export const listVesselsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  vesselType: vesselTypeSchema.optional(),
  status: vesselStatusSchema.optional(),
  cleaningStatus: vesselCleaningStatusSchema.optional(),
  temperatureSuitability: vesselTempSuitabilitySchema.optional(),
  storageLocation: z.string().optional(),
});

// Issue Vessel to Pickup / Vehicle Schema
export const issueVesselSchema = z.object({
  vesselId: uuidSchema,
  pickupId: uuidSchema.optional(),
  registrationNumber: z.string().trim().min(1, 'Vehicle registration number is required').optional(),
  issuedNotes: z.string().max(500).optional(),
}).refine(
  data => Boolean(data.registrationNumber || data.pickupId),
  { message: 'Vehicle Registration Number is required.' }
);

// Return Vessel Schema
export const returnVesselSchema = z.object({
  returnedCondition: vesselConditionSchema.default('GOOD'),
  returnCleanliness: z.enum(['CLEAN', 'DIRTY', 'CONTAMINATED']).default('DIRTY'),
  returnNotes: z.string().max(500).optional(),
  immediateClean: z.boolean().optional(),
});

// Add Cleaning / Inspection / Maintenance Log Schema
export const createVesselLogSchema = z.object({
  logType: vesselLogTypeSchema,
  performedAt: utcDateTimeSchema.optional(),
  resultStatus: z.string().min(1).max(50),
  summary: z.string().min(1).max(500),
  details: z.string().max(1000).optional(),
  nextDueAt: utcDateTimeSchema.nullable().optional(),
});

// Summary Metrics
export const vesselsSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
  inUse: z.number().int().nonnegative(),
  cleaningRequired: z.number().int().nonnegative(),
  inspectionRequired: z.number().int().nonnegative(),
  maintenance: z.number().int().nonnegative(),
  retired: z.number().int().nonnegative(),
});

export type VesselType = z.infer<typeof vesselTypeSchema>;
export type VesselMaterial = z.infer<typeof vesselMaterialSchema>;
export type VesselCapacityUnit = z.infer<typeof vesselCapacityUnitSchema>;
export type VesselTempSuitability = z.infer<typeof vesselTempSuitabilitySchema>;
export type VesselStatus = z.infer<typeof vesselStatusSchema>;
export type VesselCleaningStatus = z.infer<typeof vesselCleaningStatusSchema>;
export type VesselInspectionResult = z.infer<typeof vesselInspectionResultSchema>;
export type VesselCondition = z.infer<typeof vesselConditionSchema>;
export type VesselLogType = z.infer<typeof vesselLogTypeSchema>;

export type CreateVessel = z.infer<typeof createVesselSchema>;
export type UpdateVessel = z.infer<typeof updateVesselSchema>;
export type ListVesselsQuery = z.infer<typeof listVesselsQuerySchema>;
export type IssueVessel = z.infer<typeof issueVesselSchema>;
export type ReturnVessel = z.infer<typeof returnVesselSchema>;
export type CreateVesselLog = z.infer<typeof createVesselLogSchema>;
export type VesselsSummary = z.infer<typeof vesselsSummarySchema>;

export interface VesselItem {
  photoDataUrl?: string | null;
  id: string;
  vesselCode: string;
  name: string;
  vesselType: VesselType;
  material: VesselMaterial;
  capacityValue: number;
  capacityUnit: VesselCapacityUnit;
  foodGradeCertified: boolean;
  temperatureSuitability: VesselTempSuitability;
  hasInsulation: boolean;
  hasTightLid: boolean;
  status: VesselStatus;
  cleaningStatus: VesselCleaningStatus;
  lastCleanedAt: string | null;
  nextCleaningDue: string | null;
  lastInspectedAt: string | null;
  inspectionResult: VesselInspectionResult | null;
  maintenanceCondition: VesselCondition;
  storageLocation: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  activeIssuance?: {
    issuanceId: string;
    pickupId?: string | null;
    vehicleId?: string | null;
    registrationNumber?: string | null;
    foodRequestId?: string;
    sourceName?: string;
    pickupAddress?: string;
    issuedAt: string;
  } | null;
}

export interface VesselLogItem {
  id: string;
  vesselId: string;
  logType: VesselLogType;
  performedAt: string;
  performedBy: string | null;
  performerName?: string | null;
  resultStatus: string;
  summary: string;
  details: string | null;
  nextDueAt: string | null;
  createdAt: string;
}
