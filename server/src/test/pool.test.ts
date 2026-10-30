import { describe, expect, it } from 'vitest';
import { createDatabaseSslOptions } from '../db/pool';

describe('database SSL options', () => {
  it('uses the configured CA while keeping server certificate verification enabled', () => {
    const ca = '-----BEGIN CERTIFICATE-----\ntrusted-root\n-----END CERTIFICATE-----';

    expect(createDatabaseSslOptions({ enabled: true, ca })).toEqual({
      rejectUnauthorized: true,
      ca,
    });
  });

  it('keeps existing local CA path behavior when no inline CA is set', () => {
    expect(() => createDatabaseSslOptions({ enabled: true, caPath: 'missing-test-ca.crt' }))
      .toThrow('Database SSL CA file not found at configured path.');
  });

  it('omits SSL options only when SSL is explicitly disabled by configuration', () => {
    expect(createDatabaseSslOptions({ enabled: false })).toBeUndefined();
  });
});
