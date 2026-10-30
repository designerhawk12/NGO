import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { verify, findUser, changeRole, query } = vi.hoisted(() => ({ verify: vi.fn(), findUser: vi.fn(), changeRole: vi.fn(), query: vi.fn() }));
vi.mock('../auth/supabase', () => ({ verifySupabaseToken: verify }));
vi.mock('../auth/appUsers', () => ({ findOrCreateAppUser: findUser, setAppUserRole: changeRole }));
vi.mock('../db/pool', () => ({ getPool: () => ({ query }) }));

import { app } from '../app';

const donor = { id: '76b128ea-58d8-4d81-a031-74018056dcf5', authUserId: '076f89a1-77a8-44de-bef3-189291a0f331', role: 'DONOR', displayName: null };

beforeEach(() => {
  vi.clearAllMocks();
  verify.mockResolvedValue({ authUserId: donor.authUserId, email: 'user@example.com' });
  findUser.mockResolvedValue(donor);
});

describe('API foundation', () => {
  it('serves liveness without a database and emits a request ID', async () => {
    const result = await request(app).get('/api/v1/health');
    expect(result.status).toBe(200);
    expect(result.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.body.data.status).toBe('ok');
  });

  it('reports readiness when database connection succeeds', async () => {
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const result = await request(app).get('/api/v1/health/ready');
    expect(result.status).toBe(200);
    expect(result.body.data.status).toBe('ready');
  });

  it('reports 503 SERVICE_UNAVAILABLE when database query fails without exposing internal error', async () => {
    query.mockRejectedValueOnce(new Error('Connection lost'));
    const result = await request(app).get('/api/v1/health/ready');
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(result.body.error.message).toBe('Database is temporarily unavailable.');
  });

  it('classifies known PostgreSQL connection failures without exposing driver details', async () => {
    const failure = Object.assign(new Error('sensitive connection detail'), { code: 'ENOTFOUND' });
    findUser.mockRejectedValueOnce(failure);
    const result = await request(app).get('/api/v1/me').set('Authorization', 'Bearer signed-token');
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(JSON.stringify(result.body)).not.toContain('sensitive connection detail');
  });

  it('keeps unexpected /me database failures generic to clients', async () => {
    findUser.mockRejectedValueOnce(Object.assign(new Error('permission denied for relation app_users'), { code: '42501' }));

    const result = await request(app).get('/api/v1/me').set('Authorization', 'Bearer signed-token');

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('INTERNAL_ERROR');
    expect(result.body.error.message).toBe('Something went wrong.');
    expect(JSON.stringify(result.body)).not.toContain('permission denied');
  });

  it('rejects missing bearer tokens', async () => {
    const result = await request(app).get('/api/v1/me');
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe('UNAUTHENTICATED');
    expect(result.body.error.requestId).toBe(result.headers['x-request-id']);
  });

  it('returns the server role, not a client-selected role', async () => {
    const result = await request(app).get('/api/v1/me').set('Authorization', 'Bearer signed-token').set('X-Role', 'ADMIN');
    expect(result.status).toBe(200);
    expect(result.body.data.role).toBe('DONOR');
    expect(verify).toHaveBeenCalledWith('signed-token');
  });

  it('prevents donor role grants and validates admin input', async () => {
    const forbidden = await request(app).patch(`/api/v1/admin/users/${donor.id}/role`).set('Authorization', 'Bearer signed-token').send({ role: 'ADMIN' });
    expect(forbidden.status).toBe(403);
    findUser.mockResolvedValue({ ...donor, role: 'ADMIN' });
    const invalid = await request(app).patch(`/api/v1/admin/users/${donor.id}/role`).set('Authorization', 'Bearer signed-token').send({ role: 'SUPERUSER' });
    expect(invalid.status).toBe(400);
    expect(changeRole).not.toHaveBeenCalled();
  });

  it('allows an admin grant through the central role service', async () => {
    findUser.mockResolvedValue({ ...donor, role: 'ADMIN' });
    changeRole.mockResolvedValue({ ...donor, role: 'VOLUNTEER' });
    const result = await request(app).patch(`/api/v1/admin/users/${donor.id}/role`).set('Authorization', 'Bearer signed-token').send({ role: 'VOLUNTEER' });
    expect(result.status).toBe(200);
    expect(changeRole).toHaveBeenCalledWith(donor.id, 'VOLUNTEER', donor.id);
  });

  it('keeps VOLUNTEER access below ADMIN for central role and vehicle-roster endpoints', async () => {
    findUser.mockResolvedValue({ ...donor, role: 'VOLUNTEER' });
    const me = await request(app).get('/api/v1/me').set('Authorization', 'Bearer signed-token').set('X-Role', 'ADMIN');
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe('VOLUNTEER');
    const roleChange = await request(app).patch(`/api/v1/admin/users/${donor.id}/role`).set('Authorization', 'Bearer signed-token').send({ role: 'ADMIN' });
    expect(roleChange.status).toBe(403);
    const roster = await request(app).get('/api/v1/vehicles/3c597e69-6be5-4d29-97fc-a946fa8a5300/assignments').set('Authorization', 'Bearer signed-token');
    expect(roster.status).toBe(403);
  });

  it('limits the vehicle assignment projection to administrators and reads canonical assignments', async () => {
    const vehicleId = '3c597e69-6be5-4d29-97fc-a946fa8a5300';
    const path = `/api/v1/vehicles/${vehicleId}/assignments`;
    const forbidden = await request(app).get(path).set('Authorization', 'Bearer signed-token');
    expect(forbidden.status).toBe(403);
    expect(query).not.toHaveBeenCalled();

    findUser.mockResolvedValue({ ...donor, role: 'ADMIN' });
    query.mockResolvedValue({ rows: [{
      assignment_id: '76b128ea-58d8-4d81-a031-74018056dcf5',
      pickup_id: '076f89a1-77a8-44de-bef3-189291a0f331',
      status: 'ACCEPTED',
      window_starts_at: new Date('2026-10-10T10:00:00Z'),
      window_ends_at: new Date('2026-10-10T12:00:00Z'),
      driver_id: vehicleId,
      volunteer_ids: [vehicleId],
    }] });
    const allowed = await request(app).get(path).set('Authorization', 'Bearer signed-token');
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.items).toMatchObject([{ status: 'ACCEPTED', volunteerIds: [vehicleId] }]);
    expect(query.mock.calls[0][0]).toContain('FROM app.assignments');
  });
});
