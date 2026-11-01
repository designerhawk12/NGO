import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { HttpError } from '../middleware/errorHandler';

type SlotRow = {
  id: string; volunteer_id: string; starts_at: Date; ends_at: Date;
  state: 'AVAILABLE' | 'UNAVAILABLE';
};
const { verify, findUser, query, state } = vi.hoisted(() => ({
  verify: vi.fn(),
  findUser: vi.fn(),
  query: vi.fn(),
  state: { profileExists: true, slots: [] as SlotRow[] },
}));

vi.mock('../auth/supabase', () => ({ verifySupabaseToken: verify }));
vi.mock('../auth/appUsers', () => ({ findOrCreateAppUser: findUser }));
vi.mock('../db/pool', () => ({ getPool: () => ({ query }), withTransaction: vi.fn() }));

import { app } from '../app';
import { getVolunteerAvailabilityForWindow } from '../modules/volunteers/service';

const actor = {
  id: '76b128ea-58d8-4d81-a031-74018056dcf5',
  authUserId: '076f89a1-77a8-44de-bef3-189291a0f331',
  role: 'VOLUNTEER',
  displayName: null,
  volunteerApplicationStatus: 'APPROVED',
};
const volunteerId = '7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5';
const otherVolunteerId = '44bada71-76fd-41ad-a1af-b2cd9f2df902';
const ownSlotId = '3c597e69-6be5-4d29-97fc-a946fa8a5300';
const otherSlotId = '4930177d-825c-4207-9c76-d303591a6102';
const path = '/api/v1/volunteers/me/availability';
const validInput = {
  startsAt: '2026-11-01T10:00:00Z',
  endsAt: '2026-11-01T12:00:00Z',
  state: 'AVAILABLE',
};

beforeEach(() => {
  vi.clearAllMocks();
  state.profileExists = true;
  state.slots = [
    { id: ownSlotId, volunteer_id: volunteerId, starts_at: new Date(validInput.startsAt), ends_at: new Date(validInput.endsAt), state: 'AVAILABLE' },
    { id: otherSlotId, volunteer_id: otherVolunteerId, starts_at: new Date(validInput.startsAt), ends_at: new Date(validInput.endsAt), state: 'UNAVAILABLE' },
  ];
  verify.mockResolvedValue({ authUserId: actor.authUserId, email: 'volunteer@example.test' });
  findUser.mockResolvedValue(actor);
  query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.startsWith('SELECT') && sql.includes('FROM app.volunteers v') && sql.includes('JOIN app.people p')) {
      expect(params).toEqual([actor.id]);
      return { rows: state.profileExists ? [{ id: volunteerId }] : [] };
    }
    if (sql.includes('FROM app.volunteer_availability') && sql.includes('ORDER BY')) {
      return { rows: state.slots.filter(slot => slot.volunteer_id === params[0]) };
    }
    if (sql.includes('INSERT INTO app.volunteer_availability')) {
      expect(params[0]).toBe(actor.id);
      if (!state.profileExists) return { rows: [] };
      const row: SlotRow = {
        id: '64a23fc2-b2f7-4b4a-bcc2-399d31c0d501', volunteer_id: volunteerId,
        starts_at: new Date(params[1] as string), ends_at: new Date(params[2] as string),
        state: params[3] as SlotRow['state'],
      };
      state.slots.push(row);
      return { rows: [row] };
    }
    if (sql.includes('UPDATE app.volunteer_availability a')) {
      expect(params[1]).toBe(actor.id);
      const slot = state.slots.find(item => item.id === params[0] && item.volunteer_id === volunteerId);
      if (!slot) return { rows: [] };
      slot.starts_at = new Date(params[2] as string);
      slot.ends_at = new Date(params[3] as string);
      slot.state = params[4] as SlotRow['state'];
      return { rows: [{ ...slot }] };
    }
    if (sql.includes('AS is_available') && sql.includes('FROM app.volunteers v')) {
      const [id, start, end] = params as [string, Date, Date];
      if (id !== volunteerId) return { rows: [] };
      const slots = state.slots.filter(slot => slot.volunteer_id === id);
      const covered = slots.some(slot => slot.state === 'AVAILABLE' && slot.starts_at <= start && slot.ends_at >= end);
      const blocked = slots.some(slot => slot.state === 'UNAVAILABLE' && slot.starts_at < end && slot.ends_at > start);
      return { rows: [{ id, person_id: 'a0dc14bd-b2c8-45da-a515-9f919746c952', status: 'ACTIVE', is_available: covered && !blocked }] };
    }
    throw new Error(`Unexpected availability query: ${sql}`);
  });
});

