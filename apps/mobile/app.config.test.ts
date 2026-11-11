import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import appConfig from './app.config';

const config = { android: { package: 'com.rajashishpatil10.aaharaconnect' } };
afterEach(() => vi.unstubAllEnvs());

describe('effective Preview Firebase config', () => {
  it('rejects a missing file, rejects the wrong Android package, and binds a valid file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aahara-firebase-config-'));
    const file = join(directory, 'google-services.json');
    try {
      vi.stubEnv('EAS_BUILD', 'true'); vi.stubEnv('EAS_BUILD_PROFILE', 'preview');
      vi.stubEnv('GOOGLE_SERVICES_JSON', '');
      expect(() => appConfig({ config } as never)).toThrow(/requires the GOOGLE_SERVICES_JSON/);
      writeFileSync(file, JSON.stringify({ client: [{ client_info: { android_client_info: { package_name: 'wrong.package' } } }] }));
      vi.stubEnv('GOOGLE_SERVICES_JSON', file);
      expect(() => appConfig({ config } as never)).toThrow(/does not match/);
      writeFileSync(file, JSON.stringify({ client: [{ client_info: { android_client_info: { package_name: config.android.package } } }] }));
      expect(appConfig({ config } as never).android?.googleServicesFile).toBe(file);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
