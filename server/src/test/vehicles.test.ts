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

const sampleVehicleId = '3c597e69-6be5-4d29-97fc-a946fa8a5300';
const sampleDate = new Date('2026-10-23T10:00:00Z');

function mockVehicleDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: sampleVehicleId,
    registration_number: 'KA-01-AB-1234',
    kind: 'Van',
    capacity_kg: '300.00',
    status: 'ACTIVE',
    size_category: 'MEDIUM',
    indicative_max_vessels: 12,
    created_at: sampleDate,
    has_active_downtime: false,
    curr_assignment_id: null,
    curr_pickup_id: null,
    curr_assignment_status: null,
    curr_window_starts_at: null,
    curr_window_ends_at: null,
    curr_driver_id: null,
    curr_driver_name: null,
    curr_driver_phone: null,
    curr_driver_licence: null,
    latest_serviced_on: '2026-09-01',
    latest_condition: 'GOOD',
    latest_summary: 'Routine service',
    latest_next_service_due_on: '2026-12-01',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  verify.mockResolvedValue({ authUserId: adminActor.authUserId, email: 'admin@example.test' });
  findUser.mockResolvedValue(adminActor);
});

describe('Vehicle Management & Reliable Readiness API (Module 5)', () => {
  describe('Authorization & Permissions', () => {
    it('rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/v1/vehicles');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects non-admin roles (VOLUNTEER) with 403 FORBIDDEN', async () => {
      findUser.mockResolvedValueOnce(volunteerActor);
      const res = await request(app)
        .get('/api/v1/vehicles')
        .set('Authorization', 'Bearer volunteer-token');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows ADMIN to access vehicle endpoints', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .get('/api/v1/vehicles')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual([]);
    });
  });

  describe('GET /api/v1/vehicles (List with filtering & pagination)', () => {
    it('returns vehicles with derived readiness and current assignment details', async () => {
      query.mockResolvedValueOnce({
        rows: [
          mockVehicleDbRow(),
          mockVehicleDbRow({
            id: '7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5',
            registration_number: 'KA-01-CD-5678',
            status: 'MAINTENANCE',
            has_active_downtime: true,
          }),
        ],
      });

      const res = await request(app)
        .get('/api/v1/vehicles')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);

      const activeVeh = res.body.data.items[0];
      expect(activeVeh.registrationNumber).toBe('KA-01-AB-1234');
      expect(activeVeh.readiness.isReady).toBe(true);
      expect(activeVeh.readiness.dispatchStatus).toBe('READY');

      const maintVeh = res.body.data.items[1];
      expect(maintVeh.readiness.isReady).toBe(false);
      expect(maintVeh.readiness.dispatchStatus).toBe('MAINTENANCE_RESTRICTED');
      expect(maintVeh.readiness.reasons.some((r: any) => r.code === 'MAINTENANCE_STATUS')).toBe(true);
    });

    it('validates query parameters and rejects invalid limit', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles?limit=500')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/vehicles/summary (Fleet summary metrics)', () => {
    it('returns accurate summary counts derived from database data', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            total: 10,
            available: 6,
            on_trip: 2,
            maintenance: 2,
            retired: 0,
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/vehicles/summary')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        total: 10,
        available: 6,
        onTrip: 2,
        maintenance: 2,
        retired: 0,
      });
    });
  });

  describe('GET /api/v1/vehicles/:id (Single vehicle details)', () => {
    it('rejects invalid non-UUID vehicle id with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles/not-a-uuid')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 NOT_FOUND when vehicle does not exist', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get(`/api/v1/vehicles/${sampleVehicleId}`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns vehicle details with active driver derived from current assignment', async () => {
      query.mockResolvedValueOnce({
        rows: [
          mockVehicleDbRow({
            curr_assignment_id: 'a0000000-0000-4000-8000-000000000010',
            curr_pickup_id: 'p0000000-0000-4000-8000-000000000010',
            curr_assignment_status: 'EN_ROUTE',
            curr_window_starts_at: new Date('2026-10-23T09:00:00Z'),
            curr_window_ends_at: new Date('2026-10-23T11:00:00Z'),
            curr_driver_id: 'd0000000-0000-4000-8000-000000000001',
            curr_driver_name: 'Ramesh Kumar',
            curr_driver_phone: '+919876543210',
            curr_driver_licence: 'DL-01-2020-001',
          }),
        ],
      });

      const res = await request(app)
        .get(`/api/v1/vehicles/${sampleVehicleId}`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data.currentDriver).toEqual({
        driverId: 'd0000000-0000-4000-8000-000000000001',
        name: 'Ramesh Kumar',
        phone: '+919876543210',
        licenceNumber: 'DL-01-2020-001',
      });
      expect(res.body.data.readiness.isReady).toBe(false);
      expect(res.body.data.readiness.dispatchStatus).toBe('DISPATCHED');
      expect(res.body.data.readiness.reasons).toContainEqual(
        expect.objectContaining({ code: 'ACTIVE_ASSIGNMENT_CONFLICT' })
      );
    });
  });

  describe('POST /api/v1/vehicles (Create vehicle)', () => {
    it('creates a vehicle successfully with 201 status', async () => {
      // First query is the INSERT returning created row
      query.mockResolvedValueOnce({
        rows: [
          {
            id: sampleVehicleId,
            registration_number: 'KA-05-MN-9999',
            kind: 'Mini Truck',
            capacity_kg: '500.00',
            status: 'ACTIVE',
            size_category: 'MEDIUM',
            indicative_max_vessels: 20,
            created_at: sampleDate,
          },
        ],
      });
      // Second query is findVehicleById
      query.mockResolvedValueOnce({
        rows: [
          mockVehicleDbRow({
            registration_number: 'KA-05-MN-9999',
            kind: 'Mini Truck',
            capacity_kg: '500.00',
          }),
        ],
      });

      const res = await request(app)
        .post('/api/v1/vehicles')
        .set('Authorization', 'Bearer admin-token')
        .send({
          registrationNumber: 'ka-05-mn-9999',
          kind: 'Mini Truck',
          capacityKg: 500,
          sizeCategory: 'MEDIUM',
          indicativeMaxVessels: 20,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.registrationNumber).toBe('KA-05-MN-9999');
    });

    it('rejects invalid vehicle fields (e.g. non-positive capacity)', async () => {
      const res = await request(app)
        .post('/api/v1/vehicles')
        .set('Authorization', 'Bearer admin-token')
        .send({
          registrationNumber: 'KA-05-MN-9999',
          kind: 'Mini Truck',
          capacityKg: -50,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('maps duplicate registration constraint error (23505) to 409 RESOURCE_CONFLICT', async () => {
      const error: any = new Error('duplicate key value violates unique constraint');
      error.code = '23505';
      error.detail = 'Key (registration_number)=(KA-01-AB-1234) already exists.';
      query.mockRejectedValueOnce(error);

      const res = await request(app)
        .post('/api/v1/vehicles')
        .set('Authorization', 'Bearer admin-token')
        .send({
          registrationNumber: 'KA-01-AB-1234',
          kind: 'Van',
          capacityKg: 300,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
    });
  });

  describe('PATCH /api/v1/vehicles/:id (Update vehicle)', () => {
    it('updates permitted vehicle fields and returns updated record', async () => {
      query.mockResolvedValueOnce({ rows: [mockVehicleDbRow()] }); // findVehicleById existing
      query.mockResolvedValueOnce({ rows: [{ id: sampleVehicleId }] }); // UPDATE
      query.mockResolvedValueOnce({ rows: [mockVehicleDbRow({ capacity_kg: '450.00' })] }); // findVehicleById new

      const res = await request(app)
        .patch(`/api/v1/vehicles/${sampleVehicleId}`)
        .set('Authorization', 'Bearer admin-token')
        .send({
          capacityKg: 450,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.capacityKg).toBe(450);
    });

    it('rejects empty update body with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .patch(`/api/v1/vehicles/${sampleVehicleId}`)
        .set('Authorization', 'Bearer admin-token')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('maps database trigger failure (23514) on status change conflict to 409 RESOURCE_CONFLICT', async () => {
      query.mockResolvedValueOnce({ rows: [mockVehicleDbRow()] });
      const error: any = new Error('Release active vehicle reservations before changing status');
      error.code = '23514';
      query.mockRejectedValueOnce(error);

      const res = await request(app)
        .patch(`/api/v1/vehicles/${sampleVehicleId}`)
        .set('Authorization', 'Bearer admin-token')
        .send({
          status: 'MAINTENANCE',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('active reservations');
    });
  });

  describe('Vehicle Maintenance History & Logging', () => {
    it('GET /api/v1/vehicles/:id/maintenance returns maintenance history', async () => {
      query.mockResolvedValueOnce({ rows: [mockVehicleDbRow()] }); // vehicle check
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 'm0000000-0000-4000-8000-000000000001',
            vehicle_id: sampleVehicleId,
            serviced_on: '2026-09-01',
            condition: 'GOOD',
            summary: 'Engine oil and brake check',
            next_service_due_on: '2026-12-01',
            recorded_by: adminActor.id,
            created_at: sampleDate,
          },
        ],
      });

      const res = await request(app)
        .get(`/api/v1/vehicles/${sampleVehicleId}/maintenance`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].condition).toBe('GOOD');
    });

    it('POST /api/v1/vehicles/:id/maintenance records service with 201', async () => {
      query.mockResolvedValueOnce({ rows: [] }); // BEGIN
      query.mockResolvedValueOnce({ rows: [{ id: sampleVehicleId, status: 'ACTIVE' }] }); // check veh
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 'm0000000-0000-4000-8000-000000000002',
            vehicle_id: sampleVehicleId,
            serviced_on: '2026-10-23',
            condition: 'GOOD',
            summary: 'Tire replacement',
            next_service_due_on: '2027-04-23',
            recorded_by: adminActor.id,
            created_at: sampleDate,
          },
        ],
      });
      query.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const res = await request(app)
        .post(`/api/v1/vehicles/${sampleVehicleId}/maintenance`)
        .set('Authorization', 'Bearer admin-token')
        .send({
          servicedOn: '2026-10-23',
          condition: 'GOOD',
          summary: 'Tire replacement',
          nextServiceDueOn: '2027-04-23',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.summary).toBe('Tire replacement');
    });

    it('automatically transitions vehicle to MAINTENANCE when logged condition is UNSAFE', async () => {
      query.mockResolvedValueOnce({ rows: [] }); // BEGIN
      query.mockResolvedValueOnce({ rows: [{ id: sampleVehicleId, status: 'ACTIVE' }] }); // check veh
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 'm0000000-0000-4000-8000-000000000003',
            vehicle_id: sampleVehicleId,
            serviced_on: '2026-10-23',
            condition: 'UNSAFE',
            summary: 'Brake failure detected',
            next_service_due_on: null,
            recorded_by: adminActor.id,
            created_at: sampleDate,
          },
        ],
      });
      // UPDATE to MAINTENANCE
      query.mockResolvedValueOnce({ rows: [] });
      query.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const res = await request(app)
        .post(`/api/v1/vehicles/${sampleVehicleId}/maintenance`)
        .set('Authorization', 'Bearer admin-token')
        .send({
          servicedOn: '2026-10-23',
          condition: 'UNSAFE',
          summary: 'Brake failure detected',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.condition).toBe('UNSAFE');
    });
  });

  describe('GET /api/v1/drivers (List drivers for assignment context)', () => {
    it('returns registered drivers with status and licence expiry', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 'd0000000-0000-4000-8000-000000000001',
            person_id: 'p0000000-0000-4000-8000-000000000001',
            name: 'Vikram Singh',
            phone_e164: '+919123456789',
            licence_number: 'KA-01-2022-9988',
            licence_expires_on: '2029-05-15',
            status: 'ACTIVE',
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/drivers')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].name).toBe('Vikram Singh');
    });
  });

  describe('Preservation of existing Module 3 vehicle assignment endpoint', () => {
    it('GET /api/v1/vehicles/:id/assignments continues to serve Module 3 projection', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            assignment_id: 'a0000000-0000-4000-8000-000000000001',
            pickup_id: 'p0000000-0000-4000-8000-000000000001',
            status: 'ASSIGNED',
            window_starts_at: new Date('2026-10-23T11:00:00Z'),
            window_ends_at: new Date('2026-10-23T13:00:00Z'),
            driver_id: 'd0000000-0000-4000-8000-000000000001',
            volunteer_ids: ['v0000000-0000-4000-8000-000000000001'],
          },
        ],
      });

      const res = await request(app)
        .get(`/api/v1/vehicles/${sampleVehicleId}/assignments`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].assignmentId).toBe('a0000000-0000-4000-8000-000000000001');
    });
  });

  describe('DELETE /api/v1/vehicles/:id (Vehicle deletion and foreign-key conflict handling)', () => {
    it('rejects invalid non-UUID vehicle id with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .delete('/api/v1/vehicles/invalid-id')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 NOT_FOUND when vehicle does not exist', async () => {
      query.mockResolvedValueOnce({ rows: [] }); // vehCheck

      const res = await request(app)
        .delete(`/api/v1/vehicles/${sampleVehicleId}`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('successfully deletes an unreferenced vehicle with 200', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: sampleVehicleId }] }); // vehCheck
      query.mockResolvedValueOnce({ rows: [{ id: sampleVehicleId }] }); // DELETE

      const res = await request(app)
        .delete(`/api/v1/vehicles/${sampleVehicleId}`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('maps foreign key violation (23503) to 409 RESOURCE_CONFLICT and suggests retirement', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: sampleVehicleId }] }); // vehCheck
      const fkError: any = new Error('update or delete on table "vehicles" violates foreign key constraint');
      fkError.code = '23503';
      fkError.detail = 'Key (id)=(3c597e69-6be5-4d29-97fc-a946fa8a5300) is still referenced from table "assignments".';
      query.mockRejectedValueOnce(fkError);

      const res = await request(app)
        .delete(`/api/v1/vehicles/${sampleVehicleId}`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toContain('Retire the vehicle instead');
    });
  });
});
