import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { verify, findUser, query } = vi.hoisted(() => ({
  verify: vi.fn(),
  findUser: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../auth/supabase', () => ({ verifySupabaseToken: verify }));
vi.mock('../auth/appUsers', () => ({ findOrCreateAppUser: findUser }));
vi.mock('../db/pool', () => ({
  getPool: () => ({ query }),
  withTransaction: async (run: (client: { query: typeof query }) => Promise<unknown>) => run({ query }),
}));

import { app } from '../app';
import { cancelForFoodRequest } from '../modules/pickups/service';

const admin = {
  id: 'a0000000-0000-4000-8000-000000000001',
  authUserId: 'b0000000-0000-4000-8000-000000000001',
  role: 'ADMIN',
  displayName: 'Admin User',
};

const volunteer = {
  id: 'a0000000-0000-4000-8000-000000000002',
  authUserId: 'b0000000-0000-4000-8000-000000000002',
  role: 'VOLUNTEER',
  displayName: 'Volunteer User',
};

const unassignedVolunteer = {
  id: 'a0000000-0000-4000-8000-000000000004',
  authUserId: 'b0000000-0000-4000-8000-000000000004',
  role: 'VOLUNTEER',
  displayName: 'Unassigned Volunteer User',
};

const donor = {
  id: 'a0000000-0000-4000-8000-000000000003',
  authUserId: 'b0000000-0000-4000-8000-000000000003',
  role: 'DONOR',
  displayName: 'Donor User',
};

const validPickupPayload = {
  foodRequestId: 'f0000000-0000-4000-8000-000000000001',
  windowStartsAt: '2026-10-10T10:00:00.000Z',
  windowEndsAt: '2026-10-10T12:00:00.000Z',
  deliveryAddress: 'Central Food Hub, Bengaluru',
};

beforeEach(() => {
  vi.clearAllMocks();
  query.mockReset();
  verify.mockResolvedValue({ authUserId: admin.authUserId, email: 'admin@example.com' });
  findUser.mockResolvedValue(admin);
});

describe('Pickups API (PR1)', () => {
  describe('Authentication & Authorization', () => {
    it('rejects unauthenticated requests to POST /pickups with 401', async () => {
      const res = await request(app).post('/api/v1/pickups').send(validPickupPayload);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects non-admin (VOLUNTEER) access to POST /pickups with 403', async () => {
      findUser.mockResolvedValue(volunteer);
      const res = await request(app)
        .post('/api/v1/pickups')
        .set('Authorization', 'Bearer token')
        .send(validPickupPayload);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects non-admin access to GET /pickups with 403', async () => {
      findUser.mockResolvedValue(volunteer);
      const res = await request(app)
        .get('/api/v1/pickups')
        .set('Authorization', 'Bearer token');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects non-admin access to GET /pickups/:id with 403', async () => {
      findUser.mockResolvedValue(volunteer);
      const res = await request(app)
        .get(`/api/v1/pickups/${validPickupPayload.foodRequestId}`)
        .set('Authorization', 'Bearer token');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Validation', () => {
    it('rejects payload missing required fields with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/pickups')
        .set('Authorization', 'Bearer token')
        .send({ deliveryAddress: 'Somewhere' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects windowEndsAt before windowStartsAt with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/pickups')
        .set('Authorization', 'Bearer token')
        .send({
          ...validPickupPayload,
          windowStartsAt: '2026-10-10T12:00:00.000Z',
          windowEndsAt: '2026-10-10T10:00:00.000Z',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects non-UUID pickup ID with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get('/api/v1/pickups/not-a-uuid')
        .set('Authorization', 'Bearer token');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid pagination limit with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get('/api/v1/pickups?limit=500')
        .set('Authorization', 'Bearer token');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Preconditions via FoodPort & Conflict Rules', () => {
    it('returns 404 NOT_FOUND when food request does not exist', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM app.food_requests')) return { rows: [] };
        return { rows: [] };
      });

      const res = await request(app)
        .post('/api/v1/pickups')
        .set('Authorization', 'Bearer token')
        .send(validPickupPayload);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 RESOURCE_CONFLICT when food request status is not SUBMITTED', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM app.food_requests')) {
          return {
            rows: [{
              id: validPickupPayload.foodRequestId,
              status: 'CANCELLED',
              safety_review: 'APPROVED',
              pickup_deadline: new Date('2026-10-10T14:00:00Z'),
              ready_at: new Date('2026-10-10T09:00:00Z'),
            }],
          };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post('/api/v1/pickups')
        .set('Authorization', 'Bearer token')
        .send(validPickupPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('SUBMITTED');
    });

    it('returns 409 RESOURCE_CONFLICT when food request safety review is not APPROVED', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM app.food_requests')) {
          return {
            rows: [{
              id: validPickupPayload.foodRequestId,
              status: 'SUBMITTED',
              safety_review: 'PENDING',
              pickup_deadline: new Date('2026-10-10T14:00:00Z'),
              ready_at: new Date('2026-10-10T09:00:00Z'),
            }],
          };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post('/api/v1/pickups')
        .set('Authorization', 'Bearer token')
        .send(validPickupPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('APPROVED');
    });

    it('returns 409 RESOURCE_CONFLICT when a pickup already exists for this food request', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM app.food_requests')) {
          return {
            rows: [{
              id: validPickupPayload.foodRequestId,
              status: 'SUBMITTED',
              safety_review: 'APPROVED',
              pickup_deadline: new Date('2026-10-10T14:00:00Z'),
              ready_at: new Date('2026-10-10T09:00:00Z'),
            }],
          };
        }
        if (sql.includes('FROM app.pickups') && sql.includes('food_request_id = $1')) {
          return {
            rows: [{
              id: 'c0000000-0000-4000-8000-000000000001',
              food_request_id: validPickupPayload.foodRequestId,
              status: 'PLANNED',
              window_starts_at: new Date(validPickupPayload.windowStartsAt),
              window_ends_at: new Date(validPickupPayload.windowEndsAt),
              delivery_address: validPickupPayload.deliveryAddress,
              version: 0,
              created_at: new Date(),
            }],
          };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post('/api/v1/pickups')
        .set('Authorization', 'Bearer token')
        .send(validPickupPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
    });

    it('maps Postgres unique violation (code 23505) to 409 RESOURCE_CONFLICT', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM app.food_requests')) {
          return {
            rows: [{
              id: validPickupPayload.foodRequestId,
              status: 'SUBMITTED',
              safety_review: 'APPROVED',
              pickup_deadline: new Date('2026-10-10T14:00:00Z'),
              ready_at: new Date('2026-10-10T09:00:00Z'),
            }],
          };
        }
        if (sql.includes('FROM app.pickups') && sql.includes('food_request_id = $1')) {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO app.pickups')) {
          const err = new Error('duplicate key value violates unique constraint') as Error & { code: string };
          err.code = '23505';
          throw err;
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post('/api/v1/pickups')
        .set('Authorization', 'Bearer token')
        .send(validPickupPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
    });
  });

  describe('Successful Creation & Retrieval', () => {
    it('creates a pickup and initial status event returning 201 with PLANNED status', async () => {
      const pickupId = 'c0000000-0000-4000-8000-000000000001';
      const createdAt = new Date('2026-10-01T12:00:00Z');

      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM app.food_requests')) {
          return {
            rows: [{
              id: validPickupPayload.foodRequestId,
              status: 'SUBMITTED',
              safety_review: 'APPROVED',
              pickup_deadline: new Date('2026-10-10T14:00:00Z'),
              ready_at: new Date('2026-10-10T09:00:00Z'),
            }],
          };
        }
        if (sql.includes('FROM app.pickups') && sql.includes('food_request_id = $1')) {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO app.pickups')) {
          return {
            rows: [{
              id: pickupId,
              food_request_id: validPickupPayload.foodRequestId,
              window_starts_at: new Date(validPickupPayload.windowStartsAt),
              window_ends_at: new Date(validPickupPayload.windowEndsAt),
              delivery_address: validPickupPayload.deliveryAddress,
              status: 'PLANNED',
              version: 0,
              created_at: createdAt,
            }],
          };
        }
        if (sql.includes('INSERT INTO app.pickup_status_events')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post('/api/v1/pickups')
        .set('Authorization', 'Bearer token')
        .send(validPickupPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: pickupId,
        foodRequestId: validPickupPayload.foodRequestId,
        status: 'PLANNED',
        version: 0,
        deliveryAddress: validPickupPayload.deliveryAddress,
      });

      const eventCall = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO app.pickup_status_events'));
      expect(eventCall).toBeDefined();
      expect(eventCall?.[1]).toContain(pickupId);
      expect(eventCall?.[1]).toContain('PLANNED');
    });

    it('retrieves pickup by ID with 200', async () => {
      const pickupId = 'c0000000-0000-4000-8000-000000000001';
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM app.pickups WHERE id = $1')) {
          return {
            rows: [{
              id: pickupId,
              food_request_id: validPickupPayload.foodRequestId,
              window_starts_at: new Date(validPickupPayload.windowStartsAt),
              window_ends_at: new Date(validPickupPayload.windowEndsAt),
              delivery_address: validPickupPayload.deliveryAddress,
              status: 'PLANNED',
              version: 0,
              created_at: new Date('2026-10-01T12:00:00Z'),
            }],
          };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .get(`/api/v1/pickups/${pickupId}`)
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(pickupId);
      expect(res.body.data.deliveryAddress).toBe(validPickupPayload.deliveryAddress);
    });

    it('returns 404 NOT_FOUND when pickup ID does not exist', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM app.pickups WHERE id = $1')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .get('/api/v1/pickups/a0000000-0000-4000-8000-000000000099')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('lists pickups with cursor pagination', async () => {
      const pickupId1 = 'c0000000-0000-4000-8000-000000000001';
      const pickupId2 = 'c0000000-0000-4000-8000-000000000002';
      const pickupId3 = 'c0000000-0000-4000-8000-000000000003';

      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM app.pickups')) {
          return {
            rows: [
              {
                id: pickupId1,
                food_request_id: validPickupPayload.foodRequestId,
                window_starts_at: new Date(validPickupPayload.windowStartsAt),
                window_ends_at: new Date(validPickupPayload.windowEndsAt),
                delivery_address: 'Addr 1',
                status: 'PLANNED',
                version: 0,
                created_at: new Date('2026-10-01T12:00:00Z'),
              },
              {
                id: pickupId2,
                food_request_id: 'f0000000-0000-4000-8000-000000000002',
                window_starts_at: new Date(validPickupPayload.windowStartsAt),
                window_ends_at: new Date(validPickupPayload.windowEndsAt),
                delivery_address: 'Addr 2',
                status: 'PLANNED',
                version: 0,
                created_at: new Date('2026-10-01T11:00:00Z'),
              },
              {
                id: pickupId3,
                food_request_id: 'f0000000-0000-4000-8000-000000000003',
                window_starts_at: new Date(validPickupPayload.windowStartsAt),
                window_ends_at: new Date(validPickupPayload.windowEndsAt),
                delivery_address: 'Addr 3',
                status: 'PLANNED',
                version: 0,
                created_at: new Date('2026-10-01T10:00:00Z'),
              },
            ],
          };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .get('/api/v1/pickups?limit=2')
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.nextCursor).toBeTruthy();
    });
  });
});

const testPickupId = 'c0000000-0000-4000-8000-000000000001';
const testFoodRequestId = 'f0000000-0000-4000-8000-000000000001';
const testDriverId = 'd0000000-0000-4000-8000-000000000001';
const testVehicleId = 'e0000000-0000-4000-8000-000000000001';
const testVolunteerId1 = 'a0000000-0000-4000-8000-000000000003';
const testVolunteerId2 = 'a0000000-0000-4000-8000-000000000004';
const testPersonDriver = '10000000-0000-4000-8000-000000000001';
const testPersonVol1 = '10000000-0000-4000-8000-000000000002';
const testPersonVol2 = '10000000-0000-4000-8000-000000000003';
const testAssignmentId = '70000000-0000-4000-8000-000000000001';

const validAssignmentPayload = {
  teamId: null,
  volunteerIds: [testVolunteerId1],
  driverId: testDriverId,
  vehicleId: testVehicleId,
  role: 'Pickup Volunteer',
  windowStartsAt: '2026-10-10T10:00:00.000Z',
  windowEndsAt: '2026-10-10T12:00:00.000Z',
  containers: [{ containerType: 'insulated crate', count: 2, estimatedLoadKg: 20 }],
};

function setupDefaultAssignmentDb(overrides: {
  pickup?: Record<string, unknown> | null;
  idempotency?: Record<string, unknown> | null;
  foodRequest?: Record<string, unknown> | null;
  driver?: Record<string, unknown> | null;
  vehicle?: Record<string, unknown> | null;
  volunteer?: Record<string, unknown> | null;
  volunteerAvailable?: boolean;
  volunteerUnavailable?: boolean;
  dbError?: { code: string; message?: string };
} = {}) {
  query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (overrides.dbError) {
      const err = new Error(overrides.dbError.message || 'Database error') as Error & { code: string };
      err.code = overrides.dbError.code;
      throw err;
    }
    if (sql.includes('FROM app.pickups') && sql.includes('FOR UPDATE')) {
      if (overrides.pickup === null) return { rows: [] };
      return {
        rows: [{
          id: testPickupId,
          food_request_id: testFoodRequestId,
          window_starts_at: new Date('2026-10-10T09:00:00.000Z'),
          window_ends_at: new Date('2026-10-10T13:00:00.000Z'),
          delivery_address: '123 Food Street',
          status: 'PLANNED',
          version: 0,
          created_at: new Date('2026-10-01T00:00:00.000Z'),
          ...overrides.pickup,
        }],
      };
    }
    if (sql.includes('FROM app.idempotency_keys')) {
      if (!overrides.idempotency) return { rows: [] };
      return {
        rows: [{
          actor_user_id: admin.id,
          key: 'test-key',
          request_hash: 'test-hash',
          assignment_id: testAssignmentId,
          created_at: new Date(),
          ...overrides.idempotency,
        }],
      };
    }
    if (sql.includes('FROM app.food_requests')) {
      if (overrides.foodRequest === null) return { rows: [] };
      return {
        rows: [{
          id: testFoodRequestId,
          status: 'SUBMITTED',
          safety_review: 'APPROVED',
          pickup_deadline: new Date('2026-10-10T14:00:00.000Z'),
          ready_at: new Date('2026-10-10T09:00:00.000Z'),
          estimated_weight_kg: 20,
          ...overrides.foodRequest,
        }],
      };
    }
    if (sql.includes('FROM app.drivers')) {
      if (overrides.driver === null) return { rows: [] };
      return {
        rows: [{
          id: testDriverId,
          person_id: testPersonDriver,
          licence_number: 'DL12345678',
          licence_expires_on: new Date('2027-01-01'),
          status: 'ACTIVE',
          ...overrides.driver,
        }],
      };
    }
    if (sql.includes('FROM app.vehicles')) {
      if (overrides.vehicle === null) return { rows: [] };
      return {
        rows: [{
          id: testVehicleId,
          registration_number: 'KA01AB1234',
          kind: 'Van',
          capacity_kg: 500,
          status: 'ACTIVE',
          ...overrides.vehicle,
        }],
      };
    }
    if (sql.includes('FROM app.volunteers')) {
      if (overrides.volunteer === null) return { rows: [] };
      return {
        rows: [{
          id: params?.[0] || testVolunteerId1,
          person_id: overrides.volunteer?.person_id ?? (params?.[0] === testVolunteerId2 ? testPersonVol2 : testPersonVol1),
          status: 'ACTIVE',
          ...overrides.volunteer,
        }],
      };
    }
    if (sql.includes('FROM app.volunteer_availability')) {
      if (sql.includes("state = 'AVAILABLE'")) {
        const count = overrides.volunteerAvailable === false ? '0' : '1';
        return { rows: [{ count }] };
      }
      if (sql.includes("state = 'UNAVAILABLE'")) {
        const count = overrides.volunteerUnavailable ? '1' : '0';
        return { rows: [{ count }] };
      }
    }
    if (sql.includes('INSERT INTO app.assignments')) {
      return {
        rows: [{
          id: testAssignmentId,
          pickup_id: testPickupId,
          team_id: null,
          driver_id: testDriverId,
          vehicle_id: testVehicleId,
          role: 'Pickup Volunteer',
          status: 'PENDING',
          version: 0,
          created_at: new Date('2026-10-01T00:00:00.000Z'),
        }],
      };
    }
    if (sql.includes('FROM app.assignments') && sql.includes('WHERE id = $1')) {
      return {
        rows: [{
          id: testAssignmentId,
          pickup_id: testPickupId,
          team_id: null,
          driver_id: testDriverId,
          vehicle_id: testVehicleId,
          role: 'Pickup Volunteer',
          status: 'PENDING',
          version: 0,
          created_at: new Date('2026-10-01T00:00:00.000Z'),
        }],
      };
    }
    if (sql.includes('FROM app.assignment_members WHERE assignment_id = $1')) {
      return {
        rows: [{ volunteer_id: testVolunteerId1 }],
      };
    }
    return { rows: [] };
  });
}

describe('Pickups Assignment & Reservations API (PR2)', () => {
  describe('Authentication & Authorization', () => {
    it('rejects unauthenticated requests to POST /pickups/:id/assignments with 401', async () => {
      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects non-admin (VOLUNTEER) access to POST /pickups/:id/assignments with 403', async () => {
      findUser.mockResolvedValue(volunteer);
      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Validation', () => {
    it('rejects request missing Idempotency-Key header with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .send(validAssignmentPayload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Idempotency-Key');
    });

    it('rejects empty or whitespace Idempotency-Key header with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', '   ')
        .send(validAssignmentPayload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Idempotency-Key');
    });

    it('rejects non-UUID pickup ID with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/pickups/invalid-id/assignments')
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects inverted assignment window with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send({
          ...validAssignmentPayload,
          windowStartsAt: '2026-10-10T12:00:00.000Z',
          windowEndsAt: '2026-10-10T10:00:00.000Z',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects duplicate volunteer IDs in payload with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send({
          ...validAssignmentPayload,
          volunteerIds: [testVolunteerId1, testVolunteerId1],
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Preconditions via Ports & Conflict Rules', () => {
    it('returns 404 NOT_FOUND when pickup does not exist', async () => {
      setupDefaultAssignmentDb({ pickup: null });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 RESOURCE_CONFLICT when pickup is not in PLANNED status', async () => {
      setupDefaultAssignmentDb({ pickup: { status: 'ASSIGNED' } });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('ASSIGNED');
    });

    it('returns 404 NOT_FOUND when food request does not exist', async () => {
      setupDefaultAssignmentDb({ foodRequest: null });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 RESOURCE_CONFLICT when food request status is not SUBMITTED', async () => {
      setupDefaultAssignmentDb({ foodRequest: { status: 'CANCELLED' } });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('SUBMITTED');
    });

    it('returns 409 RESOURCE_CONFLICT when food request safety review is not APPROVED', async () => {
      setupDefaultAssignmentDb({ foodRequest: { safety_review: 'PENDING' } });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('APPROVED');
    });

    it('returns 409 RESOURCE_CONFLICT when assignment window starts before food is ready', async () => {
      setupDefaultAssignmentDb({
        foodRequest: { ready_at: new Date('2026-10-10T11:00:00.000Z') },
      });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('ready');
    });

    it('returns 409 RESOURCE_CONFLICT when assignment window ends after food pickup deadline', async () => {
      setupDefaultAssignmentDb({
        foodRequest: { pickup_deadline: new Date('2026-10-10T11:00:00.000Z') },
      });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('deadline');
    });

    it('returns 404 NOT_FOUND when driver does not exist', async () => {
      setupDefaultAssignmentDb({ driver: null });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 RESOURCE_CONFLICT when driver is not ACTIVE', async () => {
      setupDefaultAssignmentDb({ driver: { status: 'INACTIVE' } });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('Driver');
    });

    it('returns 409 RESOURCE_CONFLICT when driver licence expires before window ends', async () => {
      setupDefaultAssignmentDb({ driver: { licence_expires_on: new Date('2026-10-10T11:00:00.000Z') } });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('licence');
    });

    it('returns 404 NOT_FOUND when vehicle does not exist', async () => {
      setupDefaultAssignmentDb({ vehicle: null });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 RESOURCE_CONFLICT when vehicle is in MAINTENANCE', async () => {
      setupDefaultAssignmentDb({ vehicle: { status: 'MAINTENANCE' } });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('MAINTENANCE');
    });

    it('returns 409 RESOURCE_CONFLICT when vehicle capacity is less than estimated load', async () => {
      setupDefaultAssignmentDb({ vehicle: { capacity_kg: 10 } }); // load is 20 kg

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('capacity');
    });

    it('returns 404 NOT_FOUND when volunteer does not exist', async () => {
      setupDefaultAssignmentDb({ volunteer: null });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 RESOURCE_CONFLICT when volunteer is INACTIVE', async () => {
      setupDefaultAssignmentDb({ volunteer: { status: 'INACTIVE' } });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('active');
    });

    it('returns 409 RESOURCE_CONFLICT when volunteer availability does not cover window', async () => {
      setupDefaultAssignmentDb({ volunteerAvailable: false });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('availability');
    });
  });

  describe('Successful Assignment & Database Insertion', () => {
    it('creates assignment atomically returning 201 with PENDING status', async () => {
      setupDefaultAssignmentDb();

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: testAssignmentId,
        pickupId: testPickupId,
        status: 'PENDING',
        version: 0,
        volunteerIds: [testVolunteerId1],
        driverId: testDriverId,
        vehicleId: testVehicleId,
      });

      // Verify all insertions were dispatched
      const sqlCalls = query.mock.calls.map(([sql]) => sql as string);

      expect(sqlCalls.some(sql => sql.includes('INSERT INTO app.assignments'))).toBe(true);
      expect(sqlCalls.some(sql => sql.includes('INSERT INTO app.assignment_members'))).toBe(true);
      expect(sqlCalls.some(sql => sql.includes('INSERT INTO app.container_plans'))).toBe(true);
      expect(sqlCalls.some(sql => sql.includes('INSERT INTO app.resource_reservations'))).toBe(true);
      expect(sqlCalls.some(sql => sql.includes('INSERT INTO app.assignment_status_events'))).toBe(true);
      expect(sqlCalls.some(sql => sql.includes('UPDATE app.pickups'))).toBe(true);
      expect(sqlCalls.some(sql => sql.includes('INSERT INTO app.pickup_status_events'))).toBe(true);
      expect(sqlCalls.some(sql => sql.includes('INSERT INTO app.idempotency_keys'))).toBe(true);
    });

    it('inserts explicit volunteerIds only into assignment_members', async () => {
      setupDefaultAssignmentDb();

      await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      const memberCalls = query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO app.assignment_members'));
      expect(memberCalls).toHaveLength(1);
      expect(memberCalls[0][1]).toEqual([testAssignmentId, testVolunteerId1]);
    });
  });

  describe('Driver Who Is Also a Volunteer', () => {
    it('deduplicates person reservations when driver is also a volunteer', async () => {
      // Driver and volunteer have the SAME person_id
      const sharedPersonId = '10000000-4000-4000-8000-000000000099';
      setupDefaultAssignmentDb({
        driver: { person_id: sharedPersonId },
        volunteer: { person_id: sharedPersonId },
      });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-shared-person')
        .send(validAssignmentPayload);

      expect(res.status).toBe(201);

      // Verify resource_reservations: exactly 1 person reservation + 1 vehicle reservation = 2 total
      const reservationCalls = query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO app.resource_reservations'));
      expect(reservationCalls).toHaveLength(2);

      const personReservations = reservationCalls.filter(([, params]) => params[1] !== null);
      const vehicleReservations = reservationCalls.filter(([, params]) => params[2] !== null);

      expect(personReservations).toHaveLength(1);
      expect(personReservations[0][1][1]).toBe(sharedPersonId);
      expect(vehicleReservations).toHaveLength(1);
      expect(vehicleReservations[0][1][2]).toBe(testVehicleId);
    });
  });

  describe('Idempotency Replay & Conflict', () => {
    it('returns stored assignment on idempotent replay with same key and same hash', async () => {
      const { computeRequestHash } = await import('../modules/pickups/service');
      const hash = computeRequestHash(testPickupId, validAssignmentPayload);

      setupDefaultAssignmentDb({
        idempotency: {
          key: 'key-1',
          request_hash: hash,
          assignment_id: testAssignmentId,
        },
      });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testAssignmentId);

      // Should NOT insert a new assignment
      const insertCalls = query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO app.assignments'));
      expect(insertCalls).toHaveLength(0);
    });

    it('returns 409 RESOURCE_CONFLICT when reusing idempotency key with different payload', async () => {
      setupDefaultAssignmentDb({
        idempotency: {
          key: 'key-1',
          request_hash: 'a-different-hash-from-previous-request',
          assignment_id: testAssignmentId,
        },
      });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('Idempotency');
    });
  });

  describe('Database Error & Conflict Code Mapping', () => {
    it('maps Postgres 23P01 (exclusion violation) to 409 RESOURCE_CONFLICT', async () => {
      setupDefaultAssignmentDb({
        dbError: { code: '23P01', message: 'conflicting key value violates exclusion constraint' },
      });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
    });

    it('maps Postgres 23514 (check constraint / trigger exception) to 409 RESOURCE_CONFLICT', async () => {
      setupDefaultAssignmentDb({
        dbError: { code: '23514', message: 'Vehicle is not active' },
      });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
    });

    it('maps Postgres 23505 (unique violation) to 409 RESOURCE_CONFLICT', async () => {
      setupDefaultAssignmentDb({
        dbError: { code: '23505', message: 'duplicate key value violates unique constraint' },
      });

      const res = await request(app)
        .post(`/api/v1/pickups/${testPickupId}/assignments`)
        .set('Authorization', 'Bearer token')
        .set('Idempotency-Key', 'key-1')
        .send(validAssignmentPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
    });
  });

  describe.skipIf(!process.env.INTEGRATION_TEST_DB && !process.env.DATABASE_URL)(
    'Pickups Assignment Integration Tests (skipIf real DB available)',
    () => {
      it('two parallel requests: one wins with 201, one gets 409, zero partial rows', async () => {
        const [res1, res2] = await Promise.all([
          request(app)
            .post(`/api/v1/pickups/${testPickupId}/assignments`)
            .set('Authorization', 'Bearer token')
            .set('Idempotency-Key', 'parallel-key-1')
            .send(validAssignmentPayload),
          request(app)
            .post(`/api/v1/pickups/${testPickupId}/assignments`)
            .set('Authorization', 'Bearer token')
            .set('Idempotency-Key', 'parallel-key-2')
            .send(validAssignmentPayload),
        ]);

        const statuses = [res1.status, res2.status].sort();
        expect(statuses).toEqual([201, 409]);
      });

      it('driver who is also a volunteer inserts deduplicated person reservation in real DB', async () => {
        const res = await request(app)
          .post(`/api/v1/pickups/${testPickupId}/assignments`)
          .set('Authorization', 'Bearer token')
          .set('Idempotency-Key', 'shared-driver-vol-key')
          .send({
            ...validAssignmentPayload,
            volunteerIds: [testVolunteerId1],
            driverId: testDriverId,
          });

        expect([201, 409]).toContain(res.status);
      });

      it('vehicle in maintenance is rejected with 409 RESOURCE_CONFLICT', async () => {
        const res = await request(app)
          .post(`/api/v1/pickups/${testPickupId}/assignments`)
          .set('Authorization', 'Bearer token')
          .set('Idempotency-Key', 'maintenance-key')
          .send({
            ...validAssignmentPayload,
            vehicleId: testVehicleId,
          });

        expect([404, 409]).toContain(res.status);
      });

      it('idempotent replay returns stored assignment', async () => {
        const first = await request(app)
          .post(`/api/v1/pickups/${testPickupId}/assignments`)
          .set('Authorization', 'Bearer token')
          .set('Idempotency-Key', 'replay-key-1')
          .send(validAssignmentPayload);

        const replay = await request(app)
          .post(`/api/v1/pickups/${testPickupId}/assignments`)
          .set('Authorization', 'Bearer token')
          .set('Idempotency-Key', 'replay-key-1')
          .send(validAssignmentPayload);

        expect([200, 201]).toContain(replay.status);
        if (first.status === 201) {
          expect(replay.body.data.id).toBe(first.body.data.id);
        }
      });
    }
  );

  describe('Pickup Status Transitions & Volunteer Assignments API (PR3)', () => {
    const pr3AssignmentId = 'a3333333-3333-4000-8000-000000000001';
    const pr3PickupId = 'c3333333-3333-4000-8000-000000000001';
    const pr3FoodRequestId = 'f3333333-3333-4000-8000-000000000001';
    const pr3VolunteerId = 'v3333333-3333-4000-8000-000000000001';
    const pr3DriverId = 'd3333333-3333-4000-8000-000000000001';
    const pr3VehicleId = 'e3333333-3333-4000-8000-000000000001';

    function mockDbForTransition(options: {
      assignmentStatus?: string;
      assignmentVersion?: number;
      pickupStatus?: string;
      pickupVersion?: number;
      isAssigned?: boolean;
      assignmentExists?: boolean;
    }) {
      const assignmentExists = options.assignmentExists ?? true;
      const currentAssignmentStatus = options.assignmentStatus ?? 'PENDING';
      const currentAssignmentVersion = options.assignmentVersion ?? 0;
      const currentPickupStatus = options.pickupStatus ?? 'ASSIGNED';
      const currentPickupVersion = options.pickupVersion ?? 0;
      const isAssigned = options.isAssigned ?? true;

      query.mockImplementation(async (sql: string, params?: unknown[]) => {
        // Volunteer membership check
        if (sql.includes('FROM app.assignment_members am') && sql.includes('JOIN app.volunteers v')) {
          return { rows: isAssigned ? [{ exists: 1 }] : [] };
        }
        // Select assignment for update
        if (sql.includes('FROM app.assignments') && sql.includes('FOR UPDATE')) {
          if (!assignmentExists) return { rows: [] };
          return {
            rows: [{
              id: pr3AssignmentId,
              pickup_id: pr3PickupId,
              team_id: null,
              driver_id: pr3DriverId,
              vehicle_id: pr3VehicleId,
              role: 'Pickup Crew',
              status: currentAssignmentStatus,
              version: currentAssignmentVersion,
              created_at: new Date('2026-10-01T12:00:00Z'),
            }],
          };
        }
        // Update assignment
        if (sql.includes('UPDATE app.assignments')) {
          return {
            rows: [{
              id: pr3AssignmentId,
              pickup_id: pr3PickupId,
              team_id: null,
              driver_id: pr3DriverId,
              vehicle_id: pr3VehicleId,
              role: 'Pickup Crew',
              status: params?.[0] as string,
              version: currentAssignmentVersion + 1,
              created_at: new Date('2026-10-01T12:00:00Z'),
            }],
          };
        }
        // Select pickup for update
        if (sql.includes('FROM app.pickups') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: pr3PickupId,
              food_request_id: pr3FoodRequestId,
              window_starts_at: new Date('2026-10-10T10:00:00Z'),
              window_ends_at: new Date('2026-10-10T12:00:00Z'),
              delivery_address: 'Central Food Hub',
              status: currentPickupStatus,
              version: currentPickupVersion,
              created_at: new Date('2026-10-01T10:00:00Z'),
            }],
          };
        }
        // Update pickup
        if (sql.includes('UPDATE app.pickups')) {
          return {
            rows: [{
              id: pr3PickupId,
              food_request_id: pr3FoodRequestId,
              window_starts_at: new Date('2026-10-10T10:00:00Z'),
              window_ends_at: new Date('2026-10-10T12:00:00Z'),
              delivery_address: 'Central Food Hub',
              status: params?.[0] as string,
              version: currentPickupVersion + 1,
              created_at: new Date('2026-10-01T10:00:00Z'),
            }],
          };
        }
        // Release reservations
        if (sql.includes('UPDATE app.resource_reservations')) {
          return { rowCount: 2 };
        }
        // Status events
        if (sql.includes('INSERT INTO app.assignment_status_events') || sql.includes('INSERT INTO app.pickup_status_events')) {
          return { rows: [] };
        }
        // Assignment volunteer IDs
        if (sql.includes('SELECT volunteer_id FROM app.assignment_members WHERE assignment_id = $1')) {
          return { rows: [{ volunteer_id: pr3VolunteerId }] };
        }
        return { rows: [] };
      });
    }

    describe('Authentication, Authorization & Input Validation', () => {
      it('rejects unauthenticated PATCH /assignments/:id/status with 401', async () => {
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .send({ action: 'ACCEPT', expectedVersion: 0 });
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
      });

      it('rejects unauthenticated GET /assignments/me with 401', async () => {
        const res = await request(app).get('/api/v1/assignments/me');
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
      });

      it('rejects non-volunteer (ADMIN) GET /assignments/me with 403 FORBIDDEN', async () => {
        findUser.mockResolvedValue(admin);
        const res = await request(app)
          .get('/api/v1/assignments/me')
          .set('Authorization', 'Bearer token');
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      });

      it('rejects non-volunteer (DONOR) GET /assignments/me with 403 FORBIDDEN', async () => {
        findUser.mockResolvedValue(donor);
        const res = await request(app)
          .get('/api/v1/assignments/me')
          .set('Authorization', 'Bearer token');
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      });

      it('rejects non-UUID assignment id with 400 VALIDATION_ERROR', async () => {
        findUser.mockResolvedValue(volunteer);
        const res = await request(app)
          .patch('/api/v1/assignments/invalid-uuid/status')
          .set('Authorization', 'Bearer token')
          .send({ action: 'ACCEPT', expectedVersion: 0 });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('rejects invalid action with 400 VALIDATION_ERROR', async () => {
        findUser.mockResolvedValue(volunteer);
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'TELEPORT', expectedVersion: 0 });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('rejects negative expectedVersion with 400 VALIDATION_ERROR', async () => {
        findUser.mockResolvedValue(volunteer);
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'ACCEPT', expectedVersion: -1 });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('rejects DONOR attempting status transitions with 403 FORBIDDEN', async () => {
        findUser.mockResolvedValue(donor);
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'ACCEPT', expectedVersion: 0 });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      });

      it('rejects VOLUNTEER attempting ADMIN-only action DELIVER with 403 FORBIDDEN', async () => {
        findUser.mockResolvedValue(volunteer);
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'DELIVER', expectedVersion: 0 });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      });

      it('rejects VOLUNTEER attempting ADMIN-only action CANCEL with 403 FORBIDDEN', async () => {
        findUser.mockResolvedValue(volunteer);
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'CANCEL', expectedVersion: 0, reason: 'Volunteer emergency' });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      });

      it('rejects VOLUNTEER attempting ADMIN-only action FAIL with 403 FORBIDDEN', async () => {
        findUser.mockResolvedValue(volunteer);
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'FAIL', expectedVersion: 0, reason: 'Vehicle breakdown' });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      });

      it('rejects ADMIN attempting VOLUNTEER-only action ACCEPT with 403 FORBIDDEN', async () => {
        findUser.mockResolvedValue(admin);
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'ACCEPT', expectedVersion: 0 });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      });

      it('rejects ADMIN attempting VOLUNTEER-only action START with 403 FORBIDDEN', async () => {
        findUser.mockResolvedValue(admin);
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'START', expectedVersion: 0 });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      });

      it('rejects unassigned VOLUNTEER attempting ACCEPT with 403 FORBIDDEN', async () => {
        findUser.mockResolvedValue(unassignedVolunteer);
        mockDbForTransition({ isAssigned: false });
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'ACCEPT', expectedVersion: 0 });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      });

      it('rejects ADMIN CANCEL without reason with 400 VALIDATION_ERROR', async () => {
        findUser.mockResolvedValue(admin);
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'CANCEL', expectedVersion: 0 });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('rejects ADMIN CANCEL with whitespace-only reason with 400 VALIDATION_ERROR', async () => {
        findUser.mockResolvedValue(admin);
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'CANCEL', expectedVersion: 0, reason: '   ' });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('rejects ADMIN FAIL without reason with 400 VALIDATION_ERROR', async () => {
        findUser.mockResolvedValue(admin);
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'FAIL', expectedVersion: 0 });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('rejects when assignment is not found with 404 NOT_FOUND', async () => {
        findUser.mockResolvedValue(volunteer);
        mockDbForTransition({ assignmentExists: false, isAssigned: true });
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'ACCEPT', expectedVersion: 0 });
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      });
    });

    describe('Concurrency and Version Conflicts', () => {
      it('returns 409 VERSION_CONFLICT when expectedVersion does not match current version', async () => {
        findUser.mockResolvedValue(volunteer);
        mockDbForTransition({ assignmentStatus: 'PENDING', assignmentVersion: 2, isAssigned: true });
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'ACCEPT', expectedVersion: 0 });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('VERSION_CONFLICT');
      });
    });

    describe('Legal Status Transitions & Side Effects', () => {
      it('assigned VOLUNTEER can ACCEPT: PENDING -> ACCEPTED, mirrors pickup ASSIGNED', async () => {
        findUser.mockResolvedValue(volunteer);
        mockDbForTransition({ assignmentStatus: 'PENDING', assignmentVersion: 0, pickupStatus: 'ASSIGNED', isAssigned: true });
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'ACCEPT', expectedVersion: 0 });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('ACCEPTED');
        expect(res.body.data.version).toBe(1);

        const assignEvent = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO app.assignment_status_events'));
        expect(assignEvent).toBeDefined();
        // Reservations must NOT be released
        const releaseCall = query.mock.calls.find(([sql]) => sql.includes('UPDATE app.resource_reservations'));
        expect(releaseCall).toBeUndefined();
      });

      it('assigned VOLUNTEER can START: ACCEPTED -> EN_ROUTE, mirrors pickup to EN_ROUTE', async () => {
        findUser.mockResolvedValue(volunteer);
        mockDbForTransition({ assignmentStatus: 'ACCEPTED', assignmentVersion: 1, pickupStatus: 'ASSIGNED', isAssigned: true });
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'START', expectedVersion: 1 });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('EN_ROUTE');
        expect(res.body.data.version).toBe(2);

        const pickupUpdate = query.mock.calls.find(([sql, params]) => sql.includes('UPDATE app.pickups') && params?.[0] === 'EN_ROUTE');
        expect(pickupUpdate).toBeDefined();
      });

      it('assigned VOLUNTEER can ARRIVE: EN_ROUTE -> ARRIVED_AT_DONOR, mirrors pickup', async () => {
        findUser.mockResolvedValue(volunteer);
        mockDbForTransition({ assignmentStatus: 'EN_ROUTE', assignmentVersion: 2, pickupStatus: 'EN_ROUTE', isAssigned: true });
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'ARRIVE', expectedVersion: 2 });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('ARRIVED_AT_DONOR');

        const pickupUpdate = query.mock.calls.find(([sql, params]) => sql.includes('UPDATE app.pickups') && params?.[0] === 'ARRIVED_AT_DONOR');
        expect(pickupUpdate).toBeDefined();
      });

      it('assigned VOLUNTEER can COLLECT: ARRIVED_AT_DONOR -> FOOD_COLLECTED, mirrors pickup', async () => {
        findUser.mockResolvedValue(volunteer);
        mockDbForTransition({ assignmentStatus: 'ARRIVED_AT_DONOR', assignmentVersion: 3, pickupStatus: 'ARRIVED_AT_DONOR', isAssigned: true });
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'COLLECT', expectedVersion: 3 });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('FOOD_COLLECTED');

        const pickupUpdate = query.mock.calls.find(([sql, params]) => sql.includes('UPDATE app.pickups') && params?.[0] === 'FOOD_COLLECTED');
        expect(pickupUpdate).toBeDefined();
      });

      it('ADMIN can DELIVER: FOOD_COLLECTED -> DELIVERED, mirrors pickup, releases reservations', async () => {
        findUser.mockResolvedValue(admin);
        mockDbForTransition({ assignmentStatus: 'FOOD_COLLECTED', assignmentVersion: 4, pickupStatus: 'FOOD_COLLECTED' });
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'DELIVER', expectedVersion: 4 });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('DELIVERED');

        const pickupUpdate = query.mock.calls.find(([sql, params]) => sql.includes('UPDATE app.pickups') && params?.[0] === 'DELIVERED');
        expect(pickupUpdate).toBeDefined();

        const releaseCall = query.mock.calls.find(([sql]) => sql.includes('UPDATE app.resource_reservations') && sql.includes("state = 'RELEASED'"));
        expect(releaseCall).toBeDefined();
      });

      it('assigned VOLUNTEER can REJECT: PENDING -> REJECTED, returns pickup to PLANNED, releases reservations', async () => {
        findUser.mockResolvedValue(volunteer);
        mockDbForTransition({ assignmentStatus: 'PENDING', assignmentVersion: 0, pickupStatus: 'ASSIGNED', isAssigned: true });
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'REJECT', expectedVersion: 0 });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('REJECTED');

        const pickupUpdate = query.mock.calls.find(([sql, params]) => sql.includes('UPDATE app.pickups') && params?.[0] === 'PLANNED');
        expect(pickupUpdate).toBeDefined();

        const releaseCall = query.mock.calls.find(([sql]) => sql.includes('UPDATE app.resource_reservations') && sql.includes("state = 'RELEASED'"));
        expect(releaseCall).toBeDefined();
      });

      it('ADMIN can CANCEL from PENDING with reason: mirrors pickup CANCELLED, releases reservations', async () => {
        findUser.mockResolvedValue(admin);
        mockDbForTransition({ assignmentStatus: 'PENDING', assignmentVersion: 0, pickupStatus: 'ASSIGNED' });
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'CANCEL', expectedVersion: 0, reason: 'Donor called to cancel' });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('CANCELLED');

        const pickupUpdate = query.mock.calls.find(([sql, params]) => sql.includes('UPDATE app.pickups') && params?.[0] === 'CANCELLED');
        expect(pickupUpdate).toBeDefined();

        const releaseCall = query.mock.calls.find(([sql]) => sql.includes('UPDATE app.resource_reservations') && sql.includes("state = 'RELEASED'"));
        expect(releaseCall).toBeDefined();
      });

      it('ADMIN can CANCEL from EN_ROUTE with reason: mirrors pickup CANCELLED, releases reservations', async () => {
        findUser.mockResolvedValue(admin);
        mockDbForTransition({ assignmentStatus: 'EN_ROUTE', assignmentVersion: 2, pickupStatus: 'EN_ROUTE' });
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'CANCEL', expectedVersion: 2, reason: 'Emergency road closure' });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('CANCELLED');

        const pickupUpdate = query.mock.calls.find(([sql, params]) => sql.includes('UPDATE app.pickups') && params?.[0] === 'CANCELLED');
        expect(pickupUpdate).toBeDefined();
      });

      it('ADMIN can FAIL from EN_ROUTE with reason: returns pickup to PLANNED, releases reservations', async () => {
        findUser.mockResolvedValue(admin);
        mockDbForTransition({ assignmentStatus: 'EN_ROUTE', assignmentVersion: 2, pickupStatus: 'EN_ROUTE' });
        const res = await request(app)
          .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
          .set('Authorization', 'Bearer token')
          .send({ action: 'FAIL', expectedVersion: 2, reason: 'Vehicle tyre puncture on highway' });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('FAILED');

        // Pickup returns to PLANNED so another assignment can be scheduled
        const pickupUpdate = query.mock.calls.find(([sql, params]) => sql.includes('UPDATE app.pickups') && params?.[0] === 'PLANNED');
        expect(pickupUpdate).toBeDefined();

        const releaseCall = query.mock.calls.find(([sql]) => sql.includes('UPDATE app.resource_reservations') && sql.includes("state = 'RELEASED'"));
        expect(releaseCall).toBeDefined();
      });

      it('ADMIN can FAIL from PENDING, ACCEPTED, ARRIVED_AT_DONOR, FOOD_COLLECTED', async () => {
        findUser.mockResolvedValue(admin);
        for (const fromStatus of ['PENDING', 'ACCEPTED', 'ARRIVED_AT_DONOR', 'FOOD_COLLECTED']) {
          mockDbForTransition({ assignmentStatus: fromStatus, assignmentVersion: 1, pickupStatus: 'ASSIGNED' });
          const res = await request(app)
            .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
            .set('Authorization', 'Bearer token')
            .send({ action: 'FAIL', expectedVersion: 1, reason: 'Operations exception' });
          expect(res.status).toBe(200);
          expect(res.body.data.status).toBe('FAILED');
        }
      });
    });

    describe('Illegal Transitions Matrix (409 INVALID_TRANSITION)', () => {
      it('rejects ACCEPT from any status other than PENDING with 409 INVALID_TRANSITION', async () => {
        findUser.mockResolvedValue(volunteer);
        const invalidStatuses = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED_AT_DONOR', 'FOOD_COLLECTED', 'DELIVERED', 'REJECTED', 'CANCELLED', 'FAILED'];
        for (const status of invalidStatuses) {
          mockDbForTransition({ assignmentStatus: status, assignmentVersion: 1, isAssigned: true });
          const res = await request(app)
            .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
            .set('Authorization', 'Bearer token')
            .send({ action: 'ACCEPT', expectedVersion: 1 });
          expect(res.status).toBe(409);
          expect(res.body.error.code).toBe('INVALID_TRANSITION');
        }
      });

      it('rejects REJECT from any status other than PENDING with 409 INVALID_TRANSITION', async () => {
        findUser.mockResolvedValue(volunteer);
        const invalidStatuses = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED_AT_DONOR', 'FOOD_COLLECTED', 'DELIVERED', 'REJECTED', 'CANCELLED', 'FAILED'];
        for (const status of invalidStatuses) {
          mockDbForTransition({ assignmentStatus: status, assignmentVersion: 1, isAssigned: true });
          const res = await request(app)
            .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
            .set('Authorization', 'Bearer token')
            .send({ action: 'REJECT', expectedVersion: 1 });
          expect(res.status).toBe(409);
          expect(res.body.error.code).toBe('INVALID_TRANSITION');
        }
      });

      it('rejects START from any status other than ACCEPTED with 409 INVALID_TRANSITION', async () => {
        findUser.mockResolvedValue(volunteer);
        const invalidStatuses = ['PENDING', 'EN_ROUTE', 'ARRIVED_AT_DONOR', 'FOOD_COLLECTED', 'DELIVERED', 'REJECTED', 'CANCELLED', 'FAILED'];
        for (const status of invalidStatuses) {
          mockDbForTransition({ assignmentStatus: status, assignmentVersion: 1, isAssigned: true });
          const res = await request(app)
            .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
            .set('Authorization', 'Bearer token')
            .send({ action: 'START', expectedVersion: 1 });
          expect(res.status).toBe(409);
          expect(res.body.error.code).toBe('INVALID_TRANSITION');
        }
      });

      it('rejects ARRIVE from any status other than EN_ROUTE with 409 INVALID_TRANSITION', async () => {
        findUser.mockResolvedValue(volunteer);
        const invalidStatuses = ['PENDING', 'ACCEPTED', 'ARRIVED_AT_DONOR', 'FOOD_COLLECTED', 'DELIVERED', 'REJECTED', 'CANCELLED', 'FAILED'];
        for (const status of invalidStatuses) {
          mockDbForTransition({ assignmentStatus: status, assignmentVersion: 1, isAssigned: true });
          const res = await request(app)
            .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
            .set('Authorization', 'Bearer token')
            .send({ action: 'ARRIVE', expectedVersion: 1 });
          expect(res.status).toBe(409);
          expect(res.body.error.code).toBe('INVALID_TRANSITION');
        }
      });

      it('rejects COLLECT from any status other than ARRIVED_AT_DONOR with 409 INVALID_TRANSITION', async () => {
        findUser.mockResolvedValue(volunteer);
        const invalidStatuses = ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'FOOD_COLLECTED', 'DELIVERED', 'REJECTED', 'CANCELLED', 'FAILED'];
        for (const status of invalidStatuses) {
          mockDbForTransition({ assignmentStatus: status, assignmentVersion: 1, isAssigned: true });
          const res = await request(app)
            .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
            .set('Authorization', 'Bearer token')
            .send({ action: 'COLLECT', expectedVersion: 1 });
          expect(res.status).toBe(409);
          expect(res.body.error.code).toBe('INVALID_TRANSITION');
        }
      });

      it('rejects DELIVER from any status other than FOOD_COLLECTED with 409 INVALID_TRANSITION', async () => {
        findUser.mockResolvedValue(admin);
        const invalidStatuses = ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED_AT_DONOR', 'DELIVERED', 'REJECTED', 'CANCELLED', 'FAILED'];
        for (const status of invalidStatuses) {
          mockDbForTransition({ assignmentStatus: status, assignmentVersion: 1 });
          const res = await request(app)
            .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
            .set('Authorization', 'Bearer token')
            .send({ action: 'DELIVER', expectedVersion: 1 });
          expect(res.status).toBe(409);
          expect(res.body.error.code).toBe('INVALID_TRANSITION');
        }
      });

      it('rejects CANCEL from terminal states (DELIVERED, REJECTED, CANCELLED, FAILED) with 409 INVALID_TRANSITION', async () => {
        findUser.mockResolvedValue(admin);
        const terminalStatuses = ['DELIVERED', 'REJECTED', 'CANCELLED', 'FAILED'];
        for (const status of terminalStatuses) {
          mockDbForTransition({ assignmentStatus: status, assignmentVersion: 1 });
          const res = await request(app)
            .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
            .set('Authorization', 'Bearer token')
            .send({ action: 'CANCEL', expectedVersion: 1, reason: 'Too late' });
          expect(res.status).toBe(409);
          expect(res.body.error.code).toBe('INVALID_TRANSITION');
        }
      });

      it('rejects FAIL from terminal states (DELIVERED, REJECTED, CANCELLED, FAILED) with 409 INVALID_TRANSITION', async () => {
        findUser.mockResolvedValue(admin);
        const terminalStatuses = ['DELIVERED', 'REJECTED', 'CANCELLED', 'FAILED'];
        for (const status of terminalStatuses) {
          mockDbForTransition({ assignmentStatus: status, assignmentVersion: 1 });
          const res = await request(app)
            .patch(`/api/v1/assignments/${pr3AssignmentId}/status`)
            .set('Authorization', 'Bearer token')
            .send({ action: 'FAIL', expectedVersion: 1, reason: 'Already done' });
          expect(res.status).toBe(409);
          expect(res.body.error.code).toBe('INVALID_TRANSITION');
        }
      });
    });

    describe('GET /assignments/me (Volunteer Sees Own Assignments)', () => {
      it('returns only the calling volunteer assignments in { items, nextCursor } format', async () => {
        findUser.mockResolvedValue(volunteer);

        query.mockImplementation(async (sql: string) => {
          if (sql.includes('FROM app.assignments a') && sql.includes('JOIN app.volunteers v')) {
            return {
              rows: [{
                id: pr3AssignmentId,
                pickup_id: pr3PickupId,
                team_id: null,
                driver_id: pr3DriverId,
                vehicle_id: pr3VehicleId,
                role: 'Lead Volunteer',
                status: 'ACCEPTED',
                version: 1,
                created_at: new Date('2026-10-01T12:00:00Z'),
                volunteer_ids: [pr3VolunteerId],
              }],
            };
          }
          return { rows: [] };
        });

        const res = await request(app)
          .get('/api/v1/assignments/me')
          .set('Authorization', 'Bearer token');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.items).toHaveLength(1);
        expect(res.body.data.items[0]).toMatchObject({
          id: pr3AssignmentId,
          pickupId: pr3PickupId,
          status: 'ACCEPTED',
          volunteerIds: [pr3VolunteerId],
        });
        expect(res.body.data.nextCursor).toBeNull();
      });

      it('returns empty items array when volunteer has no assignments', async () => {
        findUser.mockResolvedValue(volunteer);

        query.mockImplementation(async (sql: string) => {
          if (sql.includes('FROM app.assignments a') && sql.includes('JOIN app.volunteers v')) {
            return { rows: [] };
          }
          return { rows: [] };
        });

        const res = await request(app)
          .get('/api/v1/assignments/me')
          .set('Authorization', 'Bearer token');

        expect(res.status).toBe(200);
        expect(res.body.data.items).toEqual([]);
        expect(res.body.data.nextCursor).toBeNull();
      });
    });

    describe('cancelForFoodRequest(client, foodRequestId)', () => {
      it('cancels pickup and assignment from ASSIGNED, releases reservations, and returns pickup', async () => {
        const fakeClient = { query: vi.fn() } as unknown as import('pg').PoolClient;

        (fakeClient.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string, params?: unknown[]) => {
          if (sql.includes('FROM app.pickups') && sql.includes('food_request_id = $1')) {
            return {
              rows: [{
                id: pr3PickupId,
                food_request_id: pr3FoodRequestId,
                window_starts_at: new Date('2026-10-10T10:00:00Z'),
                window_ends_at: new Date('2026-10-10T12:00:00Z'),
                delivery_address: 'Central Food Hub',
                status: 'ASSIGNED',
                version: 1,
                created_at: new Date('2026-10-01T10:00:00Z'),
              }],
            };
          }
          if (sql.includes('FROM app.assignments') && sql.includes('FOR UPDATE')) {
            return {
              rows: [{
                id: pr3AssignmentId,
                pickup_id: pr3PickupId,
                status: 'PENDING',
                version: 0,
              }],
            };
          }
          if (sql.includes('UPDATE app.assignments')) {
            return {
              rows: [{
                id: pr3AssignmentId,
                pickup_id: pr3PickupId,
                status: 'CANCELLED',
                version: 1,
              }],
            };
          }
          if (sql.includes('UPDATE app.resource_reservations')) {
            return { rowCount: 2 };
          }
          if (sql.includes('UPDATE app.pickups')) {
            return {
              rows: [{
                id: pr3PickupId,
                food_request_id: pr3FoodRequestId,
                window_starts_at: new Date('2026-10-10T10:00:00Z'),
                window_ends_at: new Date('2026-10-10T12:00:00Z'),
                delivery_address: 'Central Food Hub',
                status: 'CANCELLED',
                version: 2,
                created_at: new Date('2026-10-01T10:00:00Z'),
              }],
            };
          }
          return { rows: [] };
        });

        const cancelled = await cancelForFoodRequest(fakeClient, pr3FoodRequestId);
        expect(cancelled).not.toBeNull();
        expect(cancelled?.status).toBe('CANCELLED');

        const calls = (fakeClient.query as ReturnType<typeof vi.fn>).mock.calls;
        const assignmentCancel = calls.find(([sql]) => sql.includes('UPDATE app.assignments'));
        expect(assignmentCancel).toBeDefined();

        const reservationRelease = calls.find(([sql]) => sql.includes('UPDATE app.resource_reservations'));
        expect(reservationRelease).toBeDefined();

        const pickupCancel = calls.find(([sql, params]) => sql.includes('UPDATE app.pickups') && params?.[0] === 'CANCELLED');
        expect(pickupCancel).toBeDefined();
      });

      it('cancels pickup from PLANNED status without assignment', async () => {
        const fakeClient = { query: vi.fn() } as unknown as import('pg').PoolClient;

        (fakeClient.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string, params?: unknown[]) => {
          if (sql.includes('FROM app.pickups') && sql.includes('food_request_id = $1')) {
            return {
              rows: [{
                id: pr3PickupId,
                food_request_id: pr3FoodRequestId,
                window_starts_at: new Date('2026-10-10T10:00:00Z'),
                window_ends_at: new Date('2026-10-10T12:00:00Z'),
                delivery_address: 'Central Food Hub',
                status: 'PLANNED',
                version: 0,
                created_at: new Date('2026-10-01T10:00:00Z'),
              }],
            };
          }
          if (sql.includes('UPDATE app.pickups')) {
            return {
              rows: [{
                id: pr3PickupId,
                food_request_id: pr3FoodRequestId,
                window_starts_at: new Date('2026-10-10T10:00:00Z'),
                window_ends_at: new Date('2026-10-10T12:00:00Z'),
                delivery_address: 'Central Food Hub',
                status: 'CANCELLED',
                version: 1,
                created_at: new Date('2026-10-01T10:00:00Z'),
              }],
            };
          }
          return { rows: [] };
        });

        const cancelled = await cancelForFoodRequest(fakeClient, pr3FoodRequestId);
        expect(cancelled?.status).toBe('CANCELLED');
      });

      it('returns existing pickup DTO if already CANCELLED', async () => {
        const fakeClient = { query: vi.fn() } as unknown as import('pg').PoolClient;

        (fakeClient.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string) => {
          if (sql.includes('FROM app.pickups') && sql.includes('food_request_id = $1')) {
            return {
              rows: [{
                id: pr3PickupId,
                food_request_id: pr3FoodRequestId,
                window_starts_at: new Date('2026-10-10T10:00:00Z'),
                window_ends_at: new Date('2026-10-10T12:00:00Z'),
                delivery_address: 'Central Food Hub',
                status: 'CANCELLED',
                version: 2,
                created_at: new Date('2026-10-01T10:00:00Z'),
              }],
            };
          }
          return { rows: [] };
        });

        const cancelled = await cancelForFoodRequest(fakeClient, pr3FoodRequestId);
        expect(cancelled?.status).toBe('CANCELLED');
      });

      it('rejects cancellation with 409 INVALID_TRANSITION when travel has begun (EN_ROUTE)', async () => {
        const fakeClient = { query: vi.fn() } as unknown as import('pg').PoolClient;

        (fakeClient.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string) => {
          if (sql.includes('FROM app.pickups') && sql.includes('food_request_id = $1')) {
            return {
              rows: [{
                id: pr3PickupId,
                food_request_id: pr3FoodRequestId,
                window_starts_at: new Date('2026-10-10T10:00:00Z'),
                window_ends_at: new Date('2026-10-10T12:00:00Z'),
                delivery_address: 'Central Food Hub',
                status: 'EN_ROUTE',
                version: 2,
                created_at: new Date('2026-10-01T10:00:00Z'),
              }],
            };
          }
          return { rows: [] };
        });

        await expect(cancelForFoodRequest(fakeClient, pr3FoodRequestId)).rejects.toMatchObject({
          status: 409,
          code: 'INVALID_TRANSITION',
        });
      });

      it('returns null if no pickup exists for food request', async () => {
        const fakeClient = { query: vi.fn() } as unknown as import('pg').PoolClient;

        (fakeClient.query as ReturnType<typeof vi.fn>).mockImplementation(async () => {
          return { rows: [] };
        });

        const result = await cancelForFoodRequest(fakeClient, pr3FoodRequestId);
        expect(result).toBeNull();
      });
    });
  });
});

