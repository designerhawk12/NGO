import type { PoolClient } from 'pg';
import { getPool } from '../../db/pool';
import type { UpdateOwnProfileInput } from './schemas';
import type { CreateAvailabilityRequest } from '@aaharaconnect/shared';
import { uuidSchema } from '@aaharaconnect/shared';
import { HttpError } from '../../middleware/errorHandler';
import type { CreateAdminVolunteerInput, ListTeamsQuery, ListVolunteersQuery, UpdateAdminVolunteerInput } from './schemas';

export type VolunteerProfileRow = {
  id: string;
  person_id: string;
  registration_code: string;
  name: string;
  phone_e164: string | null;
  skills: string[];
  status: 'ACTIVE' | 'INACTIVE';
};

export async function findByAppUserId(appUserId: string, client?: PoolClient, lockPerson = false): Promise<VolunteerProfileRow | null> {
  const db = client ?? getPool();
  const result = await db.query<VolunteerProfileRow>(
    `SELECT v.id, v.person_id, v.registration_code, v.skills, v.status, p.name, p.phone_e164
     FROM app.volunteers v
     JOIN app.people p ON p.id = v.person_id
     WHERE p.app_user_id = $1${lockPerson ? ' FOR UPDATE OF p' : ''}`,
    [appUserId]
  );
  return result.rows[0] ?? null;
}

export async function updatePersonProfile(personId: string, input: UpdateOwnProfileInput, client: PoolClient): Promise<Pick<VolunteerProfileRow, 'name' | 'phone_e164'>> {
  const result = await client.query<Pick<VolunteerProfileRow, 'name' | 'phone_e164'>>(
    `UPDATE app.people
     SET name = COALESCE($2::text, name), phone_e164 = COALESCE($3::text, phone_e164)
     WHERE id = $1
     RETURNING name, phone_e164`,
    [personId, input.name ?? null, input.phoneE164 ?? null]
  );
  return result.rows[0];
}

export type AvailabilityRow = {
  id: string;
  volunteer_id: string;
  starts_at: Date;
  ends_at: Date;
  state: 'AVAILABLE' | 'UNAVAILABLE';
};

const availabilityColumns = 'id, volunteer_id, starts_at, ends_at, state';

export async function listAvailabilityByVolunteerId(volunteerId: string, client?: PoolClient): Promise<AvailabilityRow[]> {
  const db = client ?? getPool();
  const result = await db.query<AvailabilityRow>(
    `SELECT ${availabilityColumns} FROM app.volunteer_availability
     WHERE volunteer_id = $1 ORDER BY starts_at, id`,
    [volunteerId]
  );
  return result.rows;
}

export async function createAvailabilityForAppUser(appUserId: string, input: CreateAvailabilityRequest, client?: PoolClient): Promise<AvailabilityRow | null> {
  const db = client ?? getPool();
  const result = await db.query<AvailabilityRow>(
    `INSERT INTO app.volunteer_availability(volunteer_id, starts_at, ends_at, state)
     SELECT v.id, $2, $3, $4 FROM app.volunteers v
     JOIN app.people p ON p.id = v.person_id WHERE p.app_user_id = $1
     RETURNING ${availabilityColumns}`,
    [appUserId, input.startsAt, input.endsAt, input.state]
  );
  return result.rows[0] ?? null;
}

export async function replaceAvailabilityForAppUser(appUserId: string, availabilityId: string, input: CreateAvailabilityRequest, client?: PoolClient): Promise<AvailabilityRow | null> {
  const db = client ?? getPool();
  const result = await db.query<AvailabilityRow>(
    `UPDATE app.volunteer_availability a
     SET starts_at = $3, ends_at = $4, state = $5
     FROM app.volunteers v JOIN app.people p ON p.id = v.person_id
     WHERE a.id = $1 AND a.volunteer_id = v.id AND p.app_user_id = $2
     RETURNING a.id, a.volunteer_id, a.starts_at, a.ends_at, a.state`,
    [availabilityId, appUserId, input.startsAt, input.endsAt, input.state]
  );
  return result.rows[0] ?? null;
}

export type VolunteerWindowRow = {
  id: string;
  person_id: string;
  status: 'ACTIVE' | 'INACTIVE';
  is_available: boolean;
};

