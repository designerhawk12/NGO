import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rootCertificates } from 'node:tls';
import { afterEach, describe, expect, it } from 'vitest';
import { databaseSslOptions } from '../db/tls';

const caCertificate = rootCertificates[0];
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('database TLS configuration', () => {
  it('accepts a valid inline PEM certificate and keeps verification enabled', () => {
    const options = databaseSslOptions({ enabled: true, inlineCa: caCertificate });
    expect(options?.ca).toBeTruthy();
    expect(options?.rejectUnauthorized).toBe(true);
  });

  it('normalizes escaped newlines in inline PEM', () => {
    const options = databaseSslOptions({ enabled: true, inlineCa: caCertificate.replace(/\n/g, '\\n') });
    expect(options?.ca).toBeTruthy();
    expect(options?.rejectUnauthorized).toBe(true);
  });

  it('accepts a PEM chain containing multiple CA certificates', () => {
    const chain = rootCertificates.slice(0, 2).join('\n');
    const options = databaseSslOptions({ enabled: true, inlineCa: chain });
    expect(options?.ca).toBeTruthy();
    expect(options?.rejectUnauthorized).toBe(true);
  });

  it('rejects invalid inline PEM with a safe error', () => {
    const options = () => databaseSslOptions({ enabled: true, inlineCa: 'private-looking-invalid-value' });
    expect(options).toThrow('Invalid database CA certificate configuration.');
    try { options(); } catch (error) {
      expect((error as Error).message).not.toContain('private-looking-invalid-value');
    }
  });

  it('loads and validates a CA file configured by path', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aahara-db-tls-'));
    temporaryDirectories.push(directory);
    const caPath = join(directory, 'ca.pem');
    writeFileSync(caPath, caCertificate, 'utf8');
    const options = databaseSslOptions({ enabled: true, caPath });
    expect(options?.ca).toBeTruthy();
    expect(options?.rejectUnauthorized).toBe(true);
  });

  it('prefers the configured CA path when both CA settings are present', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aahara-db-tls-'));
    temporaryDirectories.push(directory);
    const caPath = join(directory, 'ca.pem');
    writeFileSync(caPath, caCertificate, 'utf8');
    const options = databaseSslOptions({ enabled: true, caPath, inlineCa: 'invalid-inline-certificate' });
    expect(options?.ca).toBeTruthy();
  });

  it('allows the system trust store when no custom CA is configured, while verifying certificates', () => {
    expect(databaseSslOptions({ enabled: true })).toEqual({ rejectUnauthorized: true });
  });
});
