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
  getPool: () => ({
    query,
    connect: async () => ({
      query,
      release: vi.fn(),
    }),
  }),
}));

import { app } from '../app';

const adminActor = {
  id: 'b0000000-0000-4000-8000-000000000001',
  authUserId: 'a0000000-0000-4000-8000-000000000001',
  role: 'ADMIN',
  displayName: 'Admin User',
};

const volunteerActor = {
  id: 'b0000000-0000-4000-8000-000000000002',
  authUserId: 'a0000000-0000-4000-8000-000000000002',
  role: 'VOLUNTEER',
  volunteerApplicationStatus: 'APPROVED',
  displayName: 'Volunteer User',
};

const sampleVesselId = '4c597e69-6be5-4d29-97fc-a946fa8a5400';
const sampleDate = new Date('2026-10-23T10:00:00Z');

function mockVesselDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: sampleVesselId,
    vessel_code: 'VES-HB-01',
    name: 'Hot Box 40L',
    vessel_type: 'HOT_BOX',
    material: 'STAINLESS_STEEL',
    capacity_value: '40.00',
    capacity_unit: 'LITRES',
    food_grade_certified: true,
    temperature_suitability: 'HOT',
    has_insulation: true,
    has_tight_lid: true,
    status: 'AVAILABLE',
    cleaning_status: 'CLEAN',
    last_cleaned_at: sampleDate,
    next_cleaning_due: new Date('2026-10-30T10:00:00Z'),
    last_inspected_at: sampleDate,
    inspection_result: 'PASSED',
    maintenance_condition: 'GOOD',
    storage_location: 'Central Storage Hub',
    notes: 'Primary hot carrier',
    created_at: sampleDate,
    updated_at: sampleDate,
    issuance_id: null,
    pickup_id: null,
    issued_at: null,
    food_request_id: null,
    source_name: null,
    pickup_address: null,
    ...overrides,
  };
}