// Read-only eligibility matches the current Pickup port: a covering AVAILABLE
// slot and no overlapping UNAVAILABLE slot. This never creates a reservation.
export async function findWindowAvailability(volunteerId: string, startsAt: Date, endsAt: Date, client?: PoolClient): Promise<VolunteerWindowRow | null> {
  const db = client ?? getPool();
  const result = await db.query<VolunteerWindowRow>(
    `SELECT v.id, v.person_id, v.status,
       EXISTS (
         SELECT 1 FROM app.volunteer_availability av
         WHERE av.volunteer_id = v.id AND av.state = 'AVAILABLE'
           AND av.starts_at <= $2 AND av.ends_at >= $3
       ) AND NOT EXISTS (
         SELECT 1 FROM app.volunteer_availability uv
         WHERE uv.volunteer_id = v.id AND uv.state = 'UNAVAILABLE'
           AND tstzrange(uv.starts_at, uv.ends_at, '[)') && tstzrange($2, $3, '[)')
       ) AS is_available
     FROM app.volunteers v WHERE v.id = $1`,
    [volunteerId, startsAt, endsAt]
  );
  return result.rows[0] ?? null;
}

export type VolunteerIdentityRow = Pick<VolunteerWindowRow, 'id' | 'person_id' | 'status'>;

export async function findVolunteerIdentityById(volunteerId: string, client?: PoolClient): Promise<VolunteerIdentityRow | null> {
  const db = client ?? getPool();
  const result = await db.query<VolunteerIdentityRow>(
    'SELECT id, person_id, status FROM app.volunteers WHERE id = $1', [volunteerId]
  );
  return result.rows[0] ?? null;
}

export async function listEligibleVolunteerRows(
  startsAt: Date, endsAt: Date, teamId?: string, client?: PoolClient
): Promise<VolunteerIdentityRow[]> {
  const db = client ?? getPool();
  const params: unknown[] = [startsAt, endsAt];
  const teamFilter = teamId
    ? 'AND EXISTS (SELECT 1 FROM app.team_members tm WHERE tm.volunteer_id = v.id AND tm.team_id = $3)'
    : '';
  if (teamId) params.push(teamId);
  const result = await db.query<VolunteerIdentityRow>(
    `SELECT v.id, v.person_id, v.status FROM app.volunteers v
     WHERE v.status = 'ACTIVE'
       AND EXISTS (
         SELECT 1 FROM app.volunteer_availability av
         WHERE av.volunteer_id = v.id AND av.state = 'AVAILABLE'
           AND av.starts_at <= $1 AND av.ends_at >= $2
       )
       AND NOT EXISTS (
         SELECT 1 FROM app.volunteer_availability uv
         WHERE uv.volunteer_id = v.id AND uv.state = 'UNAVAILABLE'
           AND tstzrange(uv.starts_at, uv.ends_at, '[)') && tstzrange($1, $2, '[)')
       )
       ${teamFilter}
     ORDER BY v.id`,
    params
  );
  return result.rows;
}

type PageRow = { id: string; created_at: Date };

