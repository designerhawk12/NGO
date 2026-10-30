type DiagnosticSubsystem = 'PostgreSQL' | 'Supabase' | 'Validation' | 'Application';

const databaseConnectionCodes = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND',
  'EAI_AGAIN', 'ETIMEDOUT', 'EADDRNOTAVAIL', '57P01', '57P02', '57P03',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED',
]);

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^[A-Z0-9_-]{1,40}$/i.test(code) ? code : undefined;
}

function errorClass(error: unknown): string {
  const name = error instanceof Error ? error.name : 'UnknownError';
  return /^[A-Za-z][A-Za-z0-9_$]{0,63}$/.test(name) ? name : 'UnknownError';
}

export function isDatabaseConnectionError(error: unknown): boolean {
  const code = errorCode(error)?.toUpperCase();
  return !!code && (databaseConnectionCodes.has(code) || /^08[A-Z0-9]{3}$/.test(code));
}

function identifySubsystem(error: unknown, code: string | undefined): DiagnosticSubsystem {
  if (isDatabaseConnectionError(error) || (code && /^[0-9A-Z]{5}$/.test(code))) return 'PostgreSQL';
  const name = errorClass(error);
  if (name.startsWith('Auth')) return 'Supabase';
  if (name === 'ZodError') return 'Validation';
  return 'Application';
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\bpostgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g, '[REDACTED_TOKEN]')
    .replace(/\b(?:sb_secret|service_role|secret)[_-][A-Za-z0-9_-]{8,}\b/gi, '[REDACTED_KEY]')
    .replace(/\b(password|passwd|pwd|access_token|refresh_token|api[_-]?key|secret)\b(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[REDACTED]')
    .slice(0, 500);
}

/** Production diagnostics retain actionable error details while redacting credential-like values. */
export function reportProductionError(
  error: unknown,
  requestId: string | undefined,
  subsystem?: DiagnosticSubsystem,
): void {
  const code = errorCode(error);
  console.error(JSON.stringify({
    level: 'error',
    requestId,
    subsystem: subsystem ?? identifySubsystem(error, code),
    errorClass: errorClass(error),
    ...(code ? { code } : {}),
    message: safeErrorMessage(error),
  }));
}

/** Development-only diagnostics. Deliberately excludes messages, stacks, URLs, and request headers. */
export function reportDevelopmentError(
  error: unknown,
  requestId: string | undefined,
  subsystem?: DiagnosticSubsystem,
): void {
  if ((process.env.NODE_ENV ?? 'development') !== 'development') return;
  const code = errorCode(error);
  console.error(JSON.stringify({
    level: 'error',
    requestId,
    subsystem: subsystem ?? identifySubsystem(error, code),
    errorClass: errorClass(error),
    ...(code ? { code } : {}),
    message: 'Unhandled API error',
  }));
}

/** Records only allowlisted Auth status/code information, never provider messages or payloads. */
export function reportInviteFailure(error: unknown): void {
  if ((process.env.NODE_ENV ?? 'development') !== 'development') return;
  const candidate = error && typeof error === 'object' ? error as { status?: unknown; code?: unknown } : {};
  const status = typeof candidate.status === 'number' && candidate.status >= 100 && candidate.status <= 599
    ? candidate.status : undefined;
  const code = typeof candidate.code === 'string' && /^[a-z0-9_]{1,50}$/.test(candidate.code)
    ? candidate.code : undefined;
  console.error(JSON.stringify({ level: 'error', subsystem: 'SupabaseAuthInvite', status, code }));
}
