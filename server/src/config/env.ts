import 'dotenv/config';

const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
if (!['development', 'test', 'production'].includes(nodeEnv)) {
  throw new Error('NODE_ENV must be development, test, or production.');
}

const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',').map(origin => origin.trim()).filter(Boolean);
if (corsOrigins.length === 0 || corsOrigins.some(origin => !/^https?:\/\//.test(origin))) {
  throw new Error('CORS_ORIGIN must contain one or more http(s) origins.');
}

export function parseDatabaseUrl(rawUrl?: string): string | undefined {
  if (!rawUrl || rawUrl.trim() === '') return undefined;
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
      throw new Error('DATABASE_URL protocol must be postgresql: or postgres:.');
    }
    return trimmed;
  } catch (error) {
    if (error instanceof Error && error.message.includes('protocol')) {
      throw error;
    }
    // Prevent credential leakage: Node URL parser errors may include credentials
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
}

export function parseDatabaseSslCa(rawCa?: string): string | undefined {
  const normalized = rawCa?.replace(/\\n/g, '\n').trim();
  return normalized || undefined;
}

export function validateVolunteerInviteRedirectUrl(rawUrl: string | undefined, environment: string): void {
  if (!rawUrl) return;
  let redirect: URL;
  try { redirect = new URL(rawUrl); }
  catch { throw new Error('VOLUNTEER_INVITE_REDIRECT_URL must be a valid acceptance URL.'); }
  const localHttp = environment !== 'production' && redirect.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname);
  if ((redirect.protocol !== 'https:' && !localHttp) || redirect.pathname !== '/accept-invite'
    || redirect.search || redirect.hash || redirect.username || redirect.password) {
    throw new Error('VOLUNTEER_INVITE_REDIRECT_URL must be the HTTPS /accept-invite URL (local HTTP is allowed in development).');
  }
}

export const env = {
  port,
  nodeEnv,
  corsOrigins,
  databaseUrl: parseDatabaseUrl(process.env.DATABASE_URL),
  databaseSsl: process.env.DATABASE_SSL === 'true' || (nodeEnv === 'production' && process.env.DATABASE_SSL !== 'false'),
  databaseSslCa: parseDatabaseSslCa(process.env.DATABASE_SSL_CA),
  databaseSslCaPath: process.env.DATABASE_SSL_CA_PATH?.trim() || undefined,
  supabaseUrl: process.env.SUPABASE_URL || undefined,
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || undefined,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY?.trim() || undefined,
  volunteerInviteRedirectUrl: process.env.VOLUNTEER_INVITE_REDIRECT_URL?.trim() || undefined,
  locationRetentionDays: Number(process.env.LOCATION_RETENTION_DAYS ?? 30),
} as const;

if (!Number.isInteger(env.locationRetentionDays) || env.locationRetentionDays < 1 || env.locationRetentionDays > 365) {
  throw new Error('LOCATION_RETENTION_DAYS must be an integer from 1 to 365.');
}
if (env.supabaseUrl && !/^https:\/\//.test(env.supabaseUrl)) throw new Error('SUPABASE_URL must use https.');
validateVolunteerInviteRedirectUrl(env.volunteerInviteRedirectUrl, env.nodeEnv);
if (env.nodeEnv === 'production' && (!env.databaseUrl || !env.supabaseUrl || !env.supabasePublishableKey || !process.env.CORS_ORIGIN)) {
  throw new Error('Production requires DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and CORS_ORIGIN.');
}
if (env.nodeEnv === 'production' && !env.databaseSsl) throw new Error('Production database TLS cannot be disabled.');
