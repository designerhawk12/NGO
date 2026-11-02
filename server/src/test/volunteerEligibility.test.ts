import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import type { VolunteerPort } from '../modules/pickups/ports';

const { findVolunteerIdentityById, listEligibleVolunteerRows, findWindowAvailability } = vi.hoisted(() => ({
  findVolunteerIdentityById: vi.fn(),
  listEligibleVolunteerRows: vi.fn(),
  findWindowAvailability: vi.fn(),
}));
vi.mock('../modules/volunteers/repository', () => ({
  findVolunteerIdentityById, listEligibleVolunteerRows, findWindowAvailability,
}));

import { assertVolunteerAssignable, getVolunteerById, listEligibleVolunteers } from '../modules/volunteers/service';
import { DefaultVolunteerReadPort } from '../modules/volunteers/port';

const volunteerId = '7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5';
const otherVolunteerId = '44bada71-76fd-41ad-a1af-b2cd9f2df902';
const teamId = '8d253313-d824-47a1-83dd-5f7dc5c84f60';
const personId = 'f50a3e0e-9f8c-4293-bb2b-fc55e4b3d3d8';
const startAt = new Date('2026-11-01T10:00:00Z');
const endAt = new Date('2026-11-01T12:00:00Z');
const client = {} as PoolClient;
const identity = { id: volunteerId, person_id: personId, status: 'ACTIVE' };
const window = { ...identity, is_available: true };

beforeEach(() => {
  vi.clearAllMocks();
  findVolunteerIdentityById.mockResolvedValue(identity);
  listEligibleVolunteerRows.mockResolvedValue([identity]);
  findWindowAvailability.mockResolvedValue(window);
});

describe('Volunteer module read and eligibility port', () => {
  it('returns a minimal identity and recognizes an eligible volunteer without a write', async () => {
    expect(await getVolunteerById(volunteerId, client)).toEqual({ id: volunteerId, personId, status: 'ACTIVE' });
    expect(findVolunteerIdentityById).toHaveBeenCalledWith(volunteerId, client);
    const result = await assertVolunteerAssignable({ volunteerId, startAt, endAt }, client);
    expect(result).toEqual({ id: volunteerId, personId, status: 'ACTIVE', isAvailable: true });
    expect(findWindowAvailability).toHaveBeenCalledWith(volunteerId, startAt, endAt, client);
    const port: VolunteerPort = new DefaultVolunteerReadPort();
    expect(await port.getVolunteerAvailability(volunteerId, startAt, endAt, client)).toEqual(result);
  });

  it('rejects a volunteer without a covering AVAILABLE interval', async () => {
    findWindowAvailability.mockResolvedValue({ ...window, is_available: false });
    await expect(assertVolunteerAssignable({ volunteerId, startAt, endAt })).rejects.toMatchObject({ status: 409, code: 'RESOURCE_CONFLICT' });
    listEligibleVolunteerRows.mockResolvedValue([]);
    expect(await listEligibleVolunteers({ startAt, endAt })).toEqual([]);
  });

  it('preserves exact UTC instants across a local calendar-date boundary', async () => {
    const startsAtBoundary = new Date('2026-10-29T00:30:00.000Z');
    const endsAtBoundary = new Date('2026-10-29T01:30:00.000Z');
    findWindowAvailability.mockResolvedValue(window);

    await expect(assertVolunteerAssignable({
      volunteerId,
      startAt: startsAtBoundary,
      endAt: endsAtBoundary,
    })).resolves.toMatchObject({ isAvailable: true });

    expect(findWindowAvailability).toHaveBeenCalledWith(volunteerId, startsAtBoundary, endsAtBoundary, undefined);
  });

  it('rejects an inactive volunteer even if an availability slot exists', async () => {
    findWindowAvailability.mockResolvedValue({ ...window, status: 'INACTIVE' });
    await expect(assertVolunteerAssignable({ volunteerId, startAt, endAt })).rejects.toMatchObject({ status: 409, code: 'RESOURCE_CONFLICT' });
    listEligibleVolunteerRows.mockResolvedValue([{ ...identity, status: 'INACTIVE' }]);
    expect(await listEligibleVolunteers({ startAt, endAt })).toEqual([]);
  });

  it.todo('excludes an unapproved volunteer once an approved volunteer approval field exists');

  it('returns null or 404 for a missing volunteer', async () => {
    findVolunteerIdentityById.mockResolvedValue(null);
    findWindowAvailability.mockResolvedValue(null);
    expect(await getVolunteerById(volunteerId)).toBeNull();
    await expect(assertVolunteerAssignable({ volunteerId, startAt, endAt })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('passes an approved team filter and returns only eligible team members', async () => {
    listEligibleVolunteerRows.mockImplementation(async (_start: Date, _end: Date, filter: string | undefined) => filter === teamId ? [identity] : [identity, { ...identity, id: otherVolunteerId }]);
    const filtered = await listEligibleVolunteers({ startAt, endAt, teamId }, client);
    expect(filtered).toEqual([{ id: volunteerId, personId, status: 'ACTIVE', isAvailable: true }]);
    expect(listEligibleVolunteerRows).toHaveBeenCalledWith(startAt, endAt, teamId, client);
  });

  it('rejects malformed IDs, invalid windows and an invalid team filter before querying', async () => {
    await expect(getVolunteerById('bad')).rejects.toMatchObject({ status: 400 });
    await expect(assertVolunteerAssignable({ volunteerId, startAt: endAt, endAt: startAt })).rejects.toMatchObject({ status: 400 });
    await expect(listEligibleVolunteers({ startAt: new Date('bad'), endAt })).rejects.toMatchObject({ status: 400 });
    await expect(listEligibleVolunteers({ startAt, endAt, teamId: 'bad' })).rejects.toMatchObject({ status: 400 });
    expect(findVolunteerIdentityById).not.toHaveBeenCalled();
    expect(findWindowAvailability).not.toHaveBeenCalled();
    expect(listEligibleVolunteerRows).not.toHaveBeenCalled();
  });
});
