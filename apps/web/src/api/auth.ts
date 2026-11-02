import type { AppUser } from '@aaharaconnect/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiClientError, apiRequest } from './client';

export function getCurrentAppUser(accessToken: string): Promise<AppUser> {
  return apiRequest<AppUser>('me', { headers: { Authorization: `Bearer ${accessToken}` } });
}

let client: SupabaseClient | undefined;
let cachedAdminUser: { token: string; user: AppUser; timestamp: number } | null = null;

export function clearAdminAuthCache(): void {
  cachedAdminUser = null;
}

export function isLiveAuthConfigured(): boolean {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY && import.meta.env.VITE_API_BASE_URL);
}

function getAuthClient(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase Auth is not configured.');
  client ??= createClient(url, key, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  return client;
}

export async function signInAsAdmin(email: string, password: string): Promise<AppUser> {
  const auth = getAuthClient();
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error('A confirmed email session is required.');
  try {
    const user = await getCurrentAppUser(data.session.access_token);
    if (user.role !== 'ADMIN') throw new Error('Administrator access is required.');
    cachedAdminUser = { token: data.session.access_token, user, timestamp: Date.now() };
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('aaharaconnect-admin-session', '1');
    }
    return user;
  } catch (cause) {
    cachedAdminUser = null;
    await auth.auth.signOut().catch(() => {});
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('aaharaconnect-admin-session');
    }
    throw cause;
  }
}

export async function restoreAdminSession(): Promise<AppUser | null> {
  if (!isLiveAuthConfigured()) return null;
  try {
    const auth = getAuthClient();
    const { data, error } = await auth.auth.getSession();
    if (error || !data.session) {
      cachedAdminUser = null;
      if (typeof window !== 'undefined') window.localStorage.removeItem('aaharaconnect-admin-session');
      return null;
    }

    let session = data.session;
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 30000) {
      const refreshed = await auth.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session) {
        cachedAdminUser = null;
        await auth.auth.signOut().catch(() => {});
        if (typeof window !== 'undefined') window.localStorage.removeItem('aaharaconnect-admin-session');
        return null;
      }
      session = refreshed.data.session;
    }

    const user = await getCurrentAppUser(session.access_token);
    if (user.role !== 'ADMIN') {
      cachedAdminUser = null;
      await auth.auth.signOut().catch(() => {});
      if (typeof window !== 'undefined') window.localStorage.removeItem('aaharaconnect-admin-session');
      return null;
    }

    cachedAdminUser = { token: session.access_token, user, timestamp: Date.now() };
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('aaharaconnect-admin-session', '1');
    }
    return user;
  } catch {
    cachedAdminUser = null;
    if (typeof window !== 'undefined') window.localStorage.removeItem('aaharaconnect-admin-session');
    return null;
  }
}

export async function getAdminAccessToken(): Promise<string | null> {
  if (!isLiveAuthConfigured()) return null;
  try {
    const auth = getAuthClient();
    const { data, error } = await auth.auth.getSession();
    if (error || !data.session) return null;

    let session = data.session;
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 30000) {
      const refreshed = await auth.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session) {
        cachedAdminUser = null;
        return null;
      }
      session = refreshed.data.session;
    }

    if (!cachedAdminUser || cachedAdminUser.token !== session.access_token) {
      const user = await getCurrentAppUser(session.access_token);
      if (user.role !== 'ADMIN') {
        cachedAdminUser = null;
        throw new ApiClientError(403, 'FORBIDDEN', 'Administrator access is required.');
      }
      cachedAdminUser = { token: session.access_token, user, timestamp: Date.now() };
    }

    return session.access_token;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    return null;
  }
}

/**
 * Shared authorization header helper for protected API requests.
 * Throws ApiClientError(401, 'UNAUTHENTICATED') if no valid administrator session exists,
 * preventing anonymous requests from reaching protected endpoints.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAdminAccessToken();
  if (!token) {
    throw new ApiClientError(
      401,
      'UNAUTHENTICATED',
      'Administrator sign-in is required to access live records. Please sign in under Settings.'
    );
  }
  return { Authorization: `Bearer ${token}` };
}

export async function signOutAdmin(): Promise<void> {
  cachedAdminUser = null;
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('aaharaconnect-admin-session');
  }
  if (client) await client.auth.signOut().catch(() => {});
}
