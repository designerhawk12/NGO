import { describe, expect, it } from 'vitest';
import { createAssignmentSchema, createFoodRequestSchema, createVehicleMaintenanceRecordSchema, vehicleSchema } from '@aaharaconnect/shared';

describe('shared request contracts', () => {
  it('allows driver-only assignments while requiring a valid driver and validating a supplied vehicle', () => {
    const id = 'a0000000-0000-4000-8000-000000000001';
    const input = { teamId: null, volunteerIds: [], driverId: id, role: 'Pickup', windowStartsAt: '2030-10-10T10:00:00Z', windowEndsAt: '2030-10-10T12:00:00Z', containers: [] };
    expect(createAssignmentSchema.safeParse(input).success).toBe(true);
    expect(createAssignmentSchema.safeParse({ ...input, driverId: undefined }).success).toBe(false);
    expect(createAssignmentSchema.safeParse({ ...input, vehicleId: 'invalid' }).success).toBe(false);
  });
  it('requires food handling facts and a positive quantity before donor submission', () => {
    const base = {
      sourceName: 'Community event', sourceType: 'Event', pickupAddress: 'Bengaluru',
      preparedAt: '2026-10-10T08:00:00Z', readyAt: '2026-10-10T10:00:00Z', pickupDeadline: '2026-10-10T12:00:00Z',
      contactName: 'Donor', contactPhoneE164: '+919876543210', handlingRequirements: 'Keep chilled',
      donorSafetyDeclaration: true, estimatedWeightKg: 25,
      items: [{ foodType: 'Cooked meals', quantity: 100, unit: 'MEALS', handlingRequirements: 'Keep chilled' }],
    };
    expect(createFoodRequestSchema.safeParse(base).success).toBe(true);
    expect(createFoodRequestSchema.safeParse({ ...base, donorSafetyDeclaration: false }).success).toBe(false);
    expect(createFoodRequestSchema.safeParse({ ...base, pickupDeadline: '2026-10-10T09:00:00Z' }).success).toBe(false);
    expect(createFoodRequestSchema.safeParse({ ...base, items: [{ ...base.items[0], quantity: 0 }] }).success).toBe(false);
  });

  it('rejects duplicate volunteer IDs and inverted assignment windows', () => {
    const id = '763a7b20-2595-4396-8c42-eac494f5e37c';
    const base = { teamId: null, volunteerIds: [id], driverId: id, vehicleId: id, role: 'Pickup', windowStartsAt: '2026-10-10T10:00:00Z', windowEndsAt: '2026-10-10T12:00:00Z', containers: [] };
    expect(createAssignmentSchema.safeParse(base).success).toBe(true);
    expect(createAssignmentSchema.safeParse({ ...base, volunteerIds: [id, id] }).success).toBe(false);
    expect(createAssignmentSchema.safeParse({ ...base, windowEndsAt: '2026-10-10T09:00:00Z' }).success).toBe(false);
  });

  it('keeps old vehicle responses valid while checking new specifications and maintenance facts', () => {
    const id = '763a7b20-2595-4396-8c42-eac494f5e37c';
    const vehicle = { id, registrationNumber: 'KA01AB1234', kind: 'Van', capacityKg: 250, status: 'ACTIVE' };
    expect(vehicleSchema.safeParse(vehicle).success).toBe(true);
    expect(vehicleSchema.safeParse({ ...vehicle, sizeCategory: 'MEDIUM', indicativeMaxVessels: 12 }).success).toBe(true);
    expect(vehicleSchema.safeParse({ ...vehicle, indicativeMaxVessels: 0 }).success).toBe(false);
    const service = { servicedOn: '2026-10-01', condition: 'GOOD', summary: 'Routine inspection', nextServiceDueOn: null };
    expect(createVehicleMaintenanceRecordSchema.safeParse(service).success).toBe(true);
    expect(createVehicleMaintenanceRecordSchema.safeParse({ ...service, condition: 'UNKNOWN' }).success).toBe(false);
  });
});
