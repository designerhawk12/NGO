import request from 'supertest';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { androidRelease, releaseRoutes } from '../modules/releases/routes';

const artifact = 'https://expo.dev/artifacts/eas/7cB6W9I3paFVnjHm6JBdSCapTmhOs95zfcRlKrv4kWY.apk';
const app = express().use('/releases', releaseRoutes);
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://pyzyxgpcfwpcqyqrihuo.supabase.co');
  vi.stubEnv('ANDROID_RELEASE_APPROVED', 'true');
  vi.stubEnv('ANDROID_RELEASE_URL', artifact);
  vi.stubEnv('ANDROID_RELEASE_VERSION', '1.0.0 (8)');
  vi.stubEnv('ANDROID_RELEASE_BUILD_ID', '36acb049-e0fe-4707-9d1f-aa5557e21cc8');
  vi.stubEnv('ANDROID_RELEASE_SHA256', 'f3685eb760c3bdf2662f35b1060d0918917c7dda17e89b5e07ff84e291739d64');
});
afterEach(() => vi.unstubAllEnvs());
describe('verified Expo APK downloads', () => {
  it('exposes approved metadata and redirects anonymous downloads to the exact artifact', async () => {
    expect(androidRelease().available).toBe(true);
    const metadata = await request(app).get('/releases/android').expect(200);
    expect(metadata.body.data).toMatchObject({ available: true, version: '1.0.0 (8)' });
    expect(metadata.body.data.url).toBeUndefined();
    const response = await request(app).get('/releases/android/download').expect(302);
    expect(response.headers.location).toBe(artifact);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it.each([
    artifact.replace('expo.dev', 'expo.dev.evil.test'),
    artifact.replace('expo.dev', 'user@expo.dev'),
    artifact.replace('https:', 'http:'),
    artifact + '?redirect=https://evil.test',
    artifact + '#fragment',
    'https://expo.dev/build.apk',
    'https://expo.dev/artifacts/eas/../build.apk',
    artifact.replace('expo.dev', 'expo.dev:444'),
  ])('rejects an untrusted or ambiguous artifact URL: %s', (url) => {
    vi.stubEnv('ANDROID_RELEASE_URL', url);
    expect(androidRelease().available).toBe(false);
  });
  it('keeps publication disabled without explicit approval or a valid checksum', async () => {
    vi.stubEnv('ANDROID_RELEASE_APPROVED', 'false');
    await request(app).get('/releases/android/download').expect(503);
    vi.stubEnv('ANDROID_RELEASE_APPROVED', 'true');
    vi.stubEnv('ANDROID_RELEASE_SHA256', 'invalid');
    expect(androidRelease().available).toBe(false);
  });
});