function encodeCursor(row: PageRow): string {
  return Buffer.from(`${row.created_at.toISOString()}|${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  try {
    const [iso, id, extra] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const date = new Date(iso);
    if (extra !== undefined || !Number.isFinite(date.getTime()) || date.toISOString() !== iso || !uuidSchema.safeParse(id).success) {
      throw new Error('Invalid cursor');
    }
    return { createdAt: iso, id };
  } catch {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid pagination cursor.');
  }
}

export type AdminVolunteerRow = VolunteerProfileRow & PageRow;
const volunteerSelect = 'v.id, v.person_id, v.registration_code, v.skills, v.status, v.created_at, p.name, p.phone_e164';

export async function listVolunteers(query: ListVolunteersQuery): Promise<{ rows: AdminVolunteerRow[]; nextCursor: string | null }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (query.search) {
    params.push(query.search);
    conditions.push(`(strpos(lower(p.name), lower($${params.length})) > 0 OR strpos(lower(coalesce(p.phone_e164, '')), lower($${params.length})) > 0 OR strpos(lower(v.registration_code), lower($${params.length})) > 0)`);
  }
  if (query.status) {
    params.push(query.status);
    conditions.push(`v.status = $${params.length}`);
  }
  if (query.skill) {
    params.push(query.skill);
    conditions.push(`$${params.length} = ANY(v.skills)`);
  }
  if (query.teamId) {
    if (query.teamId === 'none') {
      conditions.push('NOT EXISTS (SELECT 1 FROM app.team_members tm WHERE tm.volunteer_id = v.id)');
    } else {
      params.push(query.teamId);
      conditions.push(`EXISTS (SELECT 1 FROM app.team_members tm WHERE tm.volunteer_id = v.id AND tm.team_id = $${params.length})`);
    }
  }
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    params.push(cursor.createdAt, cursor.id);
    conditions.push(`(v.created_at, v.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
  }
  params.push(query.limit + 1);
  const result = await getPool().query<AdminVolunteerRow>(
    `SELECT ${volunteerSelect} FROM app.volunteers v JOIN app.people p ON p.id = v.person_id
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY v.created_at DESC, v.id DESC LIMIT $${params.length}`,
    params
  );
  const rows = result.rows.slice(0, query.limit);
  return { rows, nextCursor: result.rows.length > query.limit ? encodeCursor(rows[rows.length - 1]) : null };
}

export async function findVolunteerById(id: string, client?: PoolClient): Promise<VolunteerProfileRow | null> {
  const result = await (client ?? getPool()).query<VolunteerProfileRow>(
    `SELECT ${volunteerSelect} FROM app.volunteers v JOIN app.people p ON p.id = v.person_id WHERE v.id = $1`, [id]
  );
  return result.rows[0] ?? null;
}

export type VolunteerAuthAccountRow = {
  auth_user_id: string | null;
  app_user_role: 'ADMIN' | 'VOLUNTEER' | 'DONOR' | null;
  disabled_at: Date | null;
};

export async function findVolunteerAuthAccountById(id: string): Promise<VolunteerAuthAccountRow | null> {
  const result = await getPool().query<VolunteerAuthAccountRow>(
    `SELECT au.auth_user_id, au.role AS app_user_role, au.disabled_at
     FROM app.volunteers v
     JOIN app.people p ON p.id = v.person_id
     LEFT JOIN app.app_users au ON au.id = p.app_user_id
     WHERE v.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findAdminVolunteerConflict(
  registrationCode: string, phoneE164: string | null, excludeVolunteerId?: string
): Promise<'registrationCode' | 'phoneE164' | null> {
  const code = await getPool().query(
    'SELECT 1 FROM app.volunteers WHERE registration_code = $1 AND ($2::uuid IS NULL OR id <> $2) LIMIT 1',
    [registrationCode, excludeVolunteerId ?? null]
  );
  if (code.rowCount) return 'registrationCode';
  if (phoneE164) {
    const phone = await getPool().query(
      `SELECT 1 FROM app.people p WHERE p.phone_e164 = $1
       AND ($2::uuid IS NULL OR p.id <> (SELECT person_id FROM app.volunteers WHERE id = $2)) LIMIT 1`,
      [phoneE164, excludeVolunteerId ?? null]
    );
    if (phone.rowCount) return 'phoneE164';
  }
  return null;
}

export async function insertInvitedVolunteer(
  authUserId: string, input: CreateAdminVolunteerInput, client: PoolClient
): Promise<VolunteerProfileRow> {
  const appUser = await client.query<{ id: string }>(
    `INSERT INTO app.app_users(auth_user_id, role, display_name)
     VALUES ($1, 'VOLUNTEER', $2) RETURNING id`, [authUserId, input.name]
  );
  const person = await client.query<{ id: string }>(
    'INSERT INTO app.people(app_user_id, name, phone_e164) VALUES ($1, $2, $3) RETURNING id',
    [appUser.rows[0].id, input.name, input.phoneE164]
  );
  const volunteer = await client.query<{ id: string }>(
    `INSERT INTO app.volunteers(person_id, registration_code, skills, status)
     VALUES ($1, $2, $3::text[], $4) RETURNING id`,
    [person.rows[0].id, input.registrationCode, input.skills, input.status]
  );
  const row = await findVolunteerById(volunteer.rows[0].id, client);
  if (!row) throw new HttpError(500, 'INTERNAL_ERROR', 'Created volunteer could not be read.');
  return row;
}

export async function findVolunteerForAdminUpdate(id: string, client: PoolClient): Promise<VolunteerProfileRow | null> {
  const result = await client.query<VolunteerProfileRow>(
    `SELECT v.id, v.person_id, v.registration_code, v.skills, v.status, p.name, p.phone_e164
     FROM app.volunteers v JOIN app.people p ON p.id = v.person_id
     WHERE v.id = $1 FOR UPDATE OF v, p`, [id]
  );
  return result.rows[0] ?? null;
}

export async function updateAdminVolunteerRows(
  current: VolunteerProfileRow, input: UpdateAdminVolunteerInput, client: PoolClient
): Promise<VolunteerProfileRow> {
  await client.query(
    'UPDATE app.people SET name = $2, phone_e164 = $3 WHERE id = $1',
    [current.person_id, input.name ?? current.name, input.phoneE164 === undefined ? current.phone_e164 : input.phoneE164]
  );
  if (input.name !== undefined) {
    await client.query(
      `UPDATE app.app_users u SET display_name = $2, updated_at = now()
       FROM app.people p WHERE p.app_user_id = u.id AND p.id = $1`,
      [current.person_id, input.name]
    );
  }
  await client.query(
    `UPDATE app.volunteers SET registration_code = $2, skills = $3::text[], status = $4 WHERE id = $1`,
    [current.id, input.registrationCode ?? current.registration_code, input.skills ?? current.skills, input.status ?? current.status]
  );
  const row = await findVolunteerById(current.id, client);
  if (!row) throw new HttpError(500, 'INTERNAL_ERROR', 'Updated volunteer could not be read.');
  return row;
}

export type TeamRow = PageRow & {
  name: string;
  leader_volunteer_id: string | null;
  member_ids: string[];
};

export type OwnTeamRow = { id: string; name: string; is_leader: boolean };

export async function listOwnTeamsByAppUserId(appUserId: string): Promise<OwnTeamRow[]> {
  const result = await getPool().query<OwnTeamRow>(
    `SELECT t.id, t.name, (t.leader_volunteer_id = v.id) AS is_leader
     FROM app.people p
     JOIN app.volunteers v ON v.person_id = p.id
     JOIN app.team_members tm ON tm.volunteer_id = v.id
     JOIN app.teams t ON t.id = tm.team_id
     WHERE p.app_user_id = $1
     ORDER BY t.name, t.id`,
    [appUserId]
  );
  return result.rows;
}

const teamSelect = `SELECT t.id, t.name, t.leader_volunteer_id, t.created_at,
  COALESCE(array_agg(tm.volunteer_id ORDER BY tm.joined_at, tm.volunteer_id)
    FILTER (WHERE tm.volunteer_id IS NOT NULL), ARRAY[]::uuid[]) AS member_ids
  FROM app.teams t LEFT JOIN app.team_members tm ON tm.team_id = t.id`;

export async function listTeams(query: ListTeamsQuery): Promise<{ rows: TeamRow[]; nextCursor: string | null }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (query.search) {
    params.push(query.search);
    conditions.push(`strpos(lower(t.name), lower($${params.length})) > 0`);
  }
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    params.push(cursor.createdAt, cursor.id);
    conditions.push(`(t.created_at, t.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
  }
  params.push(query.limit + 1);
  const result = await getPool().query<TeamRow>(
    `${teamSelect} ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     GROUP BY t.id ORDER BY t.created_at DESC, t.id DESC LIMIT $${params.length}`,
    params
  );
  const rows = result.rows.slice(0, query.limit);
  return { rows, nextCursor: result.rows.length > query.limit ? encodeCursor(rows[rows.length - 1]) : null };
}

export async function findTeamById(id: string, client?: PoolClient): Promise<TeamRow | null> {
  const db = client ?? getPool();
  const result = await db.query<TeamRow>(`${teamSelect} WHERE t.id = $1 GROUP BY t.id`, [id]);
  return result.rows[0] ?? null;
}

export async function findTeamForUpdate(id: string, client: PoolClient): Promise<Pick<TeamRow, 'id' | 'name' | 'leader_volunteer_id'> | null> {
  const result = await client.query<Pick<TeamRow, 'id' | 'name' | 'leader_volunteer_id'>>(
    'SELECT id, name, leader_volunteer_id FROM app.teams WHERE id = $1 FOR UPDATE', [id]
  );
  return result.rows[0] ?? null;
}

export async function findExistingVolunteerIds(ids: string[], client: PoolClient): Promise<string[]> {
  if (!ids.length) return [];
  const result = await client.query<{ id: string }>('SELECT id FROM app.volunteers WHERE id = ANY($1::uuid[])', [ids]);
  return result.rows.map(row => row.id);
}

export async function insertTeam(name: string, leaderVolunteerId: string | null, client: PoolClient): Promise<string> {
  const result = await client.query<{ id: string }>(
    'INSERT INTO app.teams(name, leader_volunteer_id) VALUES ($1, $2) RETURNING id', [name, leaderVolunteerId]
  );
  return result.rows[0].id;
}

export async function updateTeam(id: string, name: string, leaderVolunteerId: string | null, client: PoolClient): Promise<void> {
  await client.query('UPDATE app.teams SET name = $2, leader_volunteer_id = $3 WHERE id = $1', [id, name, leaderVolunteerId]);
}

export async function replaceTeamMembers(teamId: string, memberIds: string[], client: PoolClient): Promise<void> {
  await client.query('DELETE FROM app.team_members WHERE team_id = $1', [teamId]);
  if (memberIds.length) {
    await client.query(
      'INSERT INTO app.team_members(team_id, volunteer_id) SELECT $1, members.member_id FROM unnest($2::uuid[]) AS members(member_id)',
      [teamId, memberIds]
    );
  }
}
