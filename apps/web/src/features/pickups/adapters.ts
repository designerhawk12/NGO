import { ApiClientError } from '../../api/client'
import { getAdminAccessToken, getAuthHeaders } from '../../api/auth'

export { getAuthHeaders }

/**
 * Demo records are intentionally opt-in.  A stale browser marker must never
 * decide whether coordinator screens read local fixtures or the API.
 */
export function isLiveAdmin(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem('aaharaconnect-admin-session') === '1'
}

/**
 * Returns the admin access token using the centralized Supabase Auth session adapter.
 */
export async function getLiveAccessToken(): Promise<string | null> {
  try {
    return await getAdminAccessToken()
  } catch {
    return null
  }
}


export function map409ErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'A resource conflict occurred. Please review your selection and try again.'
}
