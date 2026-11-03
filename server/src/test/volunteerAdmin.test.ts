import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { verify, findUser, repo, withTransaction } = vi.hoisted(() => ({
  verify: vi.fn(),
  findUser: vi.fn(),
  withTransaction: vi.fn(),
  repo: {
    findByAppUserId: vi.fn(), listOwnTeamsByAppUserId: vi.fn(),
    listVolunteers: vi.fn(), findVolunteerById: vi.fn(),
    listTeams: vi.fn(), findTeamById: vi.fn(), findTeamForUpdate: vi.fn(),
    findExistingVolunteerIds: vi.fn(), insertTeam: vi.fn(), updateTeam: vi.fn(), replaceTeamMembers: vi.fn(),
    countAssignmentsForTeam: vi.fn(), deleteTeamMemberships: vi.fn(), deleteTeam: vi.fn(),
  },
}));
vi.mock('../auth/supabase', () => ({ verifySupabaseToken: verify }));
vi.mock('../auth/appUsers', () => ({ findOrCreateAppUser: findUser }));
vi.mock('../db/pool', () => ({ withTransaction }));
vi.mock('../modules/volunteers/repository', () => repo);

import { app } from '../app';

const volunteerId = '7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5';
const secondVolunteerId = '44bada71-76fd-41ad-a1af-b2cd9f2df902';
const teamId = '8d253313-d824-47a1-83dd-5f7dc5c84f60';
const actor = { id: '76b128ea-58d8-4d81-a031-74018056dcf5', authUserId: '076f89a1-77a8-44de-bef3-189291a0f331', role: 'ADMIN', displayName: null };
const volunteerRow = {
  id: volunteerId, person_id: 'f50a3e0e-9f8c-4293-bb2b-fc55e4b3d3d8', registration_code: 'VOL-001',
  name: 'Ada Rao', phone_e164: '+919876543210', skills: ['pickup'], status: 'ACTIVE',
  created_at: new Date('2026-10-01T10:00:00Z'), auth_user_id: 'must-not-appear',
};
const teamRow = {
  id: teamId, name: 'Team Alpha', leader_volunteer_id: volunteerId,
  member_ids: [volunteerId], created_at: new Date('2026-10-01T10:00:00Z'),
};
const auth = { Authorization: 'Bearer verified-token' };

beforeEach(() => {
  vi.clearAllMocks();
  verify.mockResolvedValue({ authUserId: actor.authUserId, email: 'admin@example.test' });
  findUser.mockResolvedValue(actor);
  withTransaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => callback({}));
  repo.listVolunteers.mockResolvedValue({ rows: [volunteerRow], nextCursor: 'next-page' });
  repo.findVolunteerById.mockResolvedValue(volunteerRow);
  repo.listTeams.mockResolvedValue({ rows: [teamRow], nextCursor: null });
  repo.findTeamById.mockResolvedValue(teamRow);
  repo.findTeamForUpdate.mockResolvedValue(teamRow);
  repo.findExistingVolunteerIds.mockImplementation(async (ids: string[]) => ids);
  repo.insertTeam.mockResolvedValue(teamId);
  repo.updateTeam.mockResolvedValue(undefined);
  repo.replaceTeamMembers.mockResolvedValue(undefined);
  repo.countAssignmentsForTeam.mockResolvedValue(0);
  repo.deleteTeamMemberships.mockResolvedValue(undefined);
  repo.deleteTeam.mockResolvedValue(true);
  repo.findByAppUserId.mockResolvedValue(volunteerRow);
  repo.listOwnTeamsByAppUserId.mockResolvedValue([]);
});

