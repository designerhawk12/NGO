import { z } from 'zod';
import { availabilityInputSchema, pageQuerySchema, phoneE164Schema, uuidSchema, volunteerStatusSchema } from '@aaharaconnect/shared';

export const updateOwnProfileSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  phoneE164: phoneE164Schema.optional(),
}).refine(value => value.name !== undefined || value.phoneE164 !== undefined, {
  message: 'Provide at least one editable profile field.',
});

export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;

// Keep the approved time/state rules while rejecting client-supplied owner IDs.
export const availabilityWriteSchema = availabilityInputSchema.strict();

export const listVolunteersQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  status: volunteerStatusSchema.optional(),
  teamId: z.union([uuidSchema, z.literal('none')]).optional(),
  skill: z.string().trim().min(1).max(100).optional(),
}).strict();
export type ListVolunteersQuery = z.infer<typeof listVolunteersQuerySchema>;

const adminSkillsSchema = z.array(z.string().trim().min(1).max(100)).max(32)
  .refine(skills => new Set(skills.map(skill => skill.toLowerCase())).size === skills.length, 'Skills must be unique.');
const registrationCodeSchema = z.string().trim().min(1).max(64);
const adminPhoneSchema = phoneE164Schema.nullable();

export const createAdminVolunteerSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(200),
  phoneE164: adminPhoneSchema.optional().default(null),
  registrationCode: registrationCodeSchema,
  skills: adminSkillsSchema.default([]),
  status: volunteerStatusSchema.default('ACTIVE'),
});
export type CreateAdminVolunteerInput = z.infer<typeof createAdminVolunteerSchema>;

export const updateAdminVolunteerSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  phoneE164: adminPhoneSchema.optional(),
  registrationCode: registrationCodeSchema.optional(),
  skills: adminSkillsSchema.optional(),
  status: volunteerStatusSchema.optional(),
}).refine(value => Object.keys(value).length > 0, 'Provide at least one editable volunteer field.');
export type UpdateAdminVolunteerInput = z.infer<typeof updateAdminVolunteerSchema>;

export const setAdminVolunteerPasswordSchema = z.strictObject({
  password: z.string().min(8).max(128),
});
export type SetAdminVolunteerPasswordInput = z.infer<typeof setAdminVolunteerPasswordSchema>;

export const listTeamsQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
}).strict();
export type ListTeamsQuery = z.infer<typeof listTeamsQuerySchema>;

const memberIdsSchema = z.array(uuidSchema).refine(ids => new Set(ids).size === ids.length, 'Team members must be unique.');
const teamNameSchema = z.string().trim().min(1).max(200);

export const createTeamSchema = z.strictObject({
  name: teamNameSchema,
  leaderVolunteerId: uuidSchema.nullable().default(null),
  memberIds: memberIdsSchema.default([]),
}).refine(value => !value.leaderVolunteerId || value.memberIds.includes(value.leaderVolunteerId), {
  path: ['leaderVolunteerId'], message: 'The leader must be a team member.',
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z.strictObject({
  name: teamNameSchema.optional(),
  leaderVolunteerId: uuidSchema.nullable().optional(),
  memberIds: memberIdsSchema.optional(),
}).refine(value => Object.keys(value).length > 0, 'Provide at least one team field.');
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
