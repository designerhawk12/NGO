import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { verify, findUser, invite, withTransaction, repo, drivers } = vi.hoisted(() => ({
  verify: vi.fn(), findUser: vi.fn(), invite: vi.fn(), withTransaction: vi.fn(),
  repo: {
    findAdminVolunteerConflict: vi.fn(), insertInvitedVolunteer: vi.fn(),
    findVolunteerForAdminUpdate: vi.fn(), updateAdminVolunteerRows: vi.fn(),
    findVolunteerById: vi.fn(),
  },
  drivers: {
    assertDriverDetailsAvailable: vi.fn(), getDriverDetailsForPerson: vi.fn(),
    saveDriverDetailsForPerson: vi.fn(), setDriverStatusForPerson: vi.fn(),
  },
}));

vi.mock('../auth/supabase', () => ({ verifySupabaseToken: verify, inviteSupabaseUserByEmail: invite }));
vi.mock('../auth/appUsers', () => ({ findOrCreateAppUser: findUser }));
vi.mock('../db/pool', () => ({ withTransaction }));
vi.mock('../modules/volunteers/repository', () => repo);
vi.mock('../modules/vehicles/driverProfiles', () => drivers);

import { HttpError } from '../middleware/errorHandler';
import { app } from '../app';

const volunteerId = '7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5';
const personId = '44bada71-76fd-41ad-a1af-b2cd9f2df902';
const actor = { id: '76b128ea-58d8-4d81-a031-74018056dcf5', authUserId: '076f89a1-77a8-44de-bef3-189291a0f331', role: 'ADMIN', displayName: 'Coordinator' };
const auth = { Authorization: 'Bearer verified-token' };
const details = { licenceNumber: 'KA01202000123', licenceExpiresOn: '2028-12-31', vehicleRegistrationNumber: 'KA01AB1234' };
const driver = { ...details, driverId: '5a0bd904-9215-4eec-9186-1f6132549203', status: 'ACTIVE', additionalVehicleCount: 0 };
const profile = { id: volunteerId, person_id: personId, registration_code: 'VOL-020', skills: ['Driver'], status: 'ACTIVE', name: 'Applicant', phone_e164: null };
const create = { email: 'driver@example.test', name: 'Applicant', registrationCode: 'VOL-020', skills: ['Driver'], driverDetails: details };

beforeEach(() => {
  vi.resetAllMocks();
  verify.mockResolvedValue({ authUserId: actor.authUserId, email: 'admin@example.test' });
  findUser.mockResolvedValue(actor);
  invite.mockResolvedValue({ authUserId: '8d253313-d824-47a1-83dd-5f7dc5c84f60' });
  withTransaction.mockImplementation(async (run: (client: unknown) => Promise<unknown>) => run({}));
  repo.findAdminVolunteerConflict.mockResolvedValue(null);
  repo.insertInvitedVolunteer.mockResolvedValue(profile);
  repo.findVolunteerForAdminUpdate.mockResolvedValue(profile);
  repo.updateAdminVolunteerRows.mockResolvedValue(profile);
  repo.findVolunteerById.mockResolvedValue(profile);
  drivers.getDriverDetailsForPerson.mockResolvedValue(driver);
});

