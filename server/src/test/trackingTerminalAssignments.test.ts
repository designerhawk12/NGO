import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { verify, findUser, query } = vi.hoisted(() => ({
  verify: vi.fn(),
  findUser: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../auth/supabase', () => ({ verifySupabaseToken: verify }));
vi.mock('../auth/appUsers', () => ({ findOrCreateAppUser: findUser }));
vi.mock('../db/pool', () => ({ getPool: () => ({ query }) }));

import { app } from '../app';

const pickupId = '76b128ea-58d8-4d81-a031-74018056dcf5';
const vehicleId = '3c597e69-6be5-4d29-97fc-a946fa8a5300';
const volunteer = {
  id: 'b0000000-0000-4000-8000-000000000002',
  authUserId: 'a0000000-0000-4000-8000-000000000002',
  role: 'VOLUNTEER',
  volunteerApplicationStatus: 'APPROVED',
  displayName: 'Volunteer',
};

beforeEach(() => {
  vi.clearAllMocks();
  verify.mockResolvedValue({ authUserId: volunteer.authUserId, email: 'volunteer@example.test' });
  findUser.mockResolvedValue(volunteer);
});

describe('Vehicle tracking after a terminal assignment', () => {
  it('rejects new consent once the assignment is delivered', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await request(app)
      .post(`/api/v1/pickups/${pickupId}/tracking-consent`)
      .set('Authorization', 'Bearer signed-token')
      .send({ pickupId, consent: true });

    expect(response.status).toBe(403);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("a.status NOT IN ('REJECTED', 'CANCELLED', 'FAILED', 'DELIVERED')");
    expect(query.mock.calls[0][0]).toContain('FROM app.assignments');
  });

  it('rejects a location after delivery without reading consent or inserting a point', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: vehicleId }], rowCount: 1 });
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await request(app)
      .post(`/api/v1/vehicles/${vehicleId}/locations`)
      .set('Authorization', 'Bearer signed-token')
      .send({ pickupId, latitude: 18.52, longitude: 73.85, recordedAt: '2026-11-03T10:00:00.000Z' });

    expect(response.status).toBe(403);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain("a.status NOT IN ('REJECTED', 'CANCELLED', 'FAILED', 'DELIVERED')");
    expect(query.mock.calls[1][0]).toContain('FROM app.assignments');
  });

  it('continues to accept a location for an assigned reporter with consent', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: vehicleId }], rowCount: 1 });
    query.mockResolvedValueOnce({ rows: [{ id: 'assignment' }], rowCount: 1 });
    query.mockResolvedValueOnce({ rows: [{ id: 'consent' }], rowCount: 1 });
    query.mockResolvedValueOnce({ rows: [{ id: 'location', vehicleId, pickupId }], rowCount: 1 });

    const response = await request(app)
      .post(`/api/v1/vehicles/${vehicleId}/locations`)
      .set('Authorization', 'Bearer signed-token')
      .send({ pickupId, latitude: 18.52, longitude: 73.85, recordedAt: '2026-11-03T10:00:00.000Z' });

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe('location');
    expect(query.mock.calls[3][0]).toContain('INSERT INTO app.vehicle_locations');
  });
});
