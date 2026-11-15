import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type RecoveryAuth = Pick<SupabaseClient['auth'], 'resetPasswordForEmail' | 'getSession' | 'getUser' | 'verifyOtp' | 'updateUser' | 'signOut' | 'onAuthStateChange'>

export function createRecoveryAuth(detectSessionInUrl = false): RecoveryAuth | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  // This temporary client must never read or write the persistent Admin session.
  try {
    return createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl,
        flowType: 'implicit',
        storageKey: 'aaharaconnect-password-recovery',
      },
    }).auth
  } catch { return null }
}

export function recoveryRedirect(origin: string): string | null {
  try {
    const url = new URL(origin)
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.origin !== origin || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) return null
    return `${url.origin}/reset-password`
  } catch { return null }
}

export function isValidRecoveryEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export type RecoveryRequestResult = 'accepted' | 'invalid-email' | 'unavailable'

export async function requestPasswordRecovery(auth: RecoveryAuth, email: string, origin: string): Promise<RecoveryRequestResult> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!isValidRecoveryEmail(normalizedEmail)) return 'invalid-email'
  const redirectTo = recoveryRedirect(origin)
  if (!redirectTo) return 'unavailable'
  try {
    const result = await auth.resetPasswordForEmail(normalizedEmail, { redirectTo })
    // Unknown accounts receive the same public outcome as accepted requests.
    if (result.error && !['user_not_found', 'email_not_found'].includes(result.error.code ?? '')) return 'unavailable'
    return 'accepted'
  } catch { return 'unavailable' }
}

export type RecoveryCallback =
  | { kind: 'otp'; tokenHash: string }
  | { kind: 'implicit' }
  | { kind: 'invalid' }

export function recoveryCallback(location: Pick<Location, 'search' | 'hash'>): RecoveryCallback {
  const query = new URLSearchParams(location.search)
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''))
  if (query.has('error') || query.has('error_code') || fragment.has('error') || fragment.has('error_code')) return { kind: 'invalid' }
  // This deployment uses implicit Auth callbacks. A PKCE code without a verified
  // recovery purpose must not be exchanged as if it were a recovery token.
  if (query.has('code') || fragment.has('code')) return { kind: 'invalid' }
  const tokenHash = query.get('token_hash')
  if (tokenHash && query.get('type') === 'recovery' && !fragment.has('access_token') && !fragment.has('refresh_token')) return { kind: 'otp', tokenHash }
  if (!tokenHash && fragment.get('type') === 'recovery' && !query.has('type') && fragment.has('access_token') && fragment.has('refresh_token')) return { kind: 'implicit' }
  return { kind: 'invalid' }
}
