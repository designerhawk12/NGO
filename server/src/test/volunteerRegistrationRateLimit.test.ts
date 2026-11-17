import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  secret: 'private-test-only-secret',
}));

// Exercise the real withTransaction helper without connecting to a database.
vi.mock('pg', () => ({
  Pool: class {
    on() {}
    async connect() { return { query: state.query, release: state.release }; }
  },
}));
vi.mock('../config/env', () => ({
  env: {
    databaseUrl: 'postgres://unused.invalid/test',
    databaseSsl: false,
    supabaseSecretKey: state.secret,
  },
}));

import { consumeVolunteerRegistrationRateLimit } from '../modules/volunteers/registrationRateLimit';

const ip = '203.0.113.9';
const email = 'applicant@example.test';

function statements(): string[] {
  return state.query.mock.calls.map(([sql]) => sql.split(' ')[0]);
}

function digest(kind: 'ip' | 'email', value: string): Buffer {
  return createHmac('sha256', state.secret)
    .update(`public-volunteer-registration:${kind}:${value}`)
    .digest();
}

beforeEach(() => {
  state.query.mockReset().mockResolvedValue({ rowCount: 1, rows: [{ attempt_count: 1 }] });
  state.release.mockClear();
});

describe('durable Volunteer registration rate limit', () => {
  it('commits both buckets with hourly limits of five per IP and one per email', async () => {
    expect(await consumeVolunteerRegistrationRateLimit(ip, ' Applicant@Example.test ')).toBe(true);
    expect(statements()).toEqual(['BEGIN', 'DELETE', 'INSERT', 'INSERT', 'COMMIT']);
    expect(state.query.mock.calls[2][1]).toEqual([digest('ip', ip), 3600, 5]);
    expect(state.query.mock.calls[3][1]).toEqual([digest('email', email), 3600, 1]);
    expect(state.release).toHaveBeenCalledOnce();
  });

  it('rolls back an exhausted IP bucket without consuming an email attempt', async () => {
    state.query.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 0 });
    expect(await consumeVolunteerRegistrationRateLimit(ip, email)).toBe(false);
    expect(statements()).toEqual(['BEGIN', 'DELETE', 'INSERT', 'ROLLBACK']);
    expect(state.release).toHaveBeenCalledOnce();
  });

  it('rolls back the IP increment when the email bucket is exhausted', async () => {
    state.query.mockResolvedValueOnce({}).mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });
    expect(await consumeVolunteerRegistrationRateLimit(ip, email)).toBe(false);
    expect(statements()).toEqual(['BEGIN', 'DELETE', 'INSERT', 'INSERT', 'ROLLBACK']);
    expect(state.release).toHaveBeenCalledOnce();
  });

  it('uses an inclusive one-hour expiry and resets the timestamp and count for both buckets', async () => {
    expect(await consumeVolunteerRegistrationRateLimit(ip, email)).toBe(true);
    const expiry = "window_started_at <= now() - ($2 * interval '1 second')";
    for (const [sql, params] of state.query.mock.calls.slice(2, 4)) {
      expect(params[1]).toBe(3600);
      expect(sql).toContain(`WHEN app.volunteer_registration_rate_limits.${expiry} THEN now()`);
      expect(sql).toContain(`WHEN app.volunteer_registration_rate_limits.${expiry} THEN 1`);
      expect(sql).toContain(`WHERE app.volunteer_registration_rate_limits.${expiry}`);
    }
  });

  it('uses the same bucket for an IPv4 address and its IPv4-mapped IPv6 form', async () => {
    await consumeVolunteerRegistrationRateLimit(ip, email);
    const ipv4Hash = state.query.mock.calls[2][1][0];
    state.query.mockClear();

    await consumeVolunteerRegistrationRateLimit('::ffff:203.0.113.9', email);
    expect(state.query.mock.calls[2][1][0]).toEqual(ipv4Hash);
  });

  it('canonicalizes native IPv6 before hashing', async () => {
    await consumeVolunteerRegistrationRateLimit('  2001:0DB8:0000:0000:0000:0000:0000:0001  ', email);
    expect(state.query.mock.calls[2][1][0]).toEqual(digest('ip', '2001:db8::1'));
  });

  it('fails closed for invalid client IPs', async () => {
    await expect(consumeVolunteerRegistrationRateLimit('not-an-ip', email)).rejects.toMatchObject({
      status: 503,
      code: 'INVITE_CONFIGURATION_ERROR',
    });
    expect(state.query).not.toHaveBeenCalled();
  });

  it('rolls back and sanitizes a database failure after the IP increment', async () => {
    state.query.mockResolvedValueOnce({}).mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1 }).mockRejectedValueOnce(new Error('private database failure'));
    await expect(consumeVolunteerRegistrationRateLimit(ip, email)).rejects.toMatchObject({
      status: 503,
      code: 'INVITE_CONFIGURATION_ERROR',
      message: 'Volunteer registration protection is unavailable.',
    });
    expect(statements()).toEqual(['BEGIN', 'DELETE', 'INSERT', 'INSERT', 'ROLLBACK']);
    expect(state.release).toHaveBeenCalledOnce();
  });
});
