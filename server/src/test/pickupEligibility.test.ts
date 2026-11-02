import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const {
  findById,
  listReservedPersonIds,
  listEligibleVolunteerRows,
  verify,
  findUser,
  query,
} = vi.hoisted(() => ({
  findById: vi.fn(),
  listReservedPersonIds: vi.fn(),
  listEligibleVolunteerRows: vi.fn(),
  verify: vi.fn(),
  findUser: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../modules/pickups/repository', () => ({
  findById,
  listReservedPersonIds,
}));
vi.mock('../modules/volunteers/repository', () => ({
  listEligibleVolunteerRows,
}));
vi.mock('../auth/supabase', () => ({ verifySupabaseToken: verify }));
vi.mock('../auth/appUsers', () => ({ findOrCreateAppUser: findUser }));
vi.mock('../db/pool', () => ({
  getPool: () => ({ query }),
  withTransaction: async (run: (client: { query: typeof query }) => Promise<unknown>) => run({ query }),
}));

import { assertPickupWindowIsUpcoming, listEligibleVolunteersForPickup } from '../modules/pickups/service';
import type { VolunteerPort } from '../modules/pickups/ports';
import { app } from '../app';

const pickupId = 'c0000000-0000-4000-8000-000000000001';
const volunteerId = '071cb1f9-b0a8-4e99-8661-1ef180591083';
const alternateVolunteerId = 'c0000000-0000-4000-8000-000000000002';
const reservedVolunteerId = 'c0000000-0000-4000-8000-000000000003';
const volunteerPersonId = 'd0000000-0000-4000-8000-000000000001';
const alternatePersonId = 'd0000000-0000-4000-8000-000000000002';
const reservedPersonId = 'd0000000-0000-4000-8000-000000000003';
const windowStartsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
const windowEndsAt = new Date(windowStartsAt.getTime() + 3.5 * 60 * 60 * 1000);

const pickup = {
  id: pickupId,
  food_request_id: 'e0000000-0000-4000-8000-000000000001',
  status: 'PLANNED' as const,
  window_starts_at: windowStartsAt,
  window_ends_at: windowEndsAt,
  delivery_address: 'Distribution center',
  version: 0,
  created_at: new Date('2026-10-29T10:00:00.000Z'),
};
const admin = {
  id: 'a0000000-0000-4000-8000-000000000001',
  authUserId: 'b0000000-0000-4000-8000-000000000001',
  role: 'ADMIN',
  displayName: 'Admin User',
};

const volunteerPort: VolunteerPort = {
  listEligibleVolunteers: vi.fn().mockResolvedValue([
    { id: volunteerId, personId: volunteerPersonId, status: 'ACTIVE', isAvailable: true },
    { id: alternateVolunteerId, personId: alternatePersonId, status: 'ACTIVE', isAvailable: true },
    { id: reservedVolunteerId, personId: reservedPersonId, status: 'ACTIVE', isAvailable: true },
  ]),
  getVolunteerAvailability: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  findById.mockResolvedValue(pickup);
  listReservedPersonIds.mockResolvedValue([reservedPersonId]);
  listEligibleVolunteerRows.mockResolvedValue([
    { id: volunteerId, person_id: volunteerPersonId, status: 'ACTIVE' },
    { id: alternateVolunteerId, person_id: alternatePersonId, status: 'ACTIVE' },
  ]);
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM app.food_requests')) {
      return {
        rows: [{
          id: pickup.food_request_id,
          status: 'SUBMITTED',
          safety_review: 'APPROVED',
          ready_at: new Date(Date.now() - 60 * 60 * 1000),
          pickup_deadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
        }],
      };
    }
    return { rows: [] };
  });
  verify.mockResolvedValue({ authUserId: admin.authUserId, email: 'admin@example.com' });
  findUser.mockResolvedValue(admin);
});

