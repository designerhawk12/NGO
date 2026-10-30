import { describe, expect, it } from 'vitest';
import { parseDatabaseSslCa, parseDatabaseUrl, validateVolunteerInviteRedirectUrl } from '../config/env';

describe('parseDatabaseSslCa', () => {
  it('preserves PEM content and expands escaped newlines from hosting environment values', () => {
    const pem = '-----BEGIN CERTIFICATE-----\ncertificate-body\n-----END CERTIFICATE-----';
    expect(parseDatabaseSslCa(pem)).toBe(pem.replace(/\\n/g, '\n'));
    expect(parseDatabaseSslCa('  -----BEGIN CERTIFICATE-----\\nbody\\n-----END CERTIFICATE-----  '))
      .toBe('-----BEGIN CERTIFICATE-----\nbody\n-----END CERTIFICATE-----');
    expect(parseDatabaseSslCa('  ')).toBeUndefined();
  });
});

describe('parseDatabaseUrl', () => {
  it('returns undefined for empty or missing values', () => {
    expect(parseDatabaseUrl(undefined)).toBeUndefined();
    expect(parseDatabaseUrl('')).toBeUndefined();
    expect(parseDatabaseUrl('   ')).toBeUndefined();
  });

  it('accepts valid postgresql: and postgres: URLs', () => {
    expect(parseDatabaseUrl('postgresql://user:pass@localhost:5432/mydb')).toBe('postgresql://user:pass@localhost:5432/mydb');
    expect(parseDatabaseUrl('postgres://user:pass@remotehost:5432/postgres')).toBe('postgres://user:pass@remotehost:5432/postgres');
  });

  it('rejects unsupported protocols with a clear message', () => {
    expect(() => parseDatabaseUrl('http://localhost:5432/mydb')).toThrow('DATABASE_URL protocol must be postgresql: or postgres:.');
    expect(() => parseDatabaseUrl('mysql://user:pass@localhost:3306/mydb')).toThrow('DATABASE_URL protocol must be postgresql: or postgres:.');
  });

  it('rejects malformed URLs without leaking sensitive contents', () => {
    const sensitive = 'not-a-valid-url-with-secret-password-12345';
    expect(() => parseDatabaseUrl(sensitive)).toThrow('DATABASE_URL must be a valid PostgreSQL connection URL.');
    try {
      parseDatabaseUrl(sensitive);
    } catch (error) {
      expect((error as Error).message).not.toContain('secret-password-12345');
    }
  });
});

describe('volunteer invite redirect', () => {
  it('accepts the local acceptance page in development and HTTPS in production', () => {
    expect(() => validateVolunteerInviteRedirectUrl('http://localhost:5173/accept-invite', 'development')).not.toThrow();
    expect(() => validateVolunteerInviteRedirectUrl('https://example.org/accept-invite', 'production')).not.toThrow();
    expect(() => validateVolunteerInviteRedirectUrl(undefined, 'development')).not.toThrow();
  });

  it('rejects nonlocal HTTP, another path, query redirects and credentials', () => {
    for (const value of [
      'http://example.org/accept-invite',
      'http://localhost:5173/accept-invite',
      'https://example.org/other',
      'https://example.org/accept-invite?redirect_to=https://elsewhere.example',
      'https://user:pass@example.org/accept-invite',
    ]) {
      const environment = value.startsWith('http://localhost') ? 'production' : 'development';
      expect(() => validateVolunteerInviteRedirectUrl(value, environment)).toThrow('VOLUNTEER_INVITE_REDIRECT_URL');
    }
  });
});
