import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSession, refreshSession, signInWithPassword, signOut, createClient, getCurrentAppUser } = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  createClient: vi.fn(),
  getCurrentAppUser: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient }))
vi.mock('./client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message)
    }
  },
  apiRequest: getCurrentAppUser,
}))

describe('pickup API authentication', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key')
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000/api/v1')
    createClient.mockReturnValue({
      auth: { getSession, refreshSession, signInWithPassword, signOut },
    })
  })

  it('uses the Settings Supabase session as the protected API bearer token', async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: 'session-token', expires_at: Math.floor(Date.now() / 1000) + 3600 } },
      error: null,
    })
    getCurrentAppUser.mockResolvedValue({ id: 'admin-id', role: 'ADMIN' })

    const { getAuthHeaders } = await import('./auth')

    await expect(getAuthHeaders()).resolves.toEqual({ Authorization: 'Bearer session-token' })
    expect(getCurrentAppUser).toHaveBeenCalledWith('me', {
      headers: { Authorization: 'Bearer session-token' },
    })
  })

  it('rejects before any pickup request when Settings has no Supabase session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { getAuthHeaders } = await import('./auth')

    await expect(getAuthHeaders()).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Administrator sign-in is required to access live records. Please sign in under Settings.',
    })
    expect(getCurrentAppUser).not.toHaveBeenCalled()
  })

  it.each(['DONOR', 'VOLUNTEER'])('does not grant website Admin access to a valid %s login', async role => {
    signInWithPassword.mockResolvedValue({data:{session:{access_token:'verified-session'}},error:null})
    getCurrentAppUser.mockResolvedValue({id:'existing-user',role})
    signOut.mockResolvedValue({error:null})
    const { signInAsAdmin } = await import('./auth')
    await expect(signInAsAdmin('synthetic@example.test','test-only')).rejects.toThrow('Administrator access is required.')
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('accepts website sign-in only after the API confirms the Admin role', async () => {
    signInWithPassword.mockResolvedValue({data:{session:{access_token:'verified-session'}},error:null})
    getCurrentAppUser.mockResolvedValue({id:'existing-admin',role:'ADMIN'})
    const { signInAsAdmin } = await import('./auth')
    await expect(signInAsAdmin('synthetic@example.test','test-only')).resolves.toMatchObject({role:'ADMIN'})
    expect(signOut).not.toHaveBeenCalled()
  })
})
