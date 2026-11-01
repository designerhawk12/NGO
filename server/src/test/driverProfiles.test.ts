import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/pool', () => ({ getPool: () => ({ query }) }));

import { assertDriverDetailsAvailable, getDriverDetailsForPerson, saveDriverDetailsForPerson, setDriverStatusForPerson } from '../modules/vehicles/driverProfiles';

const personId = '44bada71-76fd-41ad-a1af-b2cd9f2df902';
const vehicleId = '7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5';
const driverId = '5a0bd904-9215-4eec-9186-1f6132549203';
const input = { licenceNumber: 'KA01202000123', licenceExpiresOn: '2028-12-31', vehicleRegistrationNumber: 'KA01AB1234' };
const client = { query } as never;

beforeEach(() => { vi.resetAllMocks(); });

describe('canonical driver persistence', () => {
  it('inserts one driver for the volunteer person and links the registered vehicle', async () => {
    query.mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: vehicleId, assigned_driver_id: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: driverId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await saveDriverDetailsForPerson(personId, input, 'ACTIVE', client);
    expect(query.mock.calls[3][0]).toContain('INSERT INTO app.drivers(person_id');
    expect(query.mock.calls[3][1]).toEqual([personId, input.licenceNumber, input.licenceExpiresOn, 'ACTIVE']);
    expect(query.mock.calls[5][0]).toContain('UPDATE app.vehicles SET assigned_driver_id = $2');
    expect(query.mock.calls[5][1]).toEqual([vehicleId, driverId]);
  });

  it('updates an existing driver instead of creating a duplicate record', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: driverId }] })
      .mockResolvedValueOnce({ rows: [{ id: vehicleId, assigned_driver_id: driverId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: driverId }] });
    await saveDriverDetailsForPerson(personId, input, 'INACTIVE', client);
    expect(query.mock.calls[3][0]).toContain('UPDATE app.drivers SET');
    expect(query.mock.calls.some(call => String(call[0]).includes('INSERT INTO app.drivers'))).toBe(false);
    expect(query.mock.calls.some(call => String(call[0]).includes('SET assigned_driver_id = NULL'))).toBe(false);
  });

  it('preserves multiple existing vehicle links and rejects replacing them from the Volunteer form', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: driverId }] })
      .mockResolvedValueOnce({ rows: [{ id: vehicleId, assigned_driver_id: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 2 }] });
    await expect(saveDriverDetailsForPerson(personId, input, 'ACTIVE', client)).rejects.toMatchObject({
      code: 'MULTIPLE_DRIVER_VEHICLES', status: 409,
    });
    expect(query.mock.calls.some(call => String(call[0]).startsWith('UPDATE app.vehicles'))).toBe(false);
  });

  it('rejects a vehicle assigned to another driver without changing records', async () => {
    query.mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: vehicleId, assigned_driver_id: 'other-driver' }] });
    await expect(saveDriverDetailsForPerson(personId, input, 'ACTIVE', client)).rejects.toMatchObject({
      code: 'VEHICLE_DRIVER_CONFLICT', status: 409,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('preflights unknown vehicles and duplicate licences before an Auth invitation', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(assertDriverDetailsAvailable(input)).rejects.toMatchObject({ code: 'VEHICLE_NOT_FOUND' });
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [{ id: vehicleId, assigned_driver_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: driverId }] });
    await expect(assertDriverDetailsAvailable(input)).rejects.toMatchObject({ code: 'DRIVER_LICENCE_CONFLICT' });
  });

  it('rejects ambiguous case-insensitive vehicle registrations', async () => {
    query.mockResolvedValueOnce({ rows: [
      { id: vehicleId, assigned_driver_id: null },
      { id: '7bd51dd4-0dc9-449e-88c0-2f622efaa1bc', assigned_driver_id: null },
    ] });
    await expect(assertDriverDetailsAvailable(input)).rejects.toMatchObject({
      code: 'VEHICLE_REGISTRATION_AMBIGUOUS', status: 409,
    });
  });

  it('reads only the requested person and changes status without touching Volunteer approval', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: driverId, licence_number: input.licenceNumber, licence_expires_on: input.licenceExpiresOn,
      registration_number: input.vehicleRegistrationNumber, vehicle_count: 3, status: 'ACTIVE',
    }] }).mockResolvedValueOnce({ rowCount: 1 });
    expect(await getDriverDetailsForPerson(personId)).toMatchObject({ ...input, driverId, status: 'ACTIVE', additionalVehicleCount: 2 });
    await setDriverStatusForPerson(personId, 'INACTIVE', client);
    expect(query.mock.calls[0][0]).toContain('WHERE d.person_id = $1');
    expect(query.mock.calls[1][0]).toContain('UPDATE app.drivers SET status');
    expect(query.mock.calls[1][0]).not.toContain('app.volunteer_applications');
  });
});
