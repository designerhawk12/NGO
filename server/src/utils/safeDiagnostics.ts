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
  if (code && (databaseConnectionCodes.has(code) || /^08[A-Z0-9]{3}$/.test(code) || code === 'XX000')) {
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('tenant/user') ||
      msg.includes('self-signed certificate') ||
      msg.includes('certificate chain') ||
      msg.includes('connection terminated')
    ) {
      return true;
    }
  }
  return false;
}

/** Production-safe PostgreSQL diagnostics. Never include driver messages or URLs. */
export function reportDatabaseConnectionError(error: unknown, requestId: string | undefined): void {
  const candidate = errorCode(error)?.toUpperCase();
  const knownCodes = new Set([...databaseConnectionCodes, 'SELF_SIGNED_CERT_IN_CHAIN',
    '28P01', '28000', 'XX000']);
  const code = candidate && (knownCodes.has(candidate) || /^08[A-Z0-9]{3}$/.test(candidate))
    ? candidate : undefined;
  const category = code === 'ENOTFOUND' || code === 'EAI_AGAIN' ? 'DNS'
    : code === 'ECONNREFUSED' ? 'CONNECTION_REFUSED'
    : code === 'ETIMEDOUT' ? 'TIMEOUT'
    : code === '28P01' || code === '28000' ? 'AUTHENTICATION'
    : code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
      || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'ERR_TLS_CERT_ALTNAME_INVALID'
      || code === 'CERT_HAS_EXPIRED' ? 'TLS'
    : code?.startsWith('08') ? 'CONNECTION'
    : 'OTHER';
  const candidateClass = errorClass(error);
  const safeClass = ['Error', 'TypeError', 'AggregateError', 'SystemError'].includes(candidateClass)
    ? candidateClass : 'UnknownError';
  console.error(JSON.stringify({ level: 'error', requestId, subsystem: 'PostgreSQL',
    errorClass: safeClass, category, ...(code ? { code } : {}) }));
}

function identifySubsystem(error: unknown, code: string | undefined): DiagnosticSubsystem {
  if (isDatabaseConnectionError(error) || (code && /^[0-9A-Z]{5}$/.test(code))) return 'PostgreSQL';
  const name = errorClass(error);
  if (name.startsWith('Auth')) return 'Supabase';
  if (name === 'ZodError') return 'Validation';
  return 'Application';
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
