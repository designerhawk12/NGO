import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDatabaseConnectionError, reportDevelopmentError, reportProductionError } from '../utils/safeDiagnostics';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('safe development diagnostics', () => {
  it('logs a safe subsystem and code without error details', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const output = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = Object.assign(new Error('do-not-log database password'), { code: 'ENOTFOUND' });

    reportDevelopmentError(error, 'request-123');

    const entry = JSON.parse(String(output.mock.calls[0][0]));
    expect(entry).toMatchObject({ subsystem: 'PostgreSQL', errorClass: 'Error', code: 'ENOTFOUND', requestId: 'request-123' });
    expect(JSON.stringify(entry)).not.toContain('do-not-log database password');
    expect(entry.stack).toBeUndefined();
  });

  it('recognizes connection failures without treating SQL errors as connectivity failures', () => {
    expect(isDatabaseConnectionError(Object.assign(new Error(), { code: 'ETIMEDOUT' }))).toBe(true);
    expect(isDatabaseConnectionError(Object.assign(new Error(), { code: '08006' }))).toBe(true);
    expect(isDatabaseConnectionError(Object.assign(new Error(), { code: '42P01' }))).toBe(false);
  });

  it('does not emit diagnostics outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const output = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reportDevelopmentError(new Error('private detail'), 'request-456');
    expect(output).not.toHaveBeenCalled();
  });

  it('records production error details while redacting credential-like values', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const output = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = Object.assign(
      new Error('permission denied; password=hunter2; Bearer abc.def.ghi; key=sb_secret_abcdefghijk'),
      { code: '42501' },
    );

    reportProductionError(error, 'request-789');

    const entry = JSON.parse(String(output.mock.calls[0][0]));
    expect(entry).toMatchObject({
      requestId: 'request-789',
      subsystem: 'PostgreSQL',
      code: '42501',
      message: expect.stringContaining('permission denied'),
    });
    expect(JSON.stringify(entry)).not.toContain('hunter2');
    expect(JSON.stringify(entry)).not.toContain('abc.def.ghi');
    expect(JSON.stringify(entry)).not.toContain('sb_secret_abcdefghijk');
  });
});
