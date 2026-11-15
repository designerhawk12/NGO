import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import type { PoolClient } from 'pg';
import { env } from '../../config/env';
import { withTransaction } from '../../db/pool';
import { HttpError } from '../../middleware/errorHandler';

const IP_WINDOW_SECONDS = 60 * 60;
const IP_MAX_ATTEMPTS = 5;
const EMAIL_WINDOW_SECONDS = 24 * 60 * 60;
const EMAIL_MAX_ATTEMPTS = 1;

function normalizeIpAddress(value: string): string {
  const address = value.trim().toLowerCase();
  if (!isIP(address)) throw new HttpError(503, 'INVITE_CONFIGURATION_ERROR', 'Volunteer registration protection is unavailable.');
  if (address.startsWith('::ffff:') && isIP(address.slice(7)) === 4) return address.slice(7);
  if (isIP(address) === 6) {
    try { return new URL(`http://[${address}]`).hostname.slice(1, -1); }
    catch { throw new HttpError(503, 'INVITE_CONFIGURATION_ERROR', 'Volunteer registration protection is unavailable.'); }
  }
  return address;
}

function makeKeyHash(kind: 'ip' | 'email', value: string): Buffer {
  if (!env.supabaseSecretKey) {
    throw new HttpError(503, 'INVITE_CONFIGURATION_ERROR', 'Volunteer registration protection is unavailable.');
  }
  return createHmac('sha256', env.supabaseSecretKey)
    .update(`public-volunteer-registration:${kind}:${value}`)
    .digest();
}

async function consumeBucket(
  client: PoolClient,
  keyHash: Buffer,
  windowSeconds: number,
  maxAttempts: number
): Promise<boolean> {
  const result = await client.query(
    `INSERT INTO app.volunteer_registration_rate_limits(key_hash, window_started_at, attempt_count)
     VALUES ($1, now(), 1)
     ON CONFLICT (key_hash) DO UPDATE
       SET window_started_at = CASE
             WHEN app.volunteer_registration_rate_limits.window_started_at <= now() - ($2 * interval '1 second') THEN now()
             ELSE app.volunteer_registration_rate_limits.window_started_at
           END,
           attempt_count = CASE
             WHEN app.volunteer_registration_rate_limits.window_started_at <= now() - ($2 * interval '1 second') THEN 1
             ELSE app.volunteer_registration_rate_limits.attempt_count + 1
           END,
           updated_at = now()
       WHERE app.volunteer_registration_rate_limits.window_started_at <= now() - ($2 * interval '1 second')
          OR app.volunteer_registration_rate_limits.attempt_count < $3
     RETURNING attempt_count`,
    [keyHash, windowSeconds, maxAttempts]
  );
  return result.rowCount === 1;
}

/**
 * Durable serverless-safe limits for unauthenticated invitations. Only HMAC
 * digests are stored; raw client IPs and email addresses are never persisted.
 */
export async function consumeVolunteerRegistrationRateLimit(clientIp: string, email: string): Promise<boolean> {
  const ipHash = makeKeyHash('ip', normalizeIpAddress(clientIp));
  const emailHash = makeKeyHash('email', email.trim().toLowerCase());
  try {
    return await withTransaction(async client => {
      await client.query(
        `DELETE FROM app.volunteer_registration_rate_limits
         WHERE window_started_at < now() - interval '30 days'`
      );
      if (!await consumeBucket(client, ipHash, IP_WINDOW_SECONDS, IP_MAX_ATTEMPTS)) return false;
      if (!await consumeBucket(client, emailHash, EMAIL_WINDOW_SECONDS, EMAIL_MAX_ATTEMPTS)) return false;
      return true;
    });
  } catch {
    throw new HttpError(503, 'INVITE_CONFIGURATION_ERROR', 'Volunteer registration protection is unavailable.');
  }
}
