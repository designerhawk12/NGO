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

const admin = {
  id: 'a0000000-0000-4000-8000-000000000001',
  authUserId: 'b0000000-0000-4000-8000-000000000001',
  role: 'ADMIN',
  displayName: 'Admin User',
};

const donorUser = {
  id: 'a0000000-0000-4000-8000-000000000002',
  authUserId: 'b0000000-0000-4000-8000-000000000002',
  role: 'DONOR',
  displayName: 'Donor User',
};

const otherDonorUser = {
  id: 'a0000000-0000-4000-8000-000000000003',
  authUserId: 'b0000000-0000-4000-8000-000000000003',
  role: 'DONOR',
  displayName: 'Other Donor',
};

const volunteerUser = {
  id: 'a0000000-0000-4000-8000-000000000004',
  authUserId: 'b0000000-0000-4000-8000-000000000004',
  role: 'VOLUNTEER',
  volunteerApplicationStatus: 'APPROVED',
  displayName: 'Volunteer User',
};

const mockDonorRow = {
  id: 'd0000000-0000-4000-8000-000000000001',
  app_user_id: donorUser.id,
  organization_name: 'Community Kitchen',
  contact_phone_e164: '+919876543210',
  created_at: new Date('2026-10-10T08:00:00Z'),
};

const mockOtherDonorRow = {
  id: 'd0000000-0000-4000-8000-000000000002',
  app_user_id: otherDonorUser.id,
  organization_name: 'Other Kitchen',
  contact_phone_e164: '+919876543211',
  created_at: new Date('2026-10-10T08:00:00Z'),
};

const validFoodPayload = {
  sourceName: 'Grand Banquet Hall',
  sourceType: 'Wedding',
  pickupAddress: '42 MG Road, Bengaluru',
  preparedAt: '2026-10-10T10:00:00.000Z',
  readyAt: '2026-10-10T11:00:00.000Z',
  pickupDeadline: '2026-10-10T14:00:00.000Z',
  contactName: 'Ateef Syed',
  contactPhoneE164: '+919876543210',
  handlingRequirements: 'Keep covered in insulated containers.',
  donorSafetyDeclaration: true,
  notes: 'Extra vegetarian meals available.',
  estimatedWeightKg: 35,
  items: [
    {
      foodType: 'Veg biryani',
      quantity: 20,
      unit: 'KG',
      handlingRequirements: 'Keep hot',
    },
    {
      foodType: 'Gulab jamun',
      quantity: 50,
      unit: 'PACKAGES',
      handlingRequirements: 'Room temperature',
    },
  ],
};

const sampleFoodRequestId = 'f0000000-0000-4000-8000-000000000001';

const sampleFoodRequestRow = {
  id: sampleFoodRequestId,
  donor_id: mockDonorRow.id,
  source_name: validFoodPayload.sourceName,
  source_type: validFoodPayload.sourceType,
  pickup_address: validFoodPayload.pickupAddress,
  prepared_at: new Date(validFoodPayload.preparedAt),
  ready_at: new Date(validFoodPayload.readyAt),
  pickup_deadline: new Date(validFoodPayload.pickupDeadline),
  estimated_weight_kg: '35.00',
  handling_requirements: validFoodPayload.handlingRequirements,
  donor_safety_declaration: true,
  safety_review: 'PENDING',
  safety_reviewed_by: null,
  safety_reviewed_at: null,
  contact_name: validFoodPayload.contactName,
  contact_phone_e164: validFoodPayload.contactPhoneE164,
  notes: validFoodPayload.notes,
  status: 'SUBMITTED',
  created_at: new Date('2026-10-10T10:05:00Z'),
  cancelled_at: null,
};

const sampleFoodItemRows = [
  {
    id: 'i0000000-0000-4000-8000-000000000001',
    food_request_id: sampleFoodRequestId,
    food_type: 'Veg biryani',
    quantity: '20.00',
    unit: 'KG',
    handling_requirements: 'Keep hot',
  },
  {
    id: 'i0000000-0000-4000-8000-000000000002',
    food_request_id: sampleFoodRequestId,
    food_type: 'Gulab jamun',
    quantity: '50.00',
    unit: 'PACKAGES',
    handling_requirements: 'Room temperature',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  query.mockReset();
  verify.mockResolvedValue({ authUserId: donorUser.authUserId, email: 'donor@example.com' });
  findUser.mockResolvedValue(donorUser);
});

