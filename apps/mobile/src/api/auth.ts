import type { AppUser } from '@aaharaconnect/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import { ApiClientError, apiRequest } from './client';

export function getCurrentAppUser(accessToken: string): Promise<AppUser> {
  return apiRequest<AppUser>('me', { headers: { Authorization: `Bearer ${accessToken}` } });
}

let client: SupabaseClient | undefined;

export function isLiveAuthConfigured(): boolean {
  return !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.EXPO_PUBLIC_API_BASE_URL);
}

export function validateDonorRegistrationInput(email: string, password: string, displayName: string, confirmation: string): string | null {
  if (!displayName.trim() || displayName.trim().length > 200) return 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254) return 'Enter a valid email address.';
  // Supabase enforces the project password policy. The app adds only the
  // requested minimum length, with no composition/category requirements.
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password !== confirmation) return 'Passwords do not match.';
  return null;
}

function getAuthClient(): SupabaseClient {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase Auth is not configured.');
  if (!client) {
    client = createClient(url, key, {
      auth: {
        ...(Platform.OS === 'web' ? {} : { storage: AsyncStorage }),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    if (Platform.OS !== 'web') {
      AppState.addEventListener('change', state => {
        if (state === 'active') client?.auth.startAutoRefresh();
        else client?.auth.stopAutoRefresh();
      });
    }
  }
  return client;
}

export async function signInWithEmail(email: string, password: string): Promise<AppUser> {
  const auth = getAuthClient();
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error('A confirmed email session is required.');
  try {
    return await getCurrentAppUser(data.session.access_token);
  } catch (cause) {
    await auth.auth.signOut();
    throw cause;
  }
}

export async function registerDonorWithEmailConfirmation(email: string, password: string, displayName: string): Promise<void> {
  const validationError = validateDonorRegistrationInput(email, password, displayName, password);
  if (validationError) throw new Error(validationError);
  const { data, error } = await getAuthClient().auth.signUp({
    email: email.trim(), password,
    // Use the Production Supabase Site URL as the confirmation redirect.
    // Role is deliberately omitted; the API assigns the default DONOR role.
    options: { data: { display_name: displayName.trim() } },
  });
  if (error) throw error;
  if (!data.user) throw new Error('Donor account could not be created.');
  if (data.session) {
    await getAuthClient().auth.signOut();
    throw new Error('Email confirmation is not enabled. Ask the administrator to verify the Auth settings.');
  }
}

export async function restoreAppUser(): Promise<AppUser | null> {
  if (!isLiveAuthConfigured()) return null;
  const auth = getAuthClient();
  const { data, error } = await auth.auth.getSession();
  if (error || !data.session) return null;
  return getCurrentAppUser(data.session.access_token);
}

/** The API validates this session token and resolves the application role itself. */
export async function getCurrentAccessToken(): Promise<string> {
  if (!isLiveAuthConfigured()) throw new ApiClientError(0, 'MISSING_AUTH_CONFIG', 'Live sign-in is not configured.');
  const { data, error } = await getAuthClient().auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new ApiClientError(401, 'UNAUTHENTICATED', 'Sign in again to continue.');
  return data.session.access_token;
}

export async function signOut(): Promise<void> {
  if (client) await client.auth.signOut();
}
