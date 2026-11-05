import { z } from 'zod';
import { uuidSchema } from './common';

// NGO employee drivers are staff records, not Volunteers and not login accounts.
// Each employee driver is permanently linked to exactly one registered vehicle.
export const driverTypeSchema = z.enum(['LEGACY_VOLUNTEER', 'EMPLOYEE']);
export const employeeDriverStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

// Indian mobile numbers only: +91 followed by 10 digits starting 6-9.
export const indianMobileE164Schema = z.string().trim()
  .regex(/^\+91[6-9][0-9]{9}$/, 'Enter a valid Indian mobile number (+91 followed by 10 digits).');
export const drivingLicenceNumberSchema = z.string().trim().toUpperCase()
  .min(5, 'Enter the full driving licence number.').max(40)
  .regex(/^[A-Z0-9][A-Z0-9 /-]+$/, 'Licence numbers may contain letters, digits, spaces, / and -.');
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.')
  .refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Enter a valid date.');
const employeeCodeSchema = z.string().trim().min(1).max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 /_-]*$/, 'Employee IDs may contain letters, digits, spaces, /, _ and -.');

export const driverEmailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);

export const createEmployeeDriverSchema = z.strictObject({
  name: z.string().trim().min(2, 'Enter the driver’s full name.').max(200),
  phoneE164: indianMobileE164Schema,
  licenceNumber: drivingLicenceNumberSchema,
  licenceExpiresOn: isoDateSchema,
  employeeCode: employeeCodeSchema.nullable().optional(),
  // The driver receives a secure invitation at this address and sets their own password.
  email: driverEmailSchema,
  vehicleId: uuidSchema,
});
export type CreateEmployeeDriver = z.infer<typeof createEmployeeDriverSchema>;

// Invite an existing employee driver (registered before app sign-in existed) to the Android app.
export const inviteEmployeeDriverSchema = z.strictObject({ email: driverEmailSchema });
export type InviteEmployeeDriver = z.infer<typeof inviteEmployeeDriverSchema>;

// The fixed vehicle is intentionally absent: any vehicleId in an edit request is rejected.
export const updateEmployeeDriverSchema = z.strictObject({
  name: z.string().trim().min(2).max(200).optional(),
  phoneE164: indianMobileE164Schema.optional(),
  licenceNumber: drivingLicenceNumberSchema.optional(),
  licenceExpiresOn: isoDateSchema.optional(),
  employeeCode: employeeCodeSchema.nullable().optional(),
  status: employeeDriverStatusSchema.optional(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).refine(value => Object.keys(value).some(key => key !== 'expectedUpdatedAt'), {
  message: 'Provide at least one driver field to update.',
});
export type UpdateEmployeeDriver = z.infer<typeof updateEmployeeDriverSchema>;

export const driverVehicleSummarySchema = z.object({
  id: uuidSchema,
  registrationNumber: z.string(),
  kind: z.string(),
  capacityKg: z.number(),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'RETIRED']),
  sizeCategory: z.enum(['SMALL', 'MEDIUM', 'LARGE']).nullable(),
  indicativeMaxVessels: z.number().int().nullable(),
});
export type DriverVehicleSummary = z.infer<typeof driverVehicleSummarySchema>;

export const employeeDriverSchema = z.object({
  driverId: uuidSchema,
  personId: uuidSchema,
  driverType: driverTypeSchema,
  name: z.string(),
  phone: z.string(),
  employeeCode: z.string().nullable(),
  licenceNumber: z.string(),
  licenceExpiresOn: z.string(),
  licenceExpired: z.boolean(),
  status: employeeDriverStatusSchema,
  vehicle: driverVehicleSummarySchema.nullable(),
  loginEmail: z.string().nullable(),
  hasAppLogin: z.boolean(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type EmployeeDriver = z.infer<typeof employeeDriverSchema>;

// What a signed-in DRIVER sees about themself on Android.
export type DriverSelfProfile = Pick<EmployeeDriver,
  'driverId' | 'name' | 'phone' | 'employeeCode' | 'licenceNumber' | 'licenceExpiresOn' | 'licenceExpired' | 'status' | 'vehicle'>;

export const driverVehicleOptionSchema = driverVehicleSummarySchema.extend({
  eligible: z.boolean(),
  reason: z.string().nullable(),
});
export type DriverVehicleOption = z.infer<typeof driverVehicleOptionSchema>;
