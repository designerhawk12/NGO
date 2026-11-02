import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient, resetPasswordForEmail } = vi.hoisted(() => ({
  createClient: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient }))

import { createRecoveryAuth, recoveryCallback, recoveryRedirect, requestPasswordRecovery, type RecoveryAuth } from './recovery'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key')
  resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
  createClient.mockReturnValue({ auth: { resetPasswordForEmail } })
})

describe('public password recovery request', () => {
  it('uses a separate nonpersistent Auth client with the publishable key', () => {
    expect(createRecoveryAuth()).not.toBeNull()
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'test-publishable-key', {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
        flowType: 'implicit',
        storageKey: 'aaharaconnect-password-recovery',
      },
    })
    createRecoveryAuth(true)
    expect(createClient).toHaveBeenLastCalledWith('https://example.supabase.co', 'test-publishable-key', {
      auth: expect.objectContaining({ detectSessionInUrl: true, persistSession: false, flowType: 'implicit' }),
    })
  })

  it('fails safely when the public Auth client cannot initialize', () => {
    createClient.mockImplementationOnce(() => { throw new Error('provider configuration detail') })
    expect(createRecoveryAuth()).toBeNull()
  })

  it('sends a valid request to the exact local recovery callback', async () => {
    const auth = createRecoveryAuth() as RecoveryAuth
    expect(await requestPasswordRecovery(auth, '  Volunteer@Example.org  ', 'https://ngo.example.org')).toBe('accepted')
    expect(resetPasswordForEmail).toHaveBeenCalledWith('volunteer@example.org', {
      redirectTo: 'https://ngo.example.org/reset-password',
    })
  })

  it('rejects malformed email before contacting Auth', async () => {
    expect(await requestPasswordRecovery(createRecoveryAuth() as RecoveryAuth, 'not-an-email', 'https://ngo.example.org')).toBe('invalid-email')
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('gives an unknown account the same public result without claiming delivery', async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { code: 'user_not_found' } })
    expect(await requestPasswordRecovery(createRecoveryAuth() as RecoveryAuth, 'unknown@example.org', 'https://ngo.example.org')).toBe('accepted')
  })

  it('reports rate limits, delivery errors, and thrown provider failures generically', async () => {
    for (const error of [{ status: 429, code: 'over_email_send_rate_limit' }, { status: 503, code: 'smtp_failed' }]) {
      resetPasswordForEmail.mockResolvedValueOnce({ data: null, error })
      expect(await requestPasswordRecovery(createRecoveryAuth() as RecoveryAuth, 'user@example.org', 'https://ngo.example.org')).toBe('unavailable')
    }
    resetPasswordForEmail.mockRejectedValueOnce(new Error('provider detail'))
    expect(await requestPasswordRecovery(createRecoveryAuth() as RecoveryAuth, 'user@example.org', 'https://ngo.example.org')).toBe('unavailable')
  })

  it('does not accept an untrusted redirect target', async () => {
    for (const origin of ['http://ngo.example.org', 'https://ngo.example.org/path', 'https://ngo.example.org?next=https://evil.invalid']) {
      expect(recoveryRedirect(origin)).toBeNull()
    }
    expect(await requestPasswordRecovery(createRecoveryAuth() as RecoveryAuth, 'user@example.org', 'https://ngo.example.org/path')).toBe('unavailable')
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })
})

describe('recovery callback purpose validation', () => {
  it('accepts a recovery OTP hash and an implicit recovery session', () => {
    expect(recoveryCallback({ search: '?token_hash=opaque&type=recovery', hash: '' })).toEqual({ kind: 'otp', tokenHash: 'opaque' })
    expect(recoveryCallback({ search: '', hash: '#access_token=opaque&refresh_token=opaque2&type=recovery' })).toEqual({ kind: 'implicit' })
  })

  it('rejects missing, expired/error, invite, and PKCE callbacks', () => {
    for (const location of [
      { search: '', hash: '' },
      { search: '?error_code=otp_expired&type=recovery', hash: '' },
      { search: '?token_hash=opaque&type=invite', hash: '' },
      { search: '?code=opaque&type=recovery', hash: '' },
      { search: '?type=recovery', hash: '#access_token=opaque&refresh_token=opaque2&type=invite' },
      { search: '?type=recovery', hash: '#access_token=opaque&refresh_token=opaque2' },
      { search: '', hash: '#access_token=opaque&type=recovery' },
      { search: '?email=user@example.org', hash: '' },
    ]) expect(recoveryCallback(location)).toEqual({ kind: 'invalid' })
  })
})