describe('Pickup volunteer window eligibility', () => {
  describe('GET /api/v1/pickups/:id/eligible-volunteers', () => {
    it('returns 200 with eligible volunteers and the persisted pickup window', async () => {
      listReservedPersonIds.mockResolvedValue([]);

      const response = await request(app)
        .get(`/api/v1/pickups/${pickupId}/eligible-volunteers`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(listEligibleVolunteerRows).toHaveBeenCalledWith(
        windowStartsAt,
        windowEndsAt,
        undefined,
        undefined
      );
      expect(response.body).toMatchObject({
        success: true,
        data: {
          windowStartsAt: windowStartsAt.toISOString(),
          windowEndsAt: windowEndsAt.toISOString(),
          volunteerIds: [volunteerId, alternateVolunteerId],
          reservationConflictVolunteerIds: [],
          blockingReason: null,
          foodPickupDeadline: expect.any(String),
          requiresNewDonorRequest: false,
        },
      });
    });

    it('returns 400 for an invalid pickup ID without querying eligibility', async () => {
      const response = await request(app)
        .get('/api/v1/pickups/not-a-uuid/eligible-volunteers')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(findById).not.toHaveBeenCalled();
    });

    it('returns 404 when the pickup does not exist', async () => {
      findById.mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/api/v1/pickups/${pickupId}/eligible-volunteers`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(listEligibleVolunteerRows).not.toHaveBeenCalled();
    });

    it('returns 200 with an empty list when no volunteer covers the window', async () => {
      listEligibleVolunteerRows.mockResolvedValue([]);

      const response = await request(app)
        .get(`/api/v1/pickups/${pickupId}/eligible-volunteers`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.data.volunteerIds).toEqual([]);
      expect(response.body.data.reservationConflictVolunteerIds).toEqual([]);
      expect(response.body.data.blockingReason).toBeNull();
    });

    it('blocks an expired food deadline with explicit new-donor-request recovery guidance', async () => {
      query.mockImplementation(async (sql: string) => sql.includes('FROM app.food_requests')
        ? {
          rows: [{
            id: pickup.food_request_id,
            status: 'SUBMITTED',
            safety_review: 'APPROVED',
            ready_at: new Date(Date.now() - 48 * 60 * 60 * 1000),
            pickup_deadline: new Date(Date.now() - 60 * 60 * 1000),
          }],
        }
        : { rows: [] });

      const response = await request(app)
        .get(`/api/v1/pickups/${pickupId}/eligible-volunteers`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.data.volunteerIds).toEqual([]);
      expect(response.body.data.requiresNewDonorRequest).toBe(true);
      expect(response.body.data.blockingReason).toContain('Do not extend or reuse this request');
      expect(response.body.data.blockingReason).toContain('submit a new request');
      expect(listEligibleVolunteerRows).not.toHaveBeenCalled();
    });

    it('blocks a pickup window outside food readiness/deadline bounds', async () => {
      query.mockImplementation(async (sql: string) => sql.includes('FROM app.food_requests')
        ? {
          rows: [{
            id: pickup.food_request_id,
            status: 'SUBMITTED',
            safety_review: 'APPROVED',
            ready_at: new Date(windowStartsAt.getTime() + 60_000),
            pickup_deadline: new Date(windowEndsAt.getTime() - 60_000),
          }],
        }
        : { rows: [] });

      const response = await request(app)
        .get(`/api/v1/pickups/${pickupId}/eligible-volunteers`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.data.volunteerIds).toEqual([]);
      expect(response.body.data.blockingReason).toContain("within the food request's valid window");
      expect(listEligibleVolunteerRows).not.toHaveBeenCalled();
    });

    it('returns 409 for a pickup that is not PLANNED', async () => {
      findById.mockResolvedValueOnce({ ...pickup, status: 'ASSIGNED' });

      const response = await request(app)
        .get(`/api/v1/pickups/${pickupId}/eligible-volunteers`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(response.body.error.message).toContain('ASSIGNED');
      expect(listEligibleVolunteerRows).not.toHaveBeenCalled();
    });

    it('returns 200 with a blocking reason and no volunteers for a started pickup window', async () => {
      findById.mockResolvedValueOnce({
        ...pickup,
        window_starts_at: new Date(Date.now() - 60_000),
        window_ends_at: new Date(Date.now() - 30_000),
      });

      const response = await request(app)
        .get(`/api/v1/pickups/${pickupId}/eligible-volunteers`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.data.volunteerIds).toEqual([]);
      expect(response.body.data.reservationConflictVolunteerIds).toEqual([]);
      expect(response.body.data.blockingReason).toContain('Pickup window has started or expired');
      expect(listEligibleVolunteerRows).not.toHaveBeenCalled();
    });

    it('reports real active reservation conflicts without misclassifying them as API failures', async () => {
      listReservedPersonIds.mockResolvedValue([volunteerPersonId, reservedPersonId]);

      const response = await request(app)
        .get(`/api/v1/pickups/${pickupId}/eligible-volunteers`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.data.volunteerIds).toEqual([alternateVolunteerId]);
      expect(response.body.data.reservationConflictVolunteerIds).toEqual([volunteerId]);
      expect(response.body.data.blockingReason).toBeNull();
    });
  });

  it('rejects a pickup window that has started, including the exact start boundary', () => {
    const now = new Date('2026-10-28T12:46:39.884Z');
    expect(() => assertPickupWindowIsUpcoming(new Date(now.getTime() - 1), now))
      .toThrow('Reschedule the pickup');
    expect(() => assertPickupWindowIsUpcoming(now, now))
      .toThrow('Reschedule the pickup');
    expect(() => assertPickupWindowIsUpcoming(new Date(now.getTime() + 1), now))
      .not.toThrow();
  });

  it('uses the persisted pickup window and offers schedule-eligible alternatives without reservation conflicts', async () => {
    const result = await listEligibleVolunteersForPickup(pickupId, volunteerPort);

    expect(volunteerPort.listEligibleVolunteers).toHaveBeenCalledWith(
      { startAt: windowStartsAt, endAt: windowEndsAt },
      undefined
    );
    expect(listReservedPersonIds).toHaveBeenCalledWith(
      [volunteerPersonId, alternatePersonId, reservedPersonId],
      windowStartsAt,
      windowEndsAt,
      undefined
    );
    expect(result).toEqual({
      windowStartsAt: windowStartsAt.toISOString(),
      windowEndsAt: windowEndsAt.toISOString(),
      volunteerIds: [volunteerId, alternateVolunteerId],
      reservationConflictVolunteerIds: [reservedVolunteerId],
      blockingReason: null,
      foodPickupDeadline: expect.any(String),
      requiresNewDonorRequest: false,
    });
  });

  it('rejects missing and non-planned pickups before checking volunteer eligibility', async () => {
    findById.mockResolvedValueOnce(null);
    await expect(listEligibleVolunteersForPickup(pickupId, volunteerPort))
      .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });

    findById.mockResolvedValueOnce({ ...pickup, status: 'ASSIGNED' });
    await expect(listEligibleVolunteersForPickup(pickupId, volunteerPort))
      .rejects.toMatchObject({ status: 409, code: 'RESOURCE_CONFLICT' });

    expect(volunteerPort.listEligibleVolunteers).not.toHaveBeenCalled();
    expect(listReservedPersonIds).not.toHaveBeenCalled();
  });

  it('returns a blocked empty eligibility result without querying volunteers for a started pickup window', async () => {
    findById.mockResolvedValueOnce({
      ...pickup,
      window_starts_at: new Date(Date.now() - 60_000),
    });

    await expect(listEligibleVolunteersForPickup(pickupId, volunteerPort))
      .resolves.toMatchObject({
        volunteerIds: [],
        reservationConflictVolunteerIds: [],
        blockingReason: expect.stringContaining('Pickup window has started or expired'),
      });
    expect(volunteerPort.listEligibleVolunteers).not.toHaveBeenCalled();
    expect(listReservedPersonIds).not.toHaveBeenCalled();
  });
});
