import { z } from 'zod';
import { utcDateTimeSchema, uuidSchema } from './common';

export const volunteerStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const volunteerApplicationStatusSchema = z.enum(['PENDING', 'APPROVED', 'DENIED']);
const volunteerSkillsSchema = z.array(z.string().trim().min(1).max(100)).max(32)
  .refine(skills => new Set(skills.map(skill => skill.toLowerCase())).size === skills.length, 'Skills must be unique.');
export const volunteerRegistrationInputSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(200),
  phoneE164: z.string().regex(/^\+[1-9][0-9]{7,14}$/, 'Use an E.164 phone number.').nullable().optional().default(null),
  registrationCode: z.string().trim().min(1).max(64),
  skills: volunteerSkillsSchema.default([]),
});
export const volunteerRegistrationResultSchema = z.object({
  status: z.literal('PENDING'),
  message: z.string(),
});
export const volunteerApplicationSchema = z.object({
  volunteerId: uuidSchema,
  email: z.string().email(),
  name: z.string(),
  phoneE164: z.string().nullable(),
  registrationCode: z.string(),
  skills: z.array(z.string()),
  applicationId: uuidSchema,
  status: volunteerApplicationStatusSchema,
  submittedAt: utcDateTimeSchema,
});
export const volunteerApprovalDecisionSchema = z.strictObject({
  status: z.enum(['APPROVED', 'DENIED']),
});
const availabilityFields = z.object({ startsAt: utcDateTimeSchema, endsAt: utcDateTimeSchema, state: z.enum(['AVAILABLE', 'UNAVAILABLE']) });
export const availabilityInputSchema = availabilityFields.refine(value => new Date(value.startsAt) < new Date(value.endsAt), { path: ['endsAt'], message: 'End must follow start.' });
export const availabilitySchema = availabilityFields.extend({ id: uuidSchema, volunteerId: uuidSchema });
export const volunteerSchema = z.object({ id: uuidSchema, personId: uuidSchema, registrationCode: z.string(), name: z.string(), phoneE164: z.string().nullable(), skills: z.array(z.string()), status: volunteerStatusSchema });
export const teamSchema = z.object({ id: uuidSchema, name: z.string(), leaderVolunteerId: uuidSchema.nullable(), memberIds: z.array(uuidSchema) });
export type Volunteer = z.infer<typeof volunteerSchema>;
export type VolunteerApplicationStatus = z.infer<typeof volunteerApplicationStatusSchema>;
export type VolunteerRegistrationInput = z.infer<typeof volunteerRegistrationInputSchema>;
export type VolunteerRegistrationResult = z.infer<typeof volunteerRegistrationResultSchema>;
export type VolunteerApplication = z.infer<typeof volunteerApplicationSchema>;
export type VolunteerApprovalDecision = z.infer<typeof volunteerApprovalDecisionSchema>;
export type Availability = z.infer<typeof availabilitySchema>;
export type Team = z.infer<typeof teamSchema>;
export type CreateAvailabilityRequest = z.infer<typeof availabilityInputSchema>;
