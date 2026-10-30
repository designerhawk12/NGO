import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { HttpError } from '../middleware/errorHandler';
import { reportInviteFailure } from '../utils/safeDiagnostics';

export type VerifiedIdentity = { authUserId: string; email: string };

let adminClient: ReturnType<typeof createClient> | undefined;

function getSupabaseAdminClient() {
  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    throw new HttpError(
      503,
      'INVITE_CONFIGURATION_ERROR',
      'Volunteer invitation is not configured.'
    );
  }

  if (!adminClient) {
    adminClient = createClient(
      env.supabaseUrl,
      env.supabaseSecretKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    );
  }

  return adminClient;
}
export async function verifySupabaseToken(token: string): Promise<VerifiedIdentity> {
  if (!env.supabaseUrl || !env.supabasePublishableKey) {
    throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Authentication is not configured.');
  }
  const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  // getUser(token) asks Supabase Auth to verify the token; do not decode unverified claims.
  let result: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try { result = await supabase.auth.getUser(token); }
  catch { throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Authentication service is unavailable.'); }
  const { data, error } = result;
  if (error?.status === 0 || error?.name === 'AuthRetryableFetchError') {
    throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Authentication service is unavailable.');
  }
  if (error || !data.user?.id || !data.user.email || !data.user.email_confirmed_at) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'A verified email session is required.');
  }
  return { authUserId: data.user.id, email: data.user.email };
}

export type InvitedSupabaseUser = {
  authUserId: string;
  inviteNonce: string;
};

export async function inviteSupabaseUserByEmail(
  email: string,
  name: string
): Promise<InvitedSupabaseUser> {
  const supabase = getSupabaseAdminClient();
  const inviteNonce = randomUUID();
  const startedAt = Date.now();

  try {
    const { data, error } =
      await supabase.auth.admin.inviteUserByEmail(email.trim().toLowerCase(), {
        data: { name, aaharaconnectInviteNonce: inviteNonce },
        ...(env.volunteerInviteRedirectUrl ? { redirectTo: env.volunteerInviteRedirectUrl } : {}),
      });

    if (error) {
      reportInviteFailure(error);
      const duplicate =
        ['email_exists', 'user_already_exists'].includes(error.code ?? '')
        || /already.*registered|already.*exists/i.test(error.message);

      if (duplicate) {
        throw new HttpError(
          409,
          'VOLUNTEER_ALREADY_EXISTS',
          'An authentication account already exists for this email.'
        );
      }

      if (error.code === 'email_address_not_authorized') {
        throw new HttpError(422, 'INVITE_EMAIL_NOT_AUTHORIZED', 'This address cannot receive invitations with current email settings.');
      }

      if (error.status === 429 || /rate[_ -]?limit|too many requests|email rate limit/i.test(`${error.code ?? ''} ${error.message}`)) {
        throw new HttpError(429, 'INVITE_RATE_LIMITED', 'Invitation email limit reached. Please wait before trying again.');
      }

      if (/redirect/i.test(`${error.code ?? ''} ${error.message}`)) {
        throw new HttpError(503, 'INVITE_CONFIGURATION_ERROR', 'Invitation redirect is not configured correctly.');
      }

      throw new HttpError(
        503,
        'INVITE_SERVICE_UNAVAILABLE',
        'The volunteer invitation could not be created.'
      );
    }

    if (!data.user?.id) {
      throw new HttpError(
        503,
        'INVITE_SERVICE_UNAVAILABLE',
        'The authentication provider did not return an invited user.'
      );
    }

    // Supabase may successfully re-invite an existing unconfirmed user. Its
    // existing metadata does not contain this request's fresh nonce, so never
    // provision or compensate that account as though it were newly created.
    const createdAt = Date.parse(data.user.created_at ?? '');
    if (data.user.user_metadata?.aaharaconnectInviteNonce !== inviteNonce
      || !Number.isFinite(createdAt) || createdAt < startedAt - 5000) {
      throw new HttpError(409, 'VOLUNTEER_ALREADY_EXISTS', 'An authentication account already exists for this email.');
    }

    return { authUserId: data.user.id, inviteNonce };
  } catch (error) {
    if (error instanceof HttpError) throw error;

    reportInviteFailure(error);

    throw new HttpError(
      503,
      'INVITE_SERVICE_UNAVAILABLE',
      'The authentication service is unavailable.'
    );
  }
}

export async function setVolunteerPassword(
  authUserId: string,
  newPassword: string
): Promise<void> {
  const supabase = getSupabaseAdminClient();

  if (newPassword.length < 8 || newPassword.length > 128) {
    throw new HttpError(
      400,
      'INVALID_PASSWORD',
      'Password must be between 8 and 128 characters long.'
    );
  }

  let lookupResult: Awaited<ReturnType<typeof supabase.auth.admin.getUserById>>;
  try {
    lookupResult = await supabase.auth.admin.getUserById(authUserId);
  } catch {
    throw new HttpError(503, 'PASSWORD_UPDATE_FAILED', 'The linked authentication account could not be verified.');
  }
  const { data, error: lookupError } = lookupResult;
  if (lookupError?.status === 404 || lookupError?.code === 'user_not_found') {
    throw new HttpError(409, 'RESOURCE_CONFLICT', 'The linked authentication account no longer exists.');
  }
  if (lookupError || !data.user || data.user.id !== authUserId) {
    throw new HttpError(503, 'PASSWORD_UPDATE_FAILED', 'The linked authentication account could not be verified.');
  }
  if (!data.user.email_confirmed_at) {
    throw new HttpError(409, 'VOLUNTEER_EMAIL_UNCONFIRMED', 'The volunteer account must be email-confirmed before its password can be set.');
  }

  // Updating only the password preserves the Auth account's existing verification state.
  try {
    const { error } = await supabase.auth.admin.updateUserById(authUserId, { password: newPassword });
    if (error) throw new Error('Auth password update failed.');
  } catch {
    throw new HttpError(503, 'PASSWORD_UPDATE_FAILED', 'The volunteer password could not be updated.');
  }
}
