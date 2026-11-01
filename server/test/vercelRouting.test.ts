import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import handler from '../../api/index';
import { env } from '../src/config/env';
import { app } from '../src/app';

const ORIGINAL_API_PATH_HEADER = 'x-ac-original-api-path';
const vercelConfig = JSON.parse(
  readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
) as {
  routes: Array<{
    src: string;
    dest: string;
    transforms?: Array<{
      type: string;
      op: string;
      target?: { key?: string };
      args?: string;
    }>;
  }>;
};

describe('Vercel Express rewrite adapter', () => {
  it('routes nested v1 API paths to the function without matching its destination again', () => {
    const apiRoute = vercelConfig.routes.find((route) => route.src === '^/api/v1/(.*)$');

    expect(apiRoute).toBeDefined();
    expect(apiRoute?.dest).toBe('/api/index');
    expect(new RegExp(apiRoute!.src).test(apiRoute!.dest)).toBe(false);

    const match = '/api/v1/teams/42/members'.match(new RegExp(apiRoute!.src));
    expect(match?.[1]).toBe('teams/42/members');
    expect(apiRoute?.transforms).toContainEqual({
      type: 'request.headers',
      op: 'set',
      target: { key: ORIGINAL_API_PATH_HEADER },
      args: 'v1/$1',
    });
  });

  it('restores nested API paths for Express route matching', async () => {
    const response = await request(handler)
      .get('/api/index')
      .set(ORIGINAL_API_PATH_HEADER, 'v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { status: 'ok' } });
  });

  it('preserves the query string received by the function and removes the private routing header', async () => {
    let receivedUrl: string | undefined;
    let receivedRoutingHeader: string | string[] | undefined;
    const appHandle = vi.spyOn(app, 'handle').mockImplementation((req, res) => {
      receivedUrl = req.url;
      receivedRoutingHeader = req.headers[ORIGINAL_API_PATH_HEADER];
      res.statusCode = 204;
      res.end();
    });

    try {
      const response = await request(handler)
        .get('/api/index?probe=kept&repeat=one&repeat=two&encoded=a%2Fb')
        .set(ORIGINAL_API_PATH_HEADER, 'v1/health');

      expect(response.status).toBe(204);
      expect(receivedUrl).toBe('/api/v1/health?probe=kept&repeat=one&repeat=two&encoded=a%2Fb');
      expect(receivedRoutingHeader).toBeUndefined();
    } finally {
      appHandle.mockRestore();
    }
  });

  it('allows configured CORS origins and omits access for unconfigured origins', async () => {
    const allowedOrigin = env.corsOrigins[0];
    const rejectedOrigin = 'https://cors-probe.invalid';
    expect(env.corsOrigins).not.toContain(rejectedOrigin);

    const allowed = await request(handler)
      .get('/api/index')
      .set(ORIGINAL_API_PATH_HEADER, 'v1/health')
      .set('Origin', allowedOrigin);
    expect(allowed.headers['access-control-allow-origin']).toBe(allowedOrigin);

    const rejected = await request(handler)
      .get('/api/index')
      .set(ORIGINAL_API_PATH_HEADER, 'v1/health')
      .set('Origin', rejectedOrigin);
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns Express JSON not-found responses for unknown nested API paths', async () => {
    const response = await request(handler)
      .get('/api/index')
      .set(ORIGINAL_API_PATH_HEADER, 'v1/__vercel_route_probe__');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('rejects direct calls that try to supply the old private query parameter', async () => {
    const response = await request(handler).get('/api/index?__ac_original_api_path=v1/health');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, error: { code: 'INVALID_API_PATH' } });
  });

  it.each([
    ['unsupported API version', 'v2/health'],
    ['empty path', ''],
  ])('rejects invalid rewritten paths: %s', async (_case, capturedPath) => {
    const response = await request(handler)
      .get('/api/index')
      .set(ORIGINAL_API_PATH_HEADER, capturedPath);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, error: { code: 'INVALID_API_PATH' } });
  });
});
