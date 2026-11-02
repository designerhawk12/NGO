import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('production configuration at request time', () => {
  it('keeps liveness available while missing required settings fail closed', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const name of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'CORS_ORIGIN']) {
      vi.stubEnv(name, '');
    }
    const { app } = await import('../app');

    const live = await request(app).get('/api/v1/health');
    expect(live.status).toBe(200);
    expect(live.body.data.status).toBe('ok');

    const ready = await request(app).get('/api/v1/health/ready');
    expect(ready.status).toBe(503);
    expect(ready.body.error.code).toBe('SERVER_CONFIGURATION_ERROR');

    const me = await request(app).get('/api/v1/me');
    expect(me.status).toBe(503);
    expect(me.body.error.code).toBe('SERVER_CONFIGURATION_ERROR');
    expect(JSON.stringify(me.body)).not.toContain('DATABASE_URL');
  });

  it('does not connect with database TLS explicitly disabled in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test');
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'public-test-key');
    vi.stubEnv('CORS_ORIGIN', 'https://example.org');
    vi.stubEnv('DATABASE_SSL', 'false');
    const { app } = await import('../app');
    const ready = await request(app).get('/api/v1/health/ready');
    expect(ready.status).toBe(503);
    expect(ready.body.error.code).toBe('SERVER_CONFIGURATION_ERROR');
  });
});
