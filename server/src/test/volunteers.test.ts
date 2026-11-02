import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { HttpError } from '../middleware/errorHandler';

const { verify, findUser, query, withTransaction, state } = vi.hoisted(() => ({
  verify: vi.fn(),
  findUser: vi.fn(),
  query: vi.fn(),
  withTransaction: vi.fn(),
  state: { profile: null as null | {
    id: string; person_id: string; registration_code: string; name: string;
    phone_e164: string | null; skills: string[]; status: 'ACTIVE' | 'INACTIVE';
  } },
}));

vi.mock('../auth/supabase', () => ({ verifySupabaseToken: verify }));
vi.mock('../auth/appUsers', () => ({ findOrCreateAppUser: findUser }));
vi.mock('../db/pool', () => ({
  getPool: () => ({ query }),
  withTransaction,
}));

import { app } from '../app';

const actor = {
  id: '76b128ea-58d8-4d81-a031-74018056dcf5',
  authUserId: '076f89a1-77a8-44de-bef3-189291a0f331',
  role: 'VOLUNTEER',
  displayName: null,
  volunteerApplicationStatus: 'APPROVED',
};
const volunteerId = '7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5';
const personId = '3c597e69-6be5-4d29-97fc-a946fa8a5300';
const path = '/api/v1/volunteers/me';

beforeEach(() => {
  vi.clearAllMocks();
  state.profile = {
    id: volunteerId,
    person_id: personId,
    registration_code: 'VOL-001',
    name: 'Arjun Rao',
    phone_e164: '+919876543210',
    skills: ['Food Handling'],
    status: 'ACTIVE',
  };
  verify.mockResolvedValue({ authUserId: actor.authUserId, email: 'volunteer@example.test' });
  findUser.mockResolvedValue(actor);
  withTransaction.mockImplementation(async run => run({ query }));
  query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM app.volunteers v')) {
      expect(params).toEqual([actor.id]);
      return { rows: state.profile ? [{ ...state.profile }] : [] };
    }
    if (sql.includes('UPDATE app.people')) {
      expect(params[0]).toBe(personId);
      if (!state.profile) return { rows: [] };
      state.profile.name = (params[1] as string | null) ?? state.profile.name;
      state.profile.phone_e164 = (params[2] as string | null) ?? state.profile.phone_e164;
      return { rows: [{ name: state.profile.name, phone_e164: state.profile.phone_e164 }] };
    }
    throw new Error(`Unexpected volunteer query: ${sql}`);
  });
});

describe('Volunteer self-profile API', () => {
  it('reads only the authenticated volunteer profile', async () => {
    const result = await request(app).get(path).set('Authorization', 'Bearer verified-token').set('X-User-ID', personId);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ success: true, data: {
      id: volunteerId, personId, registrationCode: 'VOL-001', name: 'Arjun Rao',
      phoneE164: '+919876543210', skills: ['Food Handling'], status: 'ACTIVE',
    } });
    expect(verify).toHaveBeenCalledWith('verified-token');
    expect(query.mock.calls[0][1]).toEqual([actor.id]);
  });

  it('updates allowed fields and persists them for the next read', async () => {
    const updated = await request(app).patch(path).set('Authorization', 'Bearer verified-token')
      .send({ name: 'Arjun Kumar', phoneE164: '+919876543211' });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ name: 'Arjun Kumar', phoneE164: '+919876543211', status: 'ACTIVE' });
    expect(query.mock.calls.find(([sql]) => String(sql).includes('UPDATE app.people'))?.[1])
      .toEqual([personId, 'Arjun Kumar', '+919876543211']);
    const reread = await request(app).get(path).set('Authorization', 'Bearer verified-token');
    expect(reread.status).toBe(200);
    expect(reread.body.data).toMatchObject({ name: 'Arjun Kumar', phoneE164: '+919876543211' });
  });

  it('rejects a missing or invalid token with 401', async () => {
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).patch(path).send({ name: 'Other' })).status).toBe(401);
    verify.mockRejectedValueOnce(new HttpError(401, 'UNAUTHENTICATED', 'A verified email session is required.'));
    expect((await request(app).get(path).set('Authorization', 'Bearer invalid-token')).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a DONOR or ADMIN role with 403', async () => {
    for (const role of ['DONOR', 'ADMIN']) {
      findUser.mockResolvedValue({ ...actor, role });
      expect((await request(app).get(path).set('Authorization', 'Bearer verified-token')).status).toBe(403);
      expect((await request(app).patch(path).set('Authorization', 'Bearer verified-token').send({ name: 'Other' })).status).toBe(403);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['role', 'status', 'approvalStatus', 'applicationStatus', 'registrationCode', 'id', 'volunteerId', 'volunteer_id', 'userId', 'user_id', 'authUserId', 'auth_user_id', 'personId', 'adminNotes', 'skills'])(
    'rejects a forbidden %s field with 400', async field => {
      const result = await request(app).patch(path).set('Authorization', 'Bearer verified-token')
        .send({ name: 'Other', [field]: 'changed' });
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe('VALIDATION_ERROR');
      expect(query).not.toHaveBeenCalled();
    }
  );

  it('rejects malformed or empty updates with 400', async () => {
    for (const body of [{}, { name: '   ' }, { phoneE164: '9876543210' }]) {
      const result = await request(app).patch(path).set('Authorization', 'Bearer verified-token').send(body);
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 404 when the authenticated volunteer has no linked profile', async () => {
    state.profile = null;
    const read = await request(app).get(path).set('Authorization', 'Bearer verified-token');
    const update = await request(app).patch(path).set('Authorization', 'Bearer verified-token').send({ name: 'Other' });
    expect(read.status).toBe(404);
    expect(update.status).toBe(404);
    expect(read.body.error.code).toBe('NOT_FOUND');
    expect(update.body.error.code).toBe('NOT_FOUND');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE app.people'))).toBe(false);
  });

  it('does not expose the self-profile route under the shared /teams mount', async () => {
    const result = await request(app).get('/api/v1/teams/me').set('Authorization', 'Bearer verified-token');
    expect(result.status).toBe(404);
  });
});
