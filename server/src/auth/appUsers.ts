import type { AppUser, AppRole, VolunteerApplicationStatus } from '@aaharaconnect/shared';
import { getPool, withTransaction } from '../db/pool';
import { HttpError } from '../middleware/errorHandler';

type AppUserRow = {
  id: string;
  auth_user_id: string;
  role: AppRole;
  display_name: string | null;
  volunteer_application_status?: VolunteerApplicationStatus | null;
  volunteer_profile_id?: string | null;
};
function toContract(row: AppUserRow): AppUser {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    role: row.role,
    displayName: row.display_name,
    ...(row.role === 'VOLUNTEER'
      ? { volunteerApplicationStatus: row.volunteer_application_status ?? null }
      : {}),
  };
}

export async function findOrCreateAppUser(authUserId: string, displayName?: string): Promise<AppUser> {
  return withTransaction(async client => {
    await client.query(`
      INSERT INTO app.app_users(auth_user_id, role, display_name) VALUES ($1, 'DONOR', $2)
      ON CONFLICT (auth_user_id) DO UPDATE
        SET display_name = COALESCE(app.app_users.display_name, EXCLUDED.display_name)
        WHERE app.app_users.role = 'DONOR'`, [authUserId, displayName ?? null]);
    const result = await client.query<AppUserRow & { disabled_at: Date | null }>(
      `SELECT au.id, au.auth_user_id, au.role, au.display_name, au.disabled_at,
         v.id AS volunteer_profile_id
       FROM app.app_users au
       LEFT JOIN app.people p ON p.app_user_id = au.id
       LEFT JOIN app.volunteers v ON v.person_id = p.id
       WHERE au.auth_user_id = $1`,
      [authUserId]
    );
    const row = result.rows[0];
    if (!row) throw new HttpError(500, 'INTERNAL_ERROR', 'Application account could not be loaded.');
    if (row.disabled_at) throw new HttpError(403, 'FORBIDDEN', 'This account is disabled.');
    if (row.role === 'DONOR') {
      // Donor profiles are keyed uniquely by app_user_id. Create the canonical
      // profile on the first verified /me request; repeated requests are safe.
      await client.query(
        'INSERT INTO app.donors(app_user_id) VALUES ($1) ON CONFLICT (app_user_id) DO NOTHING',
        [row.id]
      );
    }
    if (row.role === 'VOLUNTEER' && row.volunteer_profile_id) {
      const application = await client.query<{ status: VolunteerApplicationStatus }>(
        'SELECT status FROM app.volunteer_applications WHERE volunteer_id = $1',
        [row.volunteer_profile_id]
      );
      row.volunteer_application_status = application.rows[0]?.status ?? null;
    }
    if (row.role === 'VOLUNTEER' && !row.volunteer_profile_id && !row.volunteer_application_status) {
      throw new HttpError(403, 'VOLUNTEER_PROFILE_REQUIRED', 'A Volunteer profile or application is required.');
    }
    return toContract(row);
  });
}

export async function setAppUserRole(id: string, role: AppRole, actorUserId: string): Promise<AppUser> {
  return withTransaction(async client => {
    const actor = await client.query<{ role: AppRole; disabled_at: Date | null }>('SELECT role, disabled_at FROM app.app_users WHERE id = $1', [actorUserId]);
    if (actor.rows[0]?.role !== 'ADMIN' || actor.rows[0].disabled_at) throw new HttpError(403, 'FORBIDDEN', 'Administrator access is required.');
    const current = await client.query<AppUserRow>(
      `SELECT au.id, au.auth_user_id, au.role, au.display_name,
         va.status AS volunteer_application_status,
         v.id AS volunteer_profile_id
       FROM app.app_users au
       LEFT JOIN app.people p ON p.app_user_id = au.id
       LEFT JOIN app.volunteers v ON v.person_id = p.id
       LEFT JOIN app.volunteer_applications va ON va.volunteer_id = v.id
       WHERE au.id = $1 FOR UPDATE OF au`,
      [id]
    );
    const user = current.rows[0];
    if (!user) throw new HttpError(404, 'NOT_FOUND', 'Application user not found.');
    // DRIVER sign-ins belong to NGO employee driver records and are managed only from Assign Driver.
    if (role === 'DRIVER' || user.role === 'DRIVER') {
      throw new HttpError(409, 'DRIVER_ROLE_MANAGED_BY_ASSIGN_DRIVER', 'Driver sign-ins are created and managed only from Assign Driver.');
    }
    if (id === actorUserId && role !== 'ADMIN') throw new HttpError(409, 'RESOURCE_CONFLICT', 'An administrator cannot remove their own administrator access.');
    if (role === 'VOLUNTEER' && !user.volunteer_profile_id) {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'A Volunteer profile is required before assigning the Volunteer role.');
    }
    if (user.role === role) return toContract(user);
    const updated = await client.query<AppUserRow>('UPDATE app.app_users SET role = $2, updated_at = now() WHERE id = $1 RETURNING id, auth_user_id, role, display_name', [id, role]);
    await client.query('INSERT INTO app.user_role_events(app_user_id, actor_user_id, from_role, to_role) VALUES ($1, $2, $3, $4)', [id, actorUserId, user.role, role]);
    return toContract({ ...updated.rows[0], volunteer_application_status: user.volunteer_application_status, volunteer_profile_id: user.volunteer_profile_id });
  });
}
