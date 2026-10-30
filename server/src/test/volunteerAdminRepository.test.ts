import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/pool', () => ({ getPool: () => ({ query }) }));

import { findAdminVolunteerConflict, findVolunteerAuthAccountById, insertInvitedVolunteer, listEligibleVolunteerRows, listOwnTeamsByAppUserId, listTeams, listVolunteers, updateAdminVolunteerRows } from '../modules/volunteers/repository';
import type { PoolClient } from 'pg';

const ids = [
  '7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5',
  '44bada71-76fd-41ad-a1af-b2cd9f2df902',
  '8d253313-d824-47a1-83dd-5f7dc5c84f60',
];
const rows = ids.map((id, index) => ({ id, created_at: new Date(`2026-10-0${index + 1}T10:00:00Z`) }));

beforeEach(() => { vi.clearAllMocks(); });

describe('Volunteer admin repository pagination', () => {
  it('uses parameterized filters and a stable created-at/id cursor for volunteers', async () => {
    query.mockResolvedValueOnce({ rows });
    const first = await listVolunteers({ limit: 2, search: 'Ada', status: 'ACTIVE', skill: 'pickup', teamId: ids[0] });
    expect(first.rows).toEqual(rows.slice(0, 2));
    expect(first.nextCursor).toEqual(expect.any(String));
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ORDER BY v.created_at DESC, v.id DESC');
    expect(sql).toContain('app.team_members');
    expect(params).toEqual(['Ada', 'ACTIVE', 'pickup', ids[0], 3]);

    query.mockResolvedValueOnce({ rows: [rows[2]] });
    const second = await listVolunteers({ limit: 2, cursor: first.nextCursor! });
    expect(second.rows).toEqual([rows[2]]);
    expect(second.nextCursor).toBeNull();
    expect(query.mock.calls[1][0]).toContain('(v.created_at, v.id) <');
    expect(query.mock.calls[1][1]).toEqual([rows[1].created_at.toISOString(), ids[1], 3]);
  });

  it('rejects malformed cursors and paginates team summaries', async () => {
    await expect(listVolunteers({ limit: 2, cursor: 'invalid' })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValueOnce({ rows });
    const result = await listTeams({ limit: 2, search: 'Alpha' });
    expect(result.rows).toEqual(rows.slice(0, 2));
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(query.mock.calls[0][0]).toContain('GROUP BY t.id ORDER BY t.created_at DESC, t.id DESC');
    expect(query.mock.calls[0][1]).toEqual(['Alpha', 3]);
  });
});

describe('Volunteer eligibility repository', () => {
  it('uses only volunteer status, availability slots and optional team membership', async () => {
    const startAt = new Date('2026-11-01T10:00:00Z');
    const endAt = new Date('2026-11-01T12:00:00Z');
    query.mockResolvedValue({ rows: [] });
    await listEligibleVolunteerRows(startAt, endAt, ids[0]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql.trimStart().startsWith('SELECT')).toBe(true);
    expect(sql).toContain("v.status = 'ACTIVE'");
    expect(sql).toContain("av.state = 'AVAILABLE'");
    expect(sql).toContain("uv.state = 'UNAVAILABLE'");
    expect(sql).toContain('FROM app.team_members');
    expect(params).toEqual([startAt, endAt, ids[0]]);
    await listEligibleVolunteerRows(startAt, endAt);
    expect(query.mock.calls[1][0]).not.toContain('FROM app.team_members');
    expect(query.mock.calls[1][1]).toEqual([startAt, endAt]);
  });
});

describe('Volunteer own teams repository', () => {
  it('joins canonical person, volunteer, membership and team records by the authenticated app user', async () => {
    const ownTeams = [{ id: ids[2], name: 'Team Alpha', is_leader: true }];
    query.mockResolvedValueOnce({ rows: ownTeams });
    expect(await listOwnTeamsByAppUserId(ids[0])).toEqual(ownTeams);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('app.people p');
    expect(sql).toContain('app.volunteers v');
    expect(sql).toContain('app.team_members tm');
    expect(sql).toContain('app.teams t');
    expect(sql).toContain('t.leader_volunteer_id = v.id');
    expect(sql).toContain('p.app_user_id = $1');
    expect(params).toEqual([ids[0]]);
  });
});

describe('Volunteer admin write repository', () => {
  it('resolves Auth identity only through volunteer → person → app-user and returns role guard fields', async () => {
    const account = { auth_user_id: ids[2], app_user_role: 'VOLUNTEER', disabled_at: null };
    query.mockResolvedValueOnce({ rows: [account] });
    expect(await findVolunteerAuthAccountById(ids[0])).toEqual(account);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM app.volunteers v');
    expect(sql).toContain('JOIN app.people p ON p.id = v.person_id');
    expect(sql).toContain('LEFT JOIN app.app_users au ON au.id = p.app_user_id');
    expect(sql).toContain('au.auth_user_id');
    expect(sql).toContain('au.role AS app_user_role');
    expect(sql).toContain('WHERE v.id = $1');
    expect(params).toEqual([ids[0]]);
  });

  it('checks registration and phone conflicts across canonical people before invitation', async () => {
    query.mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rowCount: 1 });
    expect(await findAdminVolunteerConflict('VOL-002', '+919876543210')).toBe('phoneE164');
    expect(query.mock.calls[0][1]).toEqual(['VOL-002', null]);
    expect(query.mock.calls[1][0]).toContain('FROM app.people p');
    expect(query.mock.calls[1][1]).toEqual(['+919876543210', null]);
  });

  it('inserts only a VOLUNTEER app user, person, and volunteer with parameterized values', async () => {
    const personId = 'f50a3e0e-9f8c-4293-bb2b-fc55e4b3d3d8';
    const client = { query: vi.fn() };
    client.query.mockResolvedValueOnce({ rows: [{ id: ids[0] }] })
      .mockResolvedValueOnce({ rows: [{ id: personId }] })
      .mockResolvedValueOnce({ rows: [{ id: ids[1] }] })
      .mockResolvedValueOnce({ rows: [{ id: ids[1], person_id: personId, name: 'Ada', phone_e164: null, registration_code: 'VOL-002', skills: [], status: 'ACTIVE' }] });
    await insertInvitedVolunteer(ids[2], { email: 'ada@example.test', name: 'Ada', phoneE164: null, registrationCode: 'VOL-002', skills: [], status: 'ACTIVE' }, client as unknown as PoolClient);
    expect(client.query.mock.calls[0][0]).toContain("VALUES ($1, 'VOLUNTEER', $2)");
    expect(client.query.mock.calls[0][1]).toEqual([ids[2], 'Ada']);
    expect(client.query.mock.calls[1][1]).toEqual([ids[0], 'Ada', null]);
    expect(client.query.mock.calls[2][1]).toEqual([personId, 'VOL-002', [], 'ACTIVE']);
    expect(client.query.mock.calls.map(call => call[0]).join(' ')).not.toMatch(/app\\.(assignments|resource_reservations|vehicles|vehicle_locations|food_requests)/);
  });

  it('updates allowed fields and keeps the application display name in sync', async () => {
    const current = { id: ids[0], person_id: ids[1], name: 'Ada', phone_e164: '+919876543210', registration_code: 'VOL-001', skills: [], status: 'ACTIVE' as const };
    const client = { query: vi.fn().mockResolvedValue({ rows: [current] }) };
    await updateAdminVolunteerRows(current, { name: 'Ada Rao', phoneE164: null, status: 'INACTIVE' }, client as unknown as PoolClient);
    expect(client.query.mock.calls[0][1]).toEqual([ids[1], 'Ada Rao', null]);
    expect(client.query.mock.calls[1][0]).toContain('UPDATE app.app_users');
    expect(client.query.mock.calls[2][1]).toEqual([ids[0], 'VOL-001', [], 'INACTIVE']);
  });
});
