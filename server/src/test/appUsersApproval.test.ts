import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, withTransaction } = vi.hoisted(() => ({ query: vi.fn(), withTransaction: vi.fn() }));
vi.mock('../db/pool', () => ({ getPool: () => ({ query }), withTransaction }));

import { findOrCreateAppUser } from '../auth/appUsers';

const appUserId = '76b128ea-58d8-4d81-a031-74018056dcf5';
const authUserId = '076f89a1-77a8-44de-bef3-189291a0f331';
const volunteerId = '7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5';

beforeEach(() => {
  vi.clearAllMocks();
  withTransaction.mockImplementation(async (run: (client: { query: typeof query }) => Promise<unknown>) => run({ query }));
});

describe('Volunteer application in authenticated app-user lookup', () => {
  it('loads the separate application status with its canonical Volunteer profile', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      id: appUserId, auth_user_id: authUserId, role: 'VOLUNTEER', display_name: 'Applicant',
      disabled_at: null, volunteer_profile_id: volunteerId,
    }] }).mockResolvedValueOnce({ rows: [{ status: 'PENDING' }] });

    expect(await findOrCreateAppUser(authUserId)).toEqual({
      id: appUserId, authUserId, role: 'VOLUNTEER', displayName: 'Applicant', volunteerApplicationStatus: 'PENDING',
    });
    expect(query.mock.calls[0][0]).toContain("VALUES ($1, 'DONOR', $2)");
    expect(query.mock.calls[1][0]).toContain('LEFT JOIN app.people p');
    expect(query.mock.calls[1][0]).toContain('LEFT JOIN app.volunteers v');
    expect(query.mock.calls[1][0]).not.toContain('volunteer_applications');
    expect(query.mock.calls[1][1]).toEqual([authUserId]);
    expect(query.mock.calls[2][0]).toContain('FROM app.volunteer_applications');
    expect(query.mock.calls[2][1]).toEqual([volunteerId]);
  });

  it('preserves existing admin-created Volunteers with a profile and no application', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      id: appUserId, auth_user_id: authUserId, role: 'VOLUNTEER', display_name: 'Legacy Volunteer',
      disabled_at: null, volunteer_profile_id: volunteerId,
    }] }).mockResolvedValueOnce({ rows: [] });
    await expect(findOrCreateAppUser(authUserId)).resolves.toMatchObject({
      role: 'VOLUNTEER', volunteerApplicationStatus: null,
    });
  });

  it('fails closed when a Volunteer account has neither a linked profile nor an application', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      id: appUserId, auth_user_id: authUserId, role: 'VOLUNTEER', display_name: null,
      disabled_at: null, volunteer_profile_id: null,
    }] });
    await expect(findOrCreateAppUser(authUserId)).rejects.toMatchObject({ status: 403, code: 'VOLUNTEER_PROFILE_REQUIRED' });
  });

  it('does not attach Volunteer application data to Admin or Donor accounts', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      id: appUserId, auth_user_id: authUserId, role: 'ADMIN', display_name: null,
      disabled_at: null, volunteer_profile_id: null,
    }] });
    const user = await findOrCreateAppUser(authUserId);
    expect(user).not.toHaveProperty('volunteerApplicationStatus');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).not.toContain('volunteer_applications');
  });

  it('fails closed for Volunteers when the application table is missing', async () => {
    const missingTable = Object.assign(new Error('relation "app.volunteer_applications" does not exist'), { code: '42P01' });
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      id: appUserId, auth_user_id: authUserId, role: 'VOLUNTEER', display_name: 'Applicant',
      disabled_at: null, volunteer_profile_id: volunteerId,
    }] }).mockRejectedValueOnce(missingTable);

    await expect(findOrCreateAppUser(authUserId)).rejects.toBe(missingTable);
  });
});

describe('Donor provisioning from a verified Supabase identity', () => {
  it('creates a DONOR app user and one uniquely linked donor profile on first /me', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      id: appUserId, auth_user_id: authUserId, role: 'DONOR', display_name: 'Asha Rao',
      disabled_at: null, volunteer_profile_id: null,
    }] }).mockResolvedValueOnce({ rows: [] });

    await expect(findOrCreateAppUser(authUserId, 'Asha Rao')).resolves.toEqual({
      id: appUserId, authUserId, role: 'DONOR', displayName: 'Asha Rao',
    });
    expect(query.mock.calls[0][0]).toContain("INSERT INTO app.app_users(auth_user_id, role, display_name) VALUES ($1, 'DONOR', $2)");
    expect(query.mock.calls[0][1]).toEqual([authUserId, 'Asha Rao']);
    expect(query.mock.calls[0][0]).toContain("WHERE app.app_users.role = 'DONOR'");
    expect(query.mock.calls[2][0]).toContain('INSERT INTO app.donors(app_user_id)');
    expect(query.mock.calls[2][0]).toContain('ON CONFLICT (app_user_id) DO NOTHING');
    expect(query.mock.calls[2][1]).toEqual([appUserId]);
  });

  it('does not overwrite an existing Donor display name when authenticating again', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      id: appUserId, auth_user_id: authUserId, role: 'DONOR', display_name: 'Saved Name',
      disabled_at: null, volunteer_profile_id: null,
    }] }).mockResolvedValueOnce({ rows: [] });
    await expect(findOrCreateAppUser(authUserId, 'Changed Metadata')).resolves.toMatchObject({
      displayName: 'Saved Name', role: 'DONOR',
    });
    expect(query.mock.calls[0][0]).toContain('COALESCE(app.app_users.display_name, EXCLUDED.display_name)');
  });
});
