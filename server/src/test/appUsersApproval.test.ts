import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, withTransaction } = vi.hoisted(() => ({ query: vi.fn(), withTransaction: vi.fn() }));
vi.mock('../db/pool', () => ({ getPool: () => ({ query }), withTransaction }));

import { findOrCreateAppUser } from '../auth/appUsers';

const appUserId = '76b128ea-58d8-4d81-a031-74018056dcf5';
const authUserId = '076f89a1-77a8-44de-bef3-189291a0f331';
const volunteerId = '7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5';

beforeEach(() => vi.clearAllMocks());

describe('Volunteer application in authenticated app-user lookup', () => {
  it('loads the separate application status with its canonical Volunteer profile', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      id: appUserId, auth_user_id: authUserId, role: 'VOLUNTEER', display_name: 'Applicant',
      disabled_at: null, volunteer_application_status: 'PENDING', volunteer_profile_id: volunteerId,
    }] });

    expect(await findOrCreateAppUser(authUserId)).toEqual({
      id: appUserId, authUserId, role: 'VOLUNTEER', displayName: 'Applicant', volunteerApplicationStatus: 'PENDING',
    });
    expect(query.mock.calls[0][0]).toContain("VALUES ($1, 'DONOR')");
    expect(query.mock.calls[1][0]).toContain('LEFT JOIN app.people p');
    expect(query.mock.calls[1][0]).toContain('LEFT JOIN app.volunteers v');
    expect(query.mock.calls[1][0]).toContain('LEFT JOIN app.volunteer_applications va ON va.volunteer_id = v.id');
    expect(query.mock.calls[1][0]).toContain('va.status AS volunteer_application_status');
    expect(query.mock.calls[1][1]).toEqual([authUserId]);
  });

  it('preserves existing admin-created Volunteers with a profile and no application', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      id: appUserId, auth_user_id: authUserId, role: 'VOLUNTEER', display_name: 'Legacy Volunteer',
      disabled_at: null, volunteer_application_status: null, volunteer_profile_id: volunteerId,
    }] });
    await expect(findOrCreateAppUser(authUserId)).resolves.toMatchObject({
      role: 'VOLUNTEER', volunteerApplicationStatus: null,
    });
  });

  it('fails closed when a Volunteer account has neither a linked profile nor an application', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      id: appUserId, auth_user_id: authUserId, role: 'VOLUNTEER', display_name: null,
      disabled_at: null, volunteer_application_status: null, volunteer_profile_id: null,
    }] });
    await expect(findOrCreateAppUser(authUserId)).rejects.toMatchObject({ status: 403, code: 'VOLUNTEER_PROFILE_REQUIRED' });
  });

  it('does not attach Volunteer application data to Admin or Donor accounts', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
      id: appUserId, auth_user_id: authUserId, role: 'ADMIN', display_name: null,
      disabled_at: null, volunteer_application_status: null, volunteer_profile_id: null,
    }] });
    const user = await findOrCreateAppUser(authUserId);
    expect(user).not.toHaveProperty('volunteerApplicationStatus');
  });
});
