import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient, invite, getUserById, deleteUser, testEnv } = vi.hoisted(() => ({
  createClient: vi.fn(), invite: vi.fn(), getUserById: vi.fn(), deleteUser: vi.fn(),
  testEnv: {
    supabaseUrl: 'https://example.supabase.co',
    supabasePublishableKey: 'test-publishable-key',
    supabaseSecretKey: 'test-server-only-secret',
    volunteerInviteRedirectUrl: 'https://example.org/accept-invite',
  },
}))
vi.mock('@supabase/supabase-js', () => ({ createClient }))
vi.mock('../config/env', () => ({ env: testEnv }))

import { getSupabaseUserEmail, inviteSupabaseUserByEmail } from '../auth/supabase'

beforeEach(() => {
  vi.resetAllMocks()
  testEnv.supabaseSecretKey = 'test-server-only-secret'
  testEnv.volunteerInviteRedirectUrl = 'https://example.org/accept-invite'
  createClient.mockReturnValue({ auth: { admin: { inviteUserByEmail: invite, getUserById, deleteUser } } })
  invite.mockImplementation(async (_email: string, options: { data: Record<string, unknown> }) => ({
    data: { user: { id: 'a0458efe-a4be-43da-a4ed-c290ac3b48cd', created_at: new Date().toISOString(), user_metadata: options.data } },
    error: null,
  }))
  getUserById.mockResolvedValue({ data: { user: null }, error: null })
  deleteUser.mockResolvedValue({ error: null })
})

describe('server-only Supabase volunteer invitations', () => {
  it('uses the privileged client lazily, normalizes email and marks this request', async () => {
    const result = await inviteSupabaseUserByEmail('  NEW@Example.com ', 'New Volunteer')
    expect(result.authUserId).toBe('a0458efe-a4be-43da-a4ed-c290ac3b48cd')
    expect(result.inviteNonce).toBeTruthy()
    expect(createClient).toHaveBeenCalledWith(testEnv.supabaseUrl, testEnv.supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
    expect(invite).toHaveBeenCalledWith('new@example.com', {
      data: { name: 'New Volunteer', aaharaconnectInviteNonce: result.inviteNonce },
      redirectTo: 'https://example.org/accept-invite',
    })
  })

  it('does not require the optional redirect and never sends a password to the provider', async () => {
    testEnv.volunteerInviteRedirectUrl = undefined as unknown as string
    await inviteSupabaseUserByEmail('new@example.com', 'New Volunteer')
    const options = invite.mock.calls[0]?.[1]
    expect(options).not.toHaveProperty('redirectTo')
    expect(options).not.toHaveProperty('password')
  })

  it('fails only the invitation operation when the secret is absent', async () => {
    testEnv.supabaseSecretKey = undefined as unknown as string
    await expect(inviteSupabaseUserByEmail('new@example.com', 'New')).rejects.toMatchObject({
      status: 503, code: 'INVITE_CONFIGURATION_ERROR',
    })
    expect(invite).not.toHaveBeenCalled()
  })

  it('never treats a successful re-invite of an existing unconfirmed user as a new account', async () => {
    invite.mockResolvedValueOnce({ data: { user: { id: 'existing', user_metadata: {} } }, error: null })
    await expect(inviteSupabaseUserByEmail('old@example.com', 'Old')).rejects.toMatchObject({
      status: 409, code: 'VOLUNTEER_ALREADY_EXISTS',
    })
  })

  it('maps duplicate-email and other provider failures to controlled responses', async () => {
    invite.mockResolvedValueOnce({ data: { user: null }, error: { code: 'email_exists', message: 'existing', status: 422 } })
      .mockResolvedValueOnce({ data: { user: null }, error: { code: 'other', message: 'provider internals', status: 500 } })
      .mockRejectedValueOnce(new Error('network internals'))
    await expect(inviteSupabaseUserByEmail('old@example.com', 'Old')).rejects.toMatchObject({ status: 409, code: 'VOLUNTEER_ALREADY_EXISTS' })
    await expect(inviteSupabaseUserByEmail('new@example.com', 'New')).rejects.toMatchObject({ status: 503, code: 'INVITE_SERVICE_UNAVAILABLE' })
    await expect(inviteSupabaseUserByEmail('new@example.com', 'New')).rejects.toMatchObject({ status: 503, code: 'INVITE_SERVICE_UNAVAILABLE' })
  })

  it('classifies provider rate limits and never deletes an Auth user', async () => {
    invite.mockResolvedValueOnce({ data: { user: null }, error: { status: 429, code: 'over_email_send_rate_limit', message: 'rate limit' } })
    await expect(inviteSupabaseUserByEmail('new@example.com', 'New')).rejects.toMatchObject({ status: 429, code: 'INVITE_RATE_LIMITED' })
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('distinguishes default email sender recipient restrictions', async () => {
    invite.mockResolvedValueOnce({ data: { user: null }, error: { status: 422, code: 'email_address_not_authorized', message: 'provider details' } })
    await expect(inviteSupabaseUserByEmail('new@example.com', 'New')).rejects.toMatchObject({ status: 422, code: 'INVITE_EMAIL_NOT_AUTHORIZED' })
    expect(deleteUser).not.toHaveBeenCalled()
  })
})

describe('Admin-only Volunteer application email lookup', () => {
  it('reads the submitted address through Supabase Admin API without returning Auth metadata', async () => {
    getUserById.mockResolvedValueOnce({ data: { user: { id: 'auth-user-id', email: 'applicant@example.test' } }, error: null })
    await expect(getSupabaseUserEmail('auth-user-id')).resolves.toBe('applicant@example.test')
    expect(getUserById).toHaveBeenCalledWith('auth-user-id')
  })

  it('returns a safe service error if the linked Auth email cannot be read', async () => {
    getUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 404 } })
    await expect(getSupabaseUserEmail('missing-auth-user')).rejects.toMatchObject({
      status: 503, code: 'AUTH_USER_LOOKUP_FAILED', message: 'Applicant email could not be loaded.',
    })
  })
})
