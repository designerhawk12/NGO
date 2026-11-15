import { z } from 'zod';
import { utcDateTimeSchema, uuidSchema } from './common';

const centerAddress = z.string().trim().min(5).max(500);
const centerName = z.string().trim().min(1).max(120);

export const createDistributionCenterSchema = z.object({
  name: centerName.optional(),
  address: centerAddress,
});
export const updateDistributionCenterSchema = z.object({
  name: centerName.nullable().optional(),
  address: centerAddress.optional(),
  isActive: z.boolean().optional(),
}).refine(value => Object.keys(value).length > 0, { message: 'Provide at least one field to change.' });
export const distributionCenterSchema = z.object({
  id: uuidSchema,
  name: z.string().nullable(),
  address: z.string(),
  isActive: z.boolean(),
  createdAt: utcDateTimeSchema,
  updatedAt: utcDateTimeSchema,
});
export type CreateDistributionCenter = z.infer<typeof createDistributionCenterSchema>;
export type UpdateDistributionCenter = z.infer<typeof updateDistributionCenterSchema>;
export type DistributionCenter = z.infer<typeof distributionCenterSchema>;

/** Largest accepted decoded profile image. Phones send a compressed square crop well below this. */
export const PROFILE_PHOTO_MAX_BYTES = 600 * 1024;
export const profilePhotoContentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export const uploadProfilePhotoSchema = z.object({
  contentType: profilePhotoContentTypeSchema,
  dataBase64: z.string().min(16).max(Math.ceil(PROFILE_PHOTO_MAX_BYTES * 4 / 3) + 8).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Image data must be base64.'),
});
// Admin screens know donor / volunteer / driver record ids, not app-user ids, so lookups are by record kind.
export const profilePhotoKindSchema = z.enum(['DONOR', 'VOLUNTEER', 'DRIVER']);
export const profilePhotoLookupSchema = z.object({ kind: profilePhotoKindSchema, ids: z.array(uuidSchema).min(1).max(200) });
export type ProfilePhotoLookup = z.infer<typeof profilePhotoLookupSchema>;
export type UploadProfilePhoto = z.infer<typeof uploadProfilePhotoSchema>;
export type ProfilePhotoUrls = Record<string, string>;
