import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserById, updateUserById, inviteUserByEmail } = vi.hoisted(() => ({
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
  inviteUserByEmail: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(),
      admin: { getUserById, updateUserById, inviteUserByEmail },
    },
  }),
}));
vi.mock('../config/env', () => ({
  env: {
    supabaseUrl: 'https://example.supabase.co',
    supabasePublishableKey: 'test-publishable-key',
    supabaseSecretKey: 'test-server-secret-key',
  },
}));

import { setVolunteerPassword } from '../auth/supabase';

beforeEach(() => {
  vi.clearAllMocks();
  getUserById.mockResolvedValue({
    data: { user: { id: 'auth-volunteer-id', email_confirmed_at: '2026-10-01T00:00:00Z' } },
    error: null,
  });
  updateUserById.mockResolvedValue({ data: { user: { id: 'auth-volunteer-id' } }, error: null });
});

describe('Admin-set Volunteer password via Supabase Auth', () => {
  it('verifies the linked Auth account and updates only its password without sending email', async () => {
    await expect(setVolunteerPassword('auth-volunteer-id', 'new-safe-passphrase')).resolves.toBeUndefined();
    expect(getUserById).toHaveBeenCalledWith('auth-volunteer-id');
    expect(updateUserById).toHaveBeenCalledWith('auth-volunteer-id', { password: 'new-safe-passphrase' });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('does not confirm an unconfirmed account or change its password', async () => {
    getUserById.mockResolvedValueOnce({
      data: { user: { id: 'auth-volunteer-id', email_confirmed_at: null } },
      error: null,
    });
    await expect(setVolunteerPassword('auth-volunteer-id', 'new-safe-passphrase'))
      .rejects.toMatchObject({ status: 409, code: 'VOLUNTEER_EMAIL_UNCONFIRMED' });
    expect(updateUserById).not.toHaveBeenCalled();
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('fails closed if the linked Auth identity cannot be verified', async () => {
    getUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: 'provider detail' } });
    await expect(setVolunteerPassword('auth-volunteer-id', 'new-safe-passphrase'))
      .rejects.toMatchObject({ status: 503, code: 'PASSWORD_UPDATE_FAILED' });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('maps provider update failures to a safe error', async () => {
    updateUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: 'provider detail' } });
    await expect(setVolunteerPassword('auth-volunteer-id', 'new-safe-passphrase'))
      .rejects.toMatchObject({ status: 503, code: 'PASSWORD_UPDATE_FAILED' });
  });

  it('maps thrown provider network failures to a safe error', async () => {
    getUserById.mockRejectedValueOnce(new Error('network detail'));
    await expect(setVolunteerPassword('auth-volunteer-id', 'new-safe-passphrase'))
      .rejects.toMatchObject({ status: 503, code: 'PASSWORD_UPDATE_FAILED' });
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