describe('Vessels & Food Container Management API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verify.mockResolvedValue({ id: adminActor.authUserId, email: 'admin@aaharaconnect.org' });
    findUser.mockResolvedValue(adminActor);
  });

  describe('Authorization & Permissions', () => {
    it('rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
      verify.mockResolvedValue(null);
      const res = await request(app).get('/api/v1/vessels');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects non-admin roles (VOLUNTEER) with 403 FORBIDDEN', async () => {
      findUser.mockResolvedValue(volunteerActor);
      const res = await request(app)
        .get('/api/v1/vessels')
        .set('Authorization', 'Bearer valid-token');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows ADMIN to access vessels endpoints', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .get('/api/v1/vessels')
        .set('Authorization', 'Bearer valid-admin-token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/vessels (List, Search & Summary)', () => {
    it('returns vessels list', async () => {
      query.mockResolvedValueOnce({ rows: [mockVesselDbRow()] });
      const res = await request(app)
        .get('/api/v1/vessels?search=VES-HB')
        .set('Authorization', 'Bearer valid-admin-token');
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].vesselCode).toBe('VES-HB-01');
    });

    it('GET /api/v1/vessels/summary returns summary counts', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            total: 10,
            available: 6,
            in_use: 2,
            cleaning_required: 1,
            inspection_required: 1,
            maintenance: 0,
            retired: 0,
          },
        ],
      });
      const res = await request(app)
        .get('/api/v1/vessels/summary')
        .set('Authorization', 'Bearer valid-admin-token');
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(10);
      expect(res.body.data.available).toBe(6);
      expect(res.body.data.inUse).toBe(2);
    });
  });

  describe('POST /api/v1/vessels (Creation & Validation)', () => {
    it('creates a vessel successfully with 201', async () => {
      query.mockResolvedValueOnce({ rows: [] }); // unique check
      query.mockResolvedValueOnce({ rows: [mockVesselDbRow()] }); // insert
      const res = await request(app)
        .post('/api/v1/vessels')
        .set('Authorization', 'Bearer valid-admin-token')
        .send({
          vesselCode: 'VES-HB-01',
          name: 'Hot Box 40L',
          vesselType: 'HOT_BOX',
          material: 'STAINLESS_STEEL',
          capacityValue: 40,
          capacityUnit: 'LITRES',
          temperatureSuitability: 'HOT',
          hasInsulation: true,
          hasTightLid: true,
        });
      expect(res.status).toBe(201);
      expect(res.body.data.vesselCode).toBe('VES-HB-01');
    });

    it('rejects invalid capacity (zero or negative)', async () => {
      const res = await request(app)
        .post('/api/v1/vessels')
        .set('Authorization', 'Bearer valid-admin-token')
        .send({
          vesselCode: 'VES-HB-02',
          name: 'Invalid Box',
          vesselType: 'HOT_BOX',
          material: 'STAINLESS_STEEL',
          capacityValue: -10,
          capacityUnit: 'LITRES',
          temperatureSuitability: 'HOT',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects duplicate vesselCode with 409 RESOURCE_CONFLICT', async () => {
      query.mockResolvedValueOnce({ rows: [mockVesselDbRow()] }); // existing found
      const res = await request(app)
        .post('/api/v1/vessels')
        .set('Authorization', 'Bearer valid-admin-token')
        .send({
          vesselCode: 'VES-HB-01',
          name: 'Hot Box Duplicate',
          vesselType: 'HOT_BOX',
          material: 'STAINLESS_STEEL',
          capacityValue: 40,
          capacityUnit: 'LITRES',
          temperatureSuitability: 'HOT',
        });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
    });
  });

  describe('POST /api/v1/vessels/issue and POST /api/v1/vessels/:id/return', () => {
    it('issues an available, clean, safe vessel to a pickup', async () => {
      // 1. Fetch vessel with lock
      query.mockResolvedValueOnce({ rows: [mockVesselDbRow({ status: 'AVAILABLE', cleaning_status: 'CLEAN' })] });
      // 2. Check pickup
      query.mockResolvedValueOnce({ rows: [{ id: '6b597e69-6be5-4d29-97fc-a946fa8a5600', status: 'ASSIGNED' }] });
      // 3. Insert issuance
      query.mockResolvedValueOnce({ rows: [{ id: 'iss-1', issued_at: new Date() }] });
      // 4. Update status
      query.mockResolvedValueOnce({ rows: [] });
      // 5. Append log
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/v1/vessels/issue')
        .set('Authorization', 'Bearer valid-admin-token')
        .send({
          vesselId: sampleVesselId,
          pickupId: '6b597e69-6be5-4d29-97fc-a946fa8a5600',
          issuedNotes: 'Dispatched for hot rice transport',
        });
      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
    });

    it('prevents issuing a dirty vessel (CLEANING_REQUIRED or DIRTY)', async () => {
      query.mockResolvedValueOnce({ rows: [mockVesselDbRow({ status: 'CLEANING_REQUIRED', cleaning_status: 'DIRTY' })] });
      const res = await request(app)
        .post('/api/v1/vessels/issue')
        .set('Authorization', 'Bearer valid-admin-token')
        .send({
          vesselId: sampleVesselId,
          pickupId: '6b597e69-6be5-4d29-97fc-a946fa8a5600',
        });
      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/Clean vessel first/);
    });

    it('prevents issuing an UNSAFE or damaged vessel', async () => {
      query.mockResolvedValueOnce({ rows: [mockVesselDbRow({ maintenance_condition: 'UNSAFE' })] });
      const res = await request(app)
        .post('/api/v1/vessels/issue')
        .set('Authorization', 'Bearer valid-admin-token')
        .send({
          vesselId: sampleVesselId,
          pickupId: '6b597e69-6be5-4d29-97fc-a946fa8a5600',
        });
      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/damaged or unsafe/);
    });

    it('issues vessel to a valid vehicle registration number from vehicle details', async () => {
      // 1. Fetch vessel with lock
      query.mockResolvedValueOnce({ rows: [mockVesselDbRow({ status: 'AVAILABLE', cleaning_status: 'CLEAN' })] });
      // 2. Lookup vehicle in app.vehicles
      query.mockResolvedValueOnce({ rows: [{ id: 'veh-123', registration_number: 'KA-09-AB-2048', kind: 'Van 02', status: 'ACTIVE' }] });
      // 3. Lookup active pickup assignment for vehicle
      query.mockResolvedValueOnce({ rows: [{ pickup_id: '6b597e69-6be5-4d29-97fc-a946fa8a5600' }] });
      // 4. Insert issuance
      query.mockResolvedValueOnce({ rows: [{ id: 'iss-v-1', issued_at: new Date() }] });
      // 5. Update status
      query.mockResolvedValueOnce({ rows: [] });
      // 6. Append log
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/v1/vessels/issue')
        .set('Authorization', 'Bearer valid-admin-token')
        .send({
          vesselId: sampleVesselId,
          registrationNumber: 'KA-09-AB-2048',
          issuedNotes: 'Dispatched with Van 02',
        });
      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.registrationNumber).toBe('KA-09-AB-2048');
    });

    it('strictly rejects registration numbers not found in vehicle details', async () => {
      // 1. Fetch vessel with lock
      query.mockResolvedValueOnce({ rows: [mockVesselDbRow({ status: 'AVAILABLE', cleaning_status: 'CLEAN' })] });
      // 2. Lookup vehicle in app.vehicles -> not found
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/v1/vessels/issue')
        .set('Authorization', 'Bearer valid-admin-token')
        .send({
          vesselId: sampleVesselId,
          registrationNumber: 'KA-99-FAKE-9999',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REGISTRATION_NUMBER');
      expect(res.body.error.message).toMatch(/Vehicle Details/);
    });

    it('rejects issuing vessels to a retired vehicle', async () => {
      // 1. Fetch vessel with lock
      query.mockResolvedValueOnce({ rows: [mockVesselDbRow({ status: 'AVAILABLE', cleaning_status: 'CLEAN' })] });
      // 2. Lookup vehicle in app.vehicles -> RETIRED
      query.mockResolvedValueOnce({ rows: [{ id: 'veh-retired', registration_number: 'KA-01-RET-0001', kind: 'Van', status: 'RETIRED' }] });

      const res = await request(app)
        .post('/api/v1/vessels/issue')
        .set('Authorization', 'Bearer valid-admin-token')
        .send({
          vesselId: sampleVesselId,
          registrationNumber: 'KA-01-RET-0001',
        });
      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/retired/);
    });

    it('returns a vessel and sets it to CLEANING_REQUIRED when returned dirty', async () => {
      // 1. Find active issuance
      query.mockResolvedValueOnce({ rows: [{ id: 'iss-1', pickup_id: 'p-1' }] });
      // 2. Close issuance
      query.mockResolvedValueOnce({ rows: [] });
      // 3. Update vessel
      query.mockResolvedValueOnce({ rows: [] });
      // 4. Record log
      query.mockResolvedValueOnce({ rows: [] });
      // 5. findVesselById
      query.mockResolvedValueOnce({ rows: [mockVesselDbRow({ status: 'CLEANING_REQUIRED', cleaning_status: 'DIRTY' })] });

      const res = await request(app)
        .post(`/api/v1/vessels/${sampleVesselId}/return`)
        .set('Authorization', 'Bearer valid-admin-token')
        .send({
          returnedCondition: 'GOOD',
          returnCleanliness: 'DIRTY',
          returnNotes: 'Used for curry transport; needs wash and sanitize',
        });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CLEANING_REQUIRED');
      expect(res.body.data.cleaningStatus).toBe('DIRTY');
    });
  });

  describe('POST /api/v1/vessels/:id/logs (Cleaning, Inspection, Maintenance History)', () => {
    it('records a cleaning log and resets vessel to CLEAN & AVAILABLE', async () => {
      // 1. getVesselById
      query.mockResolvedValueOnce({ rows: [mockVesselDbRow({ status: 'CLEANING_REQUIRED', cleaning_status: 'DIRTY' })] });
      // 2. insert log
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 'log-1',
            vessel_id: sampleVesselId,
            log_type: 'CLEANING',
            performed_at: sampleDate,
            performed_by: adminActor.id,
            result_status: 'PASSED',
            summary: 'High temperature hot water sanitization complete',
            details: 'Dishwasher cycle 85C with food-grade detergent',
            next_due_at: null,
            created_at: sampleDate,
          },
        ],
      });
      // 3. update vessel
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post(`/api/v1/vessels/${sampleVesselId}/logs`)
        .set('Authorization', 'Bearer valid-admin-token')
        .send({
          logType: 'CLEANING',
          resultStatus: 'PASSED',
          summary: 'High temperature hot water sanitization complete',
          details: 'Dishwasher cycle 85C with food-grade detergent',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.logType).toBe('CLEANING');
    });
  });
});