describe('ADMIN Volunteer Management API', () => {
  it('lists volunteers with validated search, filters and pagination, exposing only Volunteer fields', async () => {
    const result = await request(app).get(`/api/v1/volunteers?search=Ada&status=ACTIVE&teamId=${teamId}&skill=pickup&limit=2`).set(auth);
    expect(result.status).toBe(200);
    expect(repo.listVolunteers).toHaveBeenCalledWith({ search: 'Ada', status: 'ACTIVE', teamId, skill: 'pickup', limit: 2 });
    expect(result.body.data).toEqual({
      items: [{ id: volunteerId, personId: volunteerRow.person_id, registrationCode: 'VOL-001', name: 'Ada Rao', phoneE164: '+919876543210', skills: ['pickup'], status: 'ACTIVE' }],
      nextCursor: 'next-page',
    });
    expect(JSON.stringify(result.body)).not.toContain('auth_user_id');
  });

  it('retrieves volunteer detail and returns 404 for a missing volunteer', async () => {
    const detail = await request(app).get(`/api/v1/volunteers/${volunteerId}`).set(auth);
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(volunteerId);
    repo.findVolunteerById.mockResolvedValueOnce(null);
    const missing = await request(app).get(`/api/v1/volunteers/${secondVolunteerId}`).set(auth);
    expect(missing.status).toBe(404);
  });

  it('rejects unauthenticated, VOLUNTEER and DONOR roster or detail requests', async () => {
    expect((await request(app).get('/api/v1/volunteers')).status).toBe(401);
    for (const role of ['VOLUNTEER', 'DONOR']) {
      findUser.mockResolvedValue({ ...actor, role });
      expect((await request(app).get('/api/v1/volunteers').set(auth)).status).toBe(403);
      expect((await request(app).get(`/api/v1/volunteers/${volunteerId}`).set(auth)).status).toBe(403);
    }
    expect(repo.listVolunteers).not.toHaveBeenCalled();
    expect(repo.findVolunteerById).not.toHaveBeenCalled();
  });

  it('rejects invalid volunteer UUID, filter and limit inputs', async () => {
    for (const path of ['/api/v1/volunteers/not-a-uuid', '/api/v1/volunteers?limit=101', '/api/v1/volunteers?status=PENDING', '/api/v1/volunteers?teamId=bad']) {
      expect((await request(app).get(path).set(auth)).status).toBe(400);
    }
    expect(repo.listVolunteers).not.toHaveBeenCalled();
    expect(repo.findVolunteerById).not.toHaveBeenCalled();
  });

  it('lists and retrieves team membership summaries for ADMIN only', async () => {
    const list = await request(app).get('/api/v1/teams?limit=5&search=Alpha').set(auth);
    expect(list.status).toBe(200);
    expect(repo.listTeams).toHaveBeenCalledWith({ limit: 5, search: 'Alpha' });
    expect(list.body.data.items).toEqual([{ id: teamId, name: 'Team Alpha', leaderVolunteerId: volunteerId, memberIds: [volunteerId] }]);
    const detail = await request(app).get(`/api/v1/teams/${teamId}`).set(auth);
    expect(detail.status).toBe(200);
    expect(detail.body.data.memberIds).toEqual([volunteerId]);
    repo.findTeamById.mockResolvedValueOnce(null);
    expect((await request(app).get(`/api/v1/teams/${teamId}`).set(auth)).status).toBe(404);
  });

  it('keeps all team reads and writes ADMIN-only and rejects invalid IDs', async () => {
    expect((await request(app).get('/api/v1/teams')).status).toBe(401);
    for (const role of ['VOLUNTEER', 'DONOR']) {
      findUser.mockResolvedValue({ ...actor, role });
      expect((await request(app).get('/api/v1/teams').set(auth)).status).toBe(403);
      expect((await request(app).get(`/api/v1/teams/${teamId}`).set(auth)).status).toBe(403);
      expect((await request(app).post('/api/v1/teams').set(auth).send({ name: 'Team Beta' })).status).toBe(403);
      expect((await request(app).patch(`/api/v1/teams/${teamId}`).set(auth).send({ name: 'Team Beta' })).status).toBe(403);
      expect((await request(app).delete(`/api/v1/teams/${teamId}`).set(auth)).status).toBe(403);
    }
    findUser.mockResolvedValue(actor);
    expect((await request(app).get('/api/v1/teams/not-a-uuid').set(auth)).status).toBe(400);
    expect((await request(app).patch('/api/v1/teams/not-a-uuid').set(auth).send({ name: 'Beta' })).status).toBe(400);
    expect((await request(app).delete('/api/v1/teams/not-a-uuid').set(auth)).status).toBe(400);
    expect((await request(app).get('/api/v1/teams?limit=0').set(auth)).status).toBe(400);
  });

  it('deletes a team only when no operational assignments reference it', async () => {
    expect((await request(app).delete(`/api/v1/teams/${teamId}`)).status).toBe(401);
    repo.countAssignmentsForTeam.mockResolvedValueOnce(1);
    const blocked = await request(app).delete(`/api/v1/teams/${teamId}`).set(auth);
    expect(blocked.status).toBe(409);
    expect(repo.deleteTeamMemberships).not.toHaveBeenCalled();
    expect(repo.deleteTeam).not.toHaveBeenCalled();

    const deleted = await request(app).delete(`/api/v1/teams/${teamId}`).set(auth);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data).toEqual({ id: teamId, deleted: true });
    expect(repo.deleteTeamMemberships).toHaveBeenCalledWith(teamId, expect.anything());
    expect(repo.deleteTeam).toHaveBeenCalledWith(teamId, expect.anything());
  });

  it('creates a team with explicit members and keeps assignment membership untouched', async () => {
    const result = await request(app).post('/api/v1/teams').set(auth).send({ name: 'Team Alpha', leaderVolunteerId: volunteerId, memberIds: [volunteerId] });
    expect(result.status).toBe(201);
    expect(repo.findExistingVolunteerIds).toHaveBeenCalledWith([volunteerId], expect.anything());
    expect(repo.insertTeam).toHaveBeenCalledWith('Team Alpha', volunteerId, expect.anything());
    expect(repo.replaceTeamMembers).toHaveBeenCalledWith(teamId, [volunteerId], expect.anything());
    expect(result.body.data.memberIds).toEqual([volunteerId]);
  });

  it('updates team membership, validates leader membership and reports conflicts', async () => {
    const updatedRow = { ...teamRow, member_ids: [volunteerId, secondVolunteerId] };
    repo.findTeamById.mockResolvedValueOnce(teamRow).mockResolvedValueOnce(updatedRow);
    const updated = await request(app).patch(`/api/v1/teams/${teamId}`).set(auth)
      .send({ memberIds: [volunteerId, secondVolunteerId] });
    expect(updated.status).toBe(200);
    expect(updated.body.data.memberIds).toEqual([volunteerId, secondVolunteerId]);
    expect(repo.replaceTeamMembers).toHaveBeenCalledWith(teamId, [volunteerId, secondVolunteerId], expect.anything());

    expect((await request(app).patch(`/api/v1/teams/${teamId}`).set(auth).send({ memberIds: [] })).status).toBe(400);
    expect((await request(app).post('/api/v1/teams').set(auth)
      .send({ name: 'Bad Team', leaderVolunteerId: volunteerId, memberIds: [] })).status).toBe(400);
    expect((await request(app).post('/api/v1/teams').set(auth)
      .send({ name: 'Bad Team', memberIds: [volunteerId, volunteerId] })).status).toBe(400);
    repo.findExistingVolunteerIds.mockResolvedValueOnce([]);
    expect((await request(app).post('/api/v1/teams').set(auth)
      .send({ name: 'Unknown member', memberIds: [secondVolunteerId] })).status).toBe(404);
    repo.replaceTeamMembers.mockRejectedValueOnce({ code: '23505' });
    expect((await request(app).patch(`/api/v1/teams/${teamId}`).set(auth)
      .send({ memberIds: [volunteerId, secondVolunteerId] })).status).toBe(409);
  });
});

