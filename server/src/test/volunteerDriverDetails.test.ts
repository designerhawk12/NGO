import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Volunteers are crew members, not drivers. Driver records are NGO employee records created only
// from Assign Driver; Volunteer create/edit requests can no longer create or change drivers.
const { verify, findUser, invite, withTransaction, repo, drivers } = vi.hoisted(() => ({
  verify: vi.fn(), findUser: vi.fn(), invite: vi.fn(), withTransaction: vi.fn(),
  repo: {
    findAdminVolunteerConflict: vi.fn(),
    findVolunteerForAdminUpdate: vi.fn(), updateAdminVolunteerRows: vi.fn(),
    findVolunteerById: vi.fn(),
  },
  drivers: { getDriverDetailsForPerson: vi.fn() },
}));

vi.mock('../auth/supabase', () => ({ verifySupabaseToken: verify, inviteSupabaseUserByEmail: invite }));
vi.mock('../auth/appUsers', () => ({ findOrCreateAppUser: findUser }));
vi.mock('../db/pool', () => ({ withTransaction }));
vi.mock('../modules/volunteers/repository', () => repo);
vi.mock('../modules/vehicles/driverProfiles', () => drivers);

import { app } from '../app';

const volunteerId = '7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5';
const personId = '44bada71-76fd-41ad-a1af-b2cd9f2df902';
const actor = { id: '76b128ea-58d8-4d81-a031-74018056dcf5', authUserId: '076f89a1-77a8-44de-bef3-189291a0f331', role: 'ADMIN', displayName: 'Coordinator' };
const auth = { Authorization: 'Bearer verified-token' };
const details = { licenceNumber: 'KA01202000123', licenceExpiresOn: '2028-12-31', vehicleRegistrationNumber: 'KA01AB1234' };
const legacyDriver = { ...details, driverId: '5a0bd904-9215-4eec-9186-1f6132549203', status: 'ACTIVE', additionalVehicleCount: 0 };
const profile = { id: volunteerId, person_id: personId, registration_code: 'VOL-020', skills: ['Packing'], status: 'ACTIVE', name: 'Applicant', phone_e164: null };

beforeEach(() => {
  vi.resetAllMocks();
  verify.mockResolvedValue({ authUserId: actor.authUserId, email: 'admin@example.test' });
  findUser.mockResolvedValue(actor);
  withTransaction.mockImplementation(async (run: (client: unknown) => Promise<unknown>) => run({}));
  repo.findAdminVolunteerConflict.mockResolvedValue(null);
  repo.findVolunteerForAdminUpdate.mockResolvedValue(profile);
  repo.updateAdminVolunteerRows.mockImplementation(async (_row: unknown, input: { skills?: string[] }) => ({ ...profile, skills: input.skills ?? profile.skills }));
  repo.findVolunteerById.mockResolvedValue(profile);
  drivers.getDriverDetailsForPerson.mockResolvedValue(legacyDriver);
});

describe('Volunteers cannot become NGO drivers', () => {
  it('does not create Volunteer drivers through the retired Add Volunteer endpoint', async () => {
    const result = await request(app).post('/api/v1/volunteers').set(auth)
      .send({ email: 'driver@example.test', name: 'Applicant', registrationCode: 'VOL-020', skills: ['Driver'], driverDetails: details });
    expect(result.status).toBe(410);
    expect(invite).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('rejects driver licence, vehicle and driver status fields on Volunteer edits', async () => {
    for (const body of [
      { driverDetails: details },
      { driverStatus: 'ACTIVE' },
      { skills: ['Driver'], driverDetails: details },
    ]) {
      const result = await request(app).patch(`/api/v1/volunteers/${volunteerId}`).set(auth).send(body);
      expect(result.status).toBe(400);
    }
    expect(repo.updateAdminVolunteerRows).not.toHaveBeenCalled();
  });

  it('treats a Driving skill as crew metadata only and never reads or writes driver records', async () => {
    const result = await request(app).patch(`/api/v1/volunteers/${volunteerId}`).set(auth)
      .send({ skills: ['Driving', 'Packing'] });
    expect(result.status).toBe(200);
    expect(result.body.data.skills).toEqual(['Driving', 'Packing']);
    expect(drivers.getDriverDetailsForPerson).not.toHaveBeenCalled();
  });

  it('keeps historical Volunteer-linked driver details readable for Admins', async () => {
    const result = await request(app).get(`/api/v1/volunteers/${volunteerId}/driver-details`).set(auth);
    expect(result.status).toBe(200);
    expect(result.body.data.licenceNumber).toBe(details.licenceNumber);
    expect(drivers.getDriverDetailsForPerson).toHaveBeenCalledWith(personId);
  });
});
