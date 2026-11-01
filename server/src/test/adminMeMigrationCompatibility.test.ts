import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { query, verify } = vi.hoisted(() => ({ query: vi.fn(), verify: vi.fn() }));
vi.mock('../db/pool', () => ({ getPool: () => ({ query }), withTransaction: vi.fn() }));
vi.mock('../auth/supabase', () => ({ verifySupabaseToken: verify }));

import { app } from '../app';

const authUserId = '076f89a1-77a8-44de-bef3-189291a0f331';
const adminId = '76b128ea-58d8-4d81-a031-74018056dcf5';

beforeEach(() => {
  vi.clearAllMocks();
  verify.mockResolvedValue({ authUserId, email: 'admin@example.test' });
});

describe('Admin /me compatibility before Volunteer Applications migration', () => {
  it('authenticates and returns an existing Admin without querying volunteer_applications', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      id: adminId,
      auth_user_id: authUserId,
      role: 'ADMIN',
      display_name: 'Existing Admin',
      disabled_at: null,
      volunteer_profile_id: null,
    }] });

    const response = await request(app)
      .get('/api/v1/me')
      .set('Authorization', 'Bearer verified-test-token');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: adminId, authUserId, role: 'ADMIN' });
    expect(verify).toHaveBeenCalledWith('verified-test-token');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).not.toContain('volunteer_applications');
  });
});