describe('Volunteer own team membership', () => {
  beforeEach(() => { findUser.mockResolvedValue({ ...actor, role: 'VOLUNTEER', volunteerApplicationStatus: 'APPROVED' }); });

  it('returns only the authenticated Volunteer teams and leader flags in the usual page envelope', async () => {
    repo.listOwnTeamsByAppUserId.mockResolvedValue([
      { id: teamId, name: 'Team Alpha', is_leader: true },
      { id: secondVolunteerId, name: 'Team Beta', is_leader: false },
    ]);
    const response = await request(app).get('/api/v1/volunteers/me/teams').set(auth);
    expect(response.status).toBe(200);
    expect(repo.listOwnTeamsByAppUserId).toHaveBeenCalledWith(actor.id);
    expect(response.body.data).toEqual({ items: [
      { id: teamId, name: 'Team Alpha', isLeader: true },
      { id: secondVolunteerId, name: 'Team Beta', isLeader: false },
    ], nextCursor: null });
    expect(JSON.stringify(response.body)).not.toContain('memberIds');
  });

  it('returns an empty list when this Volunteer has no team, and 404 if the profile is missing', async () => {
    const empty = await request(app).get('/api/v1/volunteers/me/teams').set(auth);
    expect(empty.status).toBe(200);
    expect(empty.body.data.items).toEqual([]);
    repo.findByAppUserId.mockResolvedValueOnce(null);
    expect((await request(app).get('/api/v1/volunteers/me/teams').set(auth)).status).toBe(404);
  });

  it('rejects another Volunteer ID and forbids unauthenticated, DONOR and ADMIN callers', async () => {
    expect((await request(app).get('/api/v1/volunteers/me/teams')).status).toBe(401);
    expect((await request(app).get(`/api/v1/volunteers/me/teams?volunteerId=${volunteerId}`).set(auth)).status).toBe(400);
    for (const role of ['DONOR', 'ADMIN']) {
      findUser.mockResolvedValueOnce({ ...actor, role });
      expect((await request(app).get('/api/v1/volunteers/me/teams').set(auth)).status).toBe(403);
    }
    expect(repo.listOwnTeamsByAppUserId).not.toHaveBeenCalled();
  });
});