describe('Food and Donor Management API (Module 2)', () => {
  describe('Authentication & Authorization', () => {
    it('rejects unauthenticated requests to POST /food-requests with 401', async () => {
      const res = await request(app).post('/api/v1/food-requests').send(validFoodPayload);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects unauthenticated requests to GET /food-requests with 401', async () => {
      const res = await request(app).get('/api/v1/food-requests');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects VOLUNTEER role attempting to submit food request with 403', async () => {
      findUser.mockResolvedValue(volunteerUser);
      const res = await request(app)
        .post('/api/v1/food-requests')
        .set('Authorization', 'Bearer vol-token')
        .send(validFoodPayload);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects VOLUNTEER role reading a food request by ID with 403', async () => {
      findUser.mockResolvedValue(volunteerUser);
      const res = await request(app)
        .get(`/api/v1/food-requests/${sampleFoodRequestId}`)
        .set('Authorization', 'Bearer volunteer-token');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects non-admin role attempting safety review with 403', async () => {
      const res = await request(app)
        .post(`/api/v1/food-requests/${sampleFoodRequestId}/safety-review`)
        .set('Authorization', 'Bearer donor-token')
        .send({ review: 'APPROVED' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Validation', () => {
    it('rejects food request missing required fields with 400 VALIDATION_ERROR', async () => {
      const invalid = { ...validFoodPayload, sourceName: '' };
      const res = await request(app)
        .post('/api/v1/food-requests')
        .set('Authorization', 'Bearer donor-token')
        .send(invalid);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid phone number not matching E.164 with 400', async () => {
      const invalid = { ...validFoodPayload, contactPhoneE164: '9876543210' };
      const res = await request(app)
        .post('/api/v1/food-requests')
        .set('Authorization', 'Bearer donor-token')
        .send(invalid);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid timeline order (preparedAt after readyAt) with 400', async () => {
      const invalid = {
        ...validFoodPayload,
        preparedAt: '2026-10-10T12:00:00.000Z',
        readyAt: '2026-10-10T11:00:00.000Z',
      };
      const res = await request(app)
        .post('/api/v1/food-requests')
        .set('Authorization', 'Bearer donor-token')
        .send(invalid);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects donorSafetyDeclaration false with 400', async () => {
      const invalid = { ...validFoodPayload, donorSafetyDeclaration: false };
      const res = await request(app)
        .post('/api/v1/food-requests')
        .set('Authorization', 'Bearer donor-token')
        .send(invalid);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects empty items array with 400', async () => {
      const invalid = { ...validFoodPayload, items: [] };
      const res = await request(app)
        .post('/api/v1/food-requests')
        .set('Authorization', 'Bearer donor-token')
        .send(invalid);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects non-UUID parameter for :id endpoints with 400', async () => {
      const res = await request(app)
        .get('/api/v1/food-requests/not-a-uuid')
        .set('Authorization', 'Bearer donor-token');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Submission & Persistence', () => {
    it('creates donor, food request and food items atomically', async () => {
      // 1. findOrCreateDonorForAppUser: existing query returns empty -> insert returns mockDonorRow
      query.mockImplementationOnce(async () => ({ rows: [] }));
      query.mockImplementationOnce(async () => ({ rows: [mockDonorRow] }));

      // 2. insert food_request
      query.mockImplementationOnce(async () => ({ rows: [sampleFoodRequestRow] }));

      // 3. insert 2 food_items
      query.mockImplementationOnce(async () => ({ rows: [sampleFoodItemRows[0]] }));
      query.mockImplementationOnce(async () => ({ rows: [sampleFoodItemRows[1]] }));

      const res = await request(app)
        .post('/api/v1/food-requests')
        .set('Authorization', 'Bearer donor-token')
        .send(validFoodPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(sampleFoodRequestId);
      expect(res.body.data.status).toBe('SUBMITTED');
      expect(res.body.data.safetyReview).toBe('PENDING');
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items[0].foodType).toBe('Veg biryani');
      expect(res.body.data.items[1].foodType).toBe('Gulab jamun');
      expect(res.body.data.donorName).toBe(validFoodPayload.sourceName);
    });
  });

  it('persists meals and weight for each submitted vegetarian item', async () => {
    query.mockImplementationOnce(async () => ({ rows: [] }));
    query.mockImplementationOnce(async () => ({ rows: [mockDonorRow] }));
    query.mockImplementationOnce(async () => ({ rows: [sampleFoodRequestRow] }));
    query.mockImplementationOnce(async () => ({ rows: [{ ...sampleFoodItemRows[0], estimated_meals: '80', estimated_weight_kg: '12.5' }] }));
    query.mockImplementationOnce(async () => ({ rows: [{ ...sampleFoodItemRows[1], estimated_meals: '40', estimated_weight_kg: '7.5' }] }));
    const payload = { ...validFoodPayload, estimatedWeightKg: 20, items: [
      { foodType: 'Rice', quantity: 80, unit: 'MEALS', handlingRequirements: 'Keep warm', estimatedMeals: 80, estimatedWeightKg: 12.5 },
      { foodType: 'Dal', quantity: 40, unit: 'MEALS', handlingRequirements: 'Keep hot', estimatedMeals: 40, estimatedWeightKg: 7.5 },
    ] };
    const res = await request(app).post('/api/v1/food-requests').set('Authorization', 'Bearer donor-token').send(payload);
    expect(res.status).toBe(201);
    const inserts = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO app.food_items'));
    expect(inserts).toHaveLength(2);
    expect(inserts[0][1].slice(-2)).toEqual([80, 12.5]);
    expect(inserts[1][1].slice(-2)).toEqual([40, 7.5]);
    expect(res.body.data.items[0]).toMatchObject({ estimatedMeals: 80, estimatedWeightKg: 12.5 });
    expect(res.body.data.items[1]).toMatchObject({ estimatedMeals: 40, estimatedWeightKg: 7.5 });
  });

  describe('Retrieval & Ownership Protection', () => {
    it('allows a donor to retrieve their own food request by ID', async () => {
      // 1. findFoodRequestById -> food request
      query.mockImplementationOnce(async () => ({ rows: [sampleFoodRequestRow] }));
      // 2. findFoodRequestById -> food items
      query.mockImplementationOnce(async () => ({ rows: sampleFoodItemRows }));
      // 3. findDonorByAppUserId -> mockDonorRow
      query.mockImplementationOnce(async () => ({ rows: [mockDonorRow] }));
      // 4. getPickupByFoodRequestId -> none
      query.mockImplementationOnce(async () => ({ rows: [] }));

      const res = await request(app)
        .get(`/api/v1/food-requests/${sampleFoodRequestId}`)
        .set('Authorization', 'Bearer donor-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(sampleFoodRequestId);
      expect(res.body.data.items).toHaveLength(2);
    });

    it('rejects donor viewing another donor food request with 403 FORBIDDEN', async () => {
      findUser.mockResolvedValue(otherDonorUser);
      // 1. findFoodRequestById -> request owned by mockDonorRow (not mockOtherDonorRow)
      query.mockImplementationOnce(async () => ({ rows: [sampleFoodRequestRow] }));
      // 2. findFoodRequestById -> items
      query.mockImplementationOnce(async () => ({ rows: sampleFoodItemRows }));
      // 3. findDonorByAppUserId for otherDonorUser -> mockOtherDonorRow
      query.mockImplementationOnce(async () => ({ rows: [mockOtherDonorRow] }));

      const res = await request(app)
        .get(`/api/v1/food-requests/${sampleFoodRequestId}`)
        .set('Authorization', 'Bearer other-token');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows ADMIN to view any food request', async () => {
      findUser.mockResolvedValue(admin);
      // 1. findFoodRequestById -> request
      query.mockImplementationOnce(async () => ({ rows: [sampleFoodRequestRow] }));
      // 2. findFoodRequestById -> items
      query.mockImplementationOnce(async () => ({ rows: sampleFoodItemRows }));
      // 3. getPickupByFoodRequestId -> none
      query.mockImplementationOnce(async () => ({ rows: [] }));

      const res = await request(app)
        .get(`/api/v1/food-requests/${sampleFoodRequestId}`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(sampleFoodRequestId);
    });

    it('returns 404 NOT_FOUND when food request does not exist', async () => {
      query.mockImplementationOnce(async () => ({ rows: [] }));

      const res = await request(app)
        .get(`/api/v1/food-requests/${sampleFoodRequestId}`)
        .set('Authorization', 'Bearer donor-token');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Safety Review (Admin Workflow)', () => {
    it('allows ADMIN to approve food safety review', async () => {
      findUser.mockResolvedValue(admin);
      // 1. findFoodRequestById
      query.mockImplementationOnce(async () => ({ rows: [sampleFoodRequestRow] }));
      query.mockImplementationOnce(async () => ({ rows: sampleFoodItemRows }));
      // 2. updateSafetyReview
      const approvedRow = {
        ...sampleFoodRequestRow,
        safety_review: 'APPROVED',
        safety_reviewed_by: admin.id,
        safety_reviewed_at: new Date('2026-10-10T10:30:00Z'),
      };
      query.mockImplementationOnce(async () => ({ rows: [approvedRow] }));

      const res = await request(app)
        .post(`/api/v1/food-requests/${sampleFoodRequestId}/safety-review`)
        .set('Authorization', 'Bearer admin-token')
        .send({ review: 'APPROVED' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.safetyReview).toBe('APPROVED');
    });

    it('rejects review with invalid status with 400', async () => {
      findUser.mockResolvedValue(admin);
      const res = await request(app)
        .post(`/api/v1/food-requests/${sampleFoodRequestId}/safety-review`)
        .set('Authorization', 'Bearer admin-token')
        .send({ review: 'PENDING' }); // Only APPROVED or REJECTED allowed

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Authoritative Pickup & Assignment Status Reflection for Donors', () => {
    it('includes pickup and assignment status when pickup has been planned and assigned', async () => {
      const mockPickupRow = {
        id: 'p0000000-0000-4000-8000-000000000001',
        food_request_id: sampleFoodRequestId,
        window_starts_at: new Date('2026-10-10T11:00:00Z'),
        window_ends_at: new Date('2026-10-10T14:00:00Z'),
        delivery_address: 'Central Food Hub, Bengaluru',
        status: 'ASSIGNED',
        version: 1,
        created_at: new Date('2026-10-10T10:15:00Z'),
      };

      const mockAssignmentRow = {
        id: 'a1111111-1111-4000-8000-000000000001',
        pickup_id: mockPickupRow.id,
        team_id: null,
        driver_id: 'd9de49d3-b7ab-4b95-b2be-dc39e5f93094',
        vehicle_id: '3c597e69-6be5-4d29-97fc-a946fa8a5300',
        role: 'Pickup Volunteer',
        status: 'ACCEPTED',
        version: 1,
        created_at: new Date('2026-10-10T10:20:00Z'),
      };

      // 1. findFoodRequestById -> request
      query.mockImplementationOnce(async () => ({ rows: [sampleFoodRequestRow] }));
      // 2. findFoodRequestById -> items
      query.mockImplementationOnce(async () => ({ rows: sampleFoodItemRows }));
      // 3. findDonorByAppUserId -> mockDonorRow
      query.mockImplementationOnce(async () => ({ rows: [mockDonorRow] }));
      // 4. getPickupByFoodRequestId -> mockPickupRow
      query.mockImplementationOnce(async () => ({ rows: [mockPickupRow] }));
      // 5. getActiveAssignmentForPickup -> findById for pickup
      query.mockImplementationOnce(async () => ({ rows: [mockPickupRow] }));
      // 6. findActiveAssignmentsByPickupId -> mockAssignmentRow
      query.mockImplementationOnce(async () => ({ rows: [mockAssignmentRow] }));
      // 7. getAssignmentVolunteerIds -> [volunteerId]
      query.mockImplementationOnce(async () => ({ rows: [{ volunteer_id: '7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5' }] }));
      // 8. Admin crew responses (same projection also used for donor status summary)
      query.mockImplementationOnce(async () => ({ rows: [{ volunteer_id: '7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5', response: 'ACCEPTED' }] }));

      const res = await request(app)
        .get(`/api/v1/food-requests/${sampleFoodRequestId}`)
        .set('Authorization', 'Bearer donor-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pickup).not.toBeNull();
      expect(res.body.data.pickup.status).toBe('ASSIGNED');
      expect(res.body.data.pickup.assignmentStatus).toBe('ACCEPTED');
    });
  });

  describe('Cancellation', () => {
    it('allows donor to cancel own request before dispatch', async () => {
      // 1. findFoodRequestById
      query.mockImplementationOnce(async () => ({ rows: [sampleFoodRequestRow] }));
      query.mockImplementationOnce(async () => ({ rows: sampleFoodItemRows }));
      // 2. findDonorByAppUserId
      query.mockImplementationOnce(async () => ({ rows: [mockDonorRow] }));
      // 3. cancelForFoodRequest: findPickupByFoodRequestIdForUpdate -> no pickup
      query.mockImplementationOnce(async () => ({ rows: [] }));
      // 4. cancelFoodRequest
      const cancelledRow = { ...sampleFoodRequestRow, status: 'CANCELLED' };
      query.mockImplementationOnce(async () => ({ rows: [cancelledRow] }));

      const res = await request(app)
        .post(`/api/v1/food-requests/${sampleFoodRequestId}/cancel`)
        .set('Authorization', 'Bearer donor-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CANCELLED');
      expect(query.mock.calls[4][0]).toContain('cancelled_at = now()');
    });
  });

  describe('Listing & Logistics View (Admin & Donor)', () => {
    it('allows ADMIN to list all food requests with enriched pickup details', async () => {
      findUser.mockResolvedValue(admin);
      // 1. listFoodRequests -> [sampleFoodRequestRow]
      query.mockImplementationOnce(async () => ({ rows: [sampleFoodRequestRow] }));
      // 2. food items for batch
      query.mockImplementationOnce(async () => ({ rows: sampleFoodItemRows }));
      // 3. getPickupByFoodRequestId -> none
      query.mockImplementationOnce(async () => ({ rows: [] }));

      const res = await request(app)
        .get('/api/v1/food-requests')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].id).toBe(sampleFoodRequestId);
      expect(res.body.data.items[0].donorName).toBe(sampleFoodRequestRow.source_name);
      expect(res.body.data.items[0].pickup).toBeNull();
      expect(query.mock.calls[0][0]).toContain("status = 'SUBMITTED' OR (status = 'CANCELLED' AND cancelled_at > now() - interval '24 hours')");
    });

    it('rejects VOLUNTEER from listing food requests with 403 FORBIDDEN', async () => {
      findUser.mockResolvedValue(volunteerUser);

      const res = await request(app)
        .get('/api/v1/food-requests')
        .set('Authorization', 'Bearer volunteer-token');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('keeps all cancelled requests available in the explicit history list', async () => {
      findUser.mockResolvedValue(admin);
      query.mockImplementationOnce(async () => ({ rows: [{ ...sampleFoodRequestRow, status: 'CANCELLED', cancelled_at: null }] }));
      query.mockImplementationOnce(async () => ({ rows: sampleFoodItemRows }));
      query.mockImplementationOnce(async () => ({ rows: [] }));

      const res = await request(app)
        .get('/api/v1/food-requests?status=CANCELLED')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].status).toBe('CANCELLED');
      expect(query.mock.calls[0][0]).toContain('WHERE status = $1');
      expect(query.mock.calls[0][0]).not.toContain("cancelled_at > now() - interval '24 hours'");
      expect(query.mock.calls[0][1]).toEqual(['CANCELLED']);
    });
  });
});
