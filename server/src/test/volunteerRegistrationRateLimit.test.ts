import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  secret: 'private-test-only-secret',
}));

vi.mock('../db/pool', () => ({
  withTransaction: state.withTransaction,
}));
vi.mock('../config/env', () => ({
  env: { supabaseSecretKey: state.secret },
}));

import { consumeVolunteerRegistrationRateLimit } from '../modules/volunteers/registrationRateLimit';

beforeEach(() => {
  state.query.mockReset().mockResolvedValue({ rowCount: 1, rows: [{ attempt_count: 1 }] });
  state.withTransaction.mockReset().mockImplementation(async (run: (client: { query: typeof state.query }) => Promise<unknown>) => run({ query: state.query }));
});

describe('durable Volunteer registration rate limit', () => {
  it('uses two keyed digests and enforces IP and email buckets transactionally', async () => {
    expect(await consumeVolunteerRegistrationRateLimit('203.0.113.9', ' Applicant@Example.test ')).toBe(true);
    expect(state.withTransaction).toHaveBeenCalledOnce();
    expect(state.query).toHaveBeenCalledTimes(3);
    const ipHash = state.query.mock.calls[1][1][0] as Buffer;
    const emailHash = state.query.mock.calls[2][1][0] as Buffer;
    expect(ipHash).toHaveLength(32);
    expect(emailHash).toHaveLength(32);
    expect(ipHash).not.toEqual(emailHash);
    expect(ipHash.toString()).not.toContain('203.0.113.9');
    expect(emailHash.toString()).not.toContain('applicant@example.test');
    expect(state.query.mock.calls[1][1].slice(1)).toEqual([3600, 5]);
    expect(state.query.mock.calls[2][1].slice(1)).toEqual([86400, 1]);
  });

  it('blocks before email invitation when the IP bucket is exhausted', async () => {
    state.query.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });
    expect(await consumeVolunteerRegistrationRateLimit('203.0.113.9', 'applicant@example.test')).toBe(false);
    expect(state.query).toHaveBeenCalledTimes(2);
  });

  it('counts the IP request but blocks a repeated address within the email window', async () => {
    state.query.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });
    expect(await consumeVolunteerRegistrationRateLimit('203.0.113.9', 'applicant@example.test')).toBe(false);
    expect(state.query).toHaveBeenCalledTimes(3);
  });

  it('normalizes IPv4-mapped IPv6 to the same keyed bucket', async () => {
    await consumeVolunteerRegistrationRateLimit('::ffff:203.0.113.9', 'applicant@example.test');
    const mappedHash = state.query.mock.calls[1][1][0];
    state.query.mockClear();
    await consumeVolunteerRegistrationRateLimit('203.0.113.9', 'applicant@example.test');
    expect(state.query.mock.calls[1][1][0]).toEqual(mappedHash);
  });

  it('fails closed for invalid client IPs', async () => {
    await expect(consumeVolunteerRegistrationRateLimit('not-an-ip', 'applicant@example.test')).rejects.toMatchObject({
      code: 'INVITE_CONFIGURATION_ERROR',
    });
    expect(state.withTransaction).not.toHaveBeenCalled();
  });

  it('fails closed with a sanitized error when the durable limiter cannot be read or written', async () => {
    state.query.mockRejectedValueOnce(new Error('private database failure'));
    await expect(consumeVolunteerRegistrationRateLimit('203.0.113.9', 'applicant@example.test')).rejects.toMatchObject({
      status: 503,
      code: 'INVITE_CONFIGURATION_ERROR',
    });
  });
});
