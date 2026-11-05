import { z } from 'zod';
import { uuidSchema } from './common';
import { volunteerApplicationStatusSchema } from './volunteers';

// DRIVER is an NGO employee sign-in. It is provisioned only by an Admin through Assign Driver;
// it can never be chosen through registration, client metadata or the role-change endpoint.
export const appRoleSchema = z.enum(['ADMIN', 'VOLUNTEER', 'DONOR', 'DRIVER']);
export type AppRole = z.infer<typeof appRoleSchema>;
export const assignableAppRoleSchema = z.enum(['ADMIN', 'VOLUNTEER', 'DONOR']);
export const appUserSchema = z.object({
  id: uuidSchema,
  authUserId: uuidSchema,
  role: appRoleSchema,
  displayName: z.string().nullable(),
  volunteerApplicationStatus: volunteerApplicationStatusSchema.nullable().optional(),
});
export type AppUser = z.infer<typeof appUserSchema>;
