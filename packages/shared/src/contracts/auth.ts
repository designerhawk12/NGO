import { z } from 'zod';
import { uuidSchema } from './common';
import { volunteerApplicationStatusSchema } from './volunteers';

export const appRoleSchema = z.enum(['ADMIN', 'VOLUNTEER', 'DONOR']);
export type AppRole = z.infer<typeof appRoleSchema>;
export const appUserSchema = z.object({
  id: uuidSchema,
  authUserId: uuidSchema,
  role: appRoleSchema,
  displayName: z.string().nullable(),
  volunteerApplicationStatus: volunteerApplicationStatusSchema.nullable().optional(),
});
export type AppUser = z.infer<typeof appUserSchema>;