describe('Admin Volunteer driver details', () => {
  it('creates one canonical driver link when the Admin adds a Driver', async () => {
    const result = await request(app).post('/api/v1/volunteers').set(auth).send(create);
    expect(result.status).toBe(201);
    expect(drivers.assertDriverDetailsAvailable).toHaveBeenCalledWith(details);
    expect(drivers.saveDriverDetailsForPerson).toHaveBeenCalledWith(personId, details, 'ACTIVE', expect.anything());
    expect(JSON.stringify(result.body)).not.toContain(details.licenceNumber);
  });

  it('rejects missing driver details before inviting anyone', async () => {
    for (const body of [
      { ...create, driverDetails: undefined },
      { ...create, driverDetails: { ...details, licenceNumber: '' } },
      { ...create, driverDetails: { ...details, vehicleRegistrationNumber: '' } },
      { ...create, driverDetails: { ...details, licenceExpiresOn: '' } },
    ]) {
      expect((await request(app).post('/api/v1/volunteers').set(auth).send(body)).status).toBe(400);
    }
    expect(invite).not.toHaveBeenCalled();
  });

  it('preserves the existing non-driver creation flow without driver fields', async () => {
    const result = await request(app).post('/api/v1/volunteers').set(auth)
      .send({ ...create, skills: ['Packing'], driverDetails: undefined });
    expect(result.status).toBe(201);
    expect(drivers.assertDriverDetailsAvailable).not.toHaveBeenCalled();
    expect(drivers.saveDriverDetailsForPerson).not.toHaveBeenCalled();
  });

  it('edits driver details and status independently of Volunteer approval', async () => {
    const result = await request(app).patch(`/api/v1/volunteers/${volunteerId}`).set(auth)
      .send({ driverDetails: { ...details, licenceNumber: 'KA01202000999' }, driverStatus: 'INACTIVE' });
    expect(result.status).toBe(200);
    expect(drivers.saveDriverDetailsForPerson).toHaveBeenCalledWith(
      personId, { ...details, licenceNumber: 'KA01202000999' }, 'INACTIVE', expect.anything()
    );
    expect(repo.updateAdminVolunteerRows).not.toHaveBeenCalled();
    expect(JSON.stringify(result.body)).not.toContain('volunteerApplicationStatus');
  });

  it('rejects duplicate licence or vehicle links before sending an invitation', async () => {
    drivers.assertDriverDetailsAvailable.mockRejectedValueOnce(
      new HttpError(409, 'DRIVER_LICENCE_CONFLICT', 'This driving licence is already registered.')
    );
    const result = await request(app).post('/api/v1/volunteers').set(auth).send(create);
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('DRIVER_LICENCE_CONFLICT');
    expect(invite).not.toHaveBeenCalled();
  });

  it('requires explicit deactivation when removing Driver and retains its details', async () => {
    const path = `/api/v1/volunteers/${volunteerId}`;
    const refused = await request(app).patch(path).set(auth).send({ skills: ['Packing'] });
    expect(refused.status).toBe(400);
    expect(repo.updateAdminVolunteerRows).not.toHaveBeenCalled();
    const accepted = await request(app).patch(path).set(auth).send({ skills: ['Packing'], driverStatus: 'INACTIVE' });
    expect(accepted.status).toBe(200);
    expect(drivers.setDriverStatusForPerson).toHaveBeenCalledWith(personId, 'INACTIVE', expect.anything());
    expect(drivers.saveDriverDetailsForPerson).not.toHaveBeenCalled();
  });

  it('changes only driver status when no Volunteer fields changed', async () => {
    const result = await request(app).patch(`/api/v1/volunteers/${volunteerId}`).set(auth)
      .send({ driverStatus: 'INACTIVE' });
    expect(result.status).toBe(200);
    expect(drivers.setDriverStatusForPerson).toHaveBeenCalledWith(personId, 'INACTIVE', expect.anything());
    expect(repo.updateAdminVolunteerRows).not.toHaveBeenCalled();
  });

  it('allows only Admin to read full driver details', async () => {
    const path = `/api/v1/volunteers/${volunteerId}/driver-details`;
    expect((await request(app).get(path)).status).toBe(401);
    findUser.mockResolvedValueOnce({ ...actor, role: 'VOLUNTEER', volunteerApplicationStatus: 'APPROVED' });
    expect((await request(app).get(path).set(auth)).status).toBe(403);
    findUser.mockResolvedValueOnce({ ...actor, role: 'DONOR' });
    expect((await request(app).get(path).set(auth)).status).toBe(403);
    const result = await request(app).get(path).set(auth);
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.data).toMatchObject(driver);
  });

  it('does not grant Volunteer or Donor accounts driver write access', async () => {
    for (const role of ['VOLUNTEER', 'DONOR']) {
      const user = { ...actor, role, ...(role === 'VOLUNTEER' ? { volunteerApplicationStatus: 'APPROVED' } : {}) };
      findUser.mockResolvedValueOnce(user);
      expect((await request(app).post('/api/v1/volunteers').set(auth).send(create)).status).toBe(403);
      findUser.mockResolvedValueOnce(user);
      expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}`).set(auth)
        .send({ driverStatus: 'INACTIVE' })).status).toBe(403);
    }
    expect(invite).not.toHaveBeenCalled();
    expect(drivers.saveDriverDetailsForPerson).not.toHaveBeenCalled();
  });

  it('returns a clean null driver detail for a non-driver Volunteer', async () => {
    drivers.getDriverDetailsForPerson.mockResolvedValueOnce(null);
    const result = await request(app).get(`/api/v1/volunteers/${volunteerId}/driver-details`).set(auth);
    expect(result.status).toBe(200);
    expect(result.body.data).toBeNull();
  });
});