describe('Volunteer own availability API', () => {
  it('reads only the authenticated volunteer slots', async () => {
    const result = await request(app).get(path).set('Authorization', 'Bearer verified-token');
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ items: [{ id: ownSlotId, volunteerId, state: 'AVAILABLE' }], nextCursor: null });
    expect(result.body.data.items).toHaveLength(1);
    expect(query.mock.calls.find(([sql]) => String(sql).includes('ORDER BY'))?.[1]).toEqual([volunteerId]);
  });

  it('does not expose availability under the shared teams mount', async () => {
    const result = await request(app).get('/api/v1/teams/me/availability').set('Authorization', 'Bearer verified-token');
    expect(result.status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });

  it('creates and replaces only its own slot, persisting both for subsequent reads', async () => {
    const created = await request(app).post(path).set('Authorization', 'Bearer verified-token')
      .send({ ...validInput, startsAt: '2026-11-02T10:00:00Z', endsAt: '2026-11-02T12:00:00Z' });
    expect(created.status).toBe(201);
    expect(created.body.data.volunteerId).toBe(volunteerId);
    const replacement = { startsAt: '2026-11-03T09:00:00+05:30', endsAt: '2026-11-03T11:00:00+05:30', state: 'UNAVAILABLE' };
    const updated = await request(app).patch(`${path}/${ownSlotId}`).set('Authorization', 'Bearer verified-token').send(replacement);
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ id: ownSlotId, volunteerId, startsAt: '2026-11-03T03:30:00.000Z', endsAt: '2026-11-03T05:30:00.000Z', state: 'UNAVAILABLE' });
    const reread = await request(app).get(path).set('Authorization', 'Bearer verified-token');
    expect(reread.body.data.items).toHaveLength(2);
    expect(reread.body.data.items.find((slot: { id: string }) => slot.id === ownSlotId)).toMatchObject({ state: 'UNAVAILABLE' });
  });

  it('rejects invalid timestamps, inverted windows, and unsupported states with 400', async () => {
    for (const body of [
      { ...validInput, startsAt: 'tomorrow' },
      { ...validInput, endsAt: validInput.startsAt },
      { ...validInput, endsAt: '2026-11-01T09:00:00Z' },
      { ...validInput, state: 'RESERVED' },
    ]) {
      const result = await request(app).post(path).set('Authorization', 'Bearer verified-token').send(body);
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe('VALIDATION_ERROR');
    }
    const invalidUpdate = await request(app).patch(`${path}/${ownSlotId}`)
      .set('Authorization', 'Bearer verified-token')
      .send({ ...validInput, startsAt: validInput.endsAt });
    expect(invalidUpdate.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated and wrong-role reads or writes', async () => {
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).post(path).send(validInput)).status).toBe(401);
    verify.mockRejectedValueOnce(new HttpError(401, 'UNAUTHENTICATED', 'Invalid token.'));
    expect((await request(app).get(path).set('Authorization', 'Bearer invalid-token')).status).toBe(401);
    for (const role of ['DONOR', 'ADMIN']) {
      findUser.mockResolvedValue({ ...actor, role });
      expect((await request(app).get(path).set('Authorization', 'Bearer verified-token')).status).toBe(403);
      expect((await request(app).post(path).set('Authorization', 'Bearer verified-token').send(validInput)).status).toBe(403);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects client-supplied ownership IDs and cannot replace another volunteer slot', async () => {
    for (const field of ['volunteerId', 'volunteer_id', 'userId', 'authUserId']) {
      const result = await request(app).post(path).set('Authorization', 'Bearer verified-token')
        .send({ ...validInput, [field]: otherVolunteerId });
      expect(result.status).toBe(400);
    }
    const other = await request(app).patch(`${path}/${otherSlotId}`).set('Authorization', 'Bearer verified-token').send(validInput);
    expect(other.status).toBe(404);
    const forgedUpdate = await request(app).patch(`${path}/${ownSlotId}`).set('Authorization', 'Bearer verified-token')
      .send({ ...validInput, volunteerId: otherVolunteerId });
    expect(forgedUpdate.status).toBe(400);
    expect(state.slots.find(slot => slot.id === otherSlotId)?.state).toBe('UNAVAILABLE');
  });

  it('returns 404 for a missing linked profile or slot', async () => {
    state.profileExists = false;
    expect((await request(app).get(path).set('Authorization', 'Bearer verified-token')).status).toBe(404);
    expect((await request(app).post(path).set('Authorization', 'Bearer verified-token').send(validInput)).status).toBe(404);
    state.profileExists = true;
    const missing = await request(app).patch(`${path}/4930177d-825c-4207-9c76-d303591a6103`)
      .set('Authorization', 'Bearer verified-token').send(validInput);
    expect(missing.status).toBe(404);
  });

  it('keeps duplicate and overlapping slots because no contract or constraint forbids them', async () => {
    const exact = await request(app).post(path).set('Authorization', 'Bearer verified-token').send(validInput);
    const overlap = await request(app).post(path).set('Authorization', 'Bearer verified-token')
      .send({ startsAt: '2026-11-01T11:00:00Z', endsAt: '2026-11-01T13:00:00Z', state: 'UNAVAILABLE' });
    expect(exact.status).toBe(201);
    expect(overlap.status).toBe(201);
  });

  it('provides the current read-only window eligibility behavior without reserving', async () => {
    const start = new Date('2026-11-01T10:30:00Z');
    const end = new Date('2026-11-01T11:30:00Z');
    expect(await getVolunteerAvailabilityForWindow(volunteerId, start, end)).toMatchObject({ status: 'ACTIVE', isAvailable: true });
    state.slots.push({ id: '87169033-768e-4f79-9e67-80aa9d5e297f', volunteer_id: volunteerId, starts_at: start, ends_at: end, state: 'UNAVAILABLE' });
    expect(await getVolunteerAvailabilityForWindow(volunteerId, start, end)).toMatchObject({ isAvailable: false });
    expect(await getVolunteerAvailabilityForWindow(otherVolunteerId, start, end)).toBeNull();
    expect(query.mock.calls.every(([sql]) => String(sql).startsWith('SELECT'))).toBe(true);
  });
});
