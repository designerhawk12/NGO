import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/pool', () => ({ getPool: () => ({ query }) }));

import * as driverProfiles from '../modules/vehicles/driverProfiles';

const personId = '44bada71-76fd-41ad-a1af-b2cd9f2df902';
const driverId = '5a0bd904-9215-4eec-9186-1f6132549203';
const input = { licenceNumber: 'KA01202000123', licenceExpiresOn: '2028-12-31', vehicleRegistrationNumber: 'KA01AB1234' };

beforeEach(() => { vi.resetAllMocks(); });

describe('historical Volunteer-linked driver details', () => {
  it('reads only the requested person without touching Volunteer approval', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: driverId, licence_number: input.licenceNumber, licence_expires_on: input.licenceExpiresOn,
      registration_number: input.vehicleRegistrationNumber, vehicle_count: 3, status: 'ACTIVE',
    }] });
    expect(await driverProfiles.getDriverDetailsForPerson(personId)).toMatchObject({ ...input, driverId, status: 'ACTIVE', additionalVehicleCount: 2 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('WHERE d.person_id = $1');
    expect(query.mock.calls[0][0]).not.toContain('app.volunteer_applications');
  });

  it('returns null when the person has no driver record', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await driverProfiles.getDriverDetailsForPerson(personId)).toBeNull();
  });

  it('no longer exposes Volunteer-form driver writes', () => {
    expect(Object.keys(driverProfiles)).toEqual(['getDriverDetailsForPerson']);
  });
});
