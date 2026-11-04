import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { verify, findUser, invite, getEmail, withTransaction, consumeRateLimit, repo } = vi.hoisted(() => ({
  verify: vi.fn(),
  findUser: vi.fn(),
  invite: vi.fn(),
  getEmail: vi.fn(),
  withTransaction: vi.fn(),
  consumeRateLimit: vi.fn(),
  repo: {
    findAdminVolunteerConflict: vi.fn(),
    insertInvitedVolunteer: vi.fn(),
    insertSelfRegisteredVolunteer: vi.fn(),
    listPendingVolunteerApplications: vi.fn(),
    findVolunteerApplicationForUpdate: vi.fn(),
    setVolunteerApplicationDecision: vi.fn(),
    findByAppUserId: vi.fn(),
  },
}));

vi.mock('../auth/supabase', () => ({
  verifySupabaseToken: verify,
  inviteSupabaseUserByEmail: invite,
  getSupabaseUserEmail: getEmail,
  setVolunteerPassword: vi.fn(),
}));
vi.mock('../auth/appUsers', () => ({ findOrCreateAppUser: findUser }));
vi.mock('../db/pool', () => ({ withTransaction }));
vi.mock('../modules/volunteers/registrationRateLimit', () => ({ consumeVolunteerRegistrationRateLimit: consumeRateLimit }));
vi.mock('../modules/volunteers/repository', () => repo);

import { HttpError } from '../middleware/errorHandler';
import { app } from '../app';

const admin = {
  id: '76b128ea-58d8-4d81-a031-74018056dcf5',
  authUserId: '076f89a1-77a8-44de-bef3-189291a0f331',
  role: 'ADMIN',
  displayName: 'Coordinator',
};
const volunteerId = '7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5';
const volunteerActor = {
  id: '44bada71-76fd-41ad-a1af-b2cd9f2df902',
  authUserId: '8d253313-d824-47a1-83dd-5f7dc5c84f60',
  role: 'VOLUNTEER',
  displayName: 'Applicant',
  volunteerApplicationStatus: 'APPROVED',
};
const auth = { Authorization: 'Bearer verified-token' };
const registration = {
  email: '  applicant@example.test ',
  name: ' Applicant Person ',
  phoneE164: '+919876543210',
  registrationCode: ' VOL-020 ',
  skills: ['Food Handling'],
};
const applicationId = '8d253313-d824-47a1-83dd-5f7dc5c84f60';
const applicationRow = {
  application_id: applicationId,
  volunteer_id: volunteerId,
  auth_user_id: volunteerActor.authUserId,
  name: 'Applicant Person',
  phone_e164: '+919876543210',
  registration_code: 'VOL-020',
  skills: ['Food Handling'],
  status: 'PENDING',
  submitted_at: new Date('2026-11-01T08:30:00.000Z'),
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('PUBLIC_VOLUNTEER_REGISTRATION_ENABLED', 'true');
  verify.mockResolvedValue({ authUserId: admin.authUserId, email: 'admin@example.test' });
  findUser.mockResolvedValue(admin);
  invite.mockResolvedValue({ authUserId: volunteerActor.authUserId, inviteNonce: 'safe-test-nonce' });
  consumeRateLimit.mockResolvedValue(true);
  getEmail.mockResolvedValue('applicant@example.test');
  repo.findAdminVolunteerConflict.mockResolvedValue(null);
  repo.insertSelfRegisteredVolunteer.mockResolvedValue({
    id: volunteerId, person_id: volunteerActor.id, registration_code: 'VOL-020',
    name: 'Applicant Person', phone_e164: '+919876543210', skills: ['Food Handling'], status: 'INACTIVE',
  });
  repo.insertInvitedVolunteer.mockResolvedValue({
    id: volunteerId, person_id: volunteerActor.id, registration_code: 'VOL-020',
    name: 'Applicant Person', phone_e164: null, skills: [], status: 'ACTIVE',
  });
  repo.listPendingVolunteerApplications.mockResolvedValue({ rows: [applicationRow], nextCursor: null });
  repo.findVolunteerApplicationForUpdate.mockResolvedValue({ id: applicationId, volunteer_id: volunteerId, status: 'PENDING', app_user_role: 'VOLUNTEER' });
  repo.setVolunteerApplicationDecision.mockImplementation(async (_id: string, status: string) => ({ id: applicationId, volunteer_id: volunteerId, status }));
  withTransaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => callback({}));
});

afterEach(() => vi.unstubAllEnvs());

describe('Volunteer self-registration', () => {
  it('is disabled by default before validation, database access, or email invitation', async () => {
    vi.stubEnv('PUBLIC_VOLUNTEER_REGISTRATION_ENABLED', undefined);
    const result = await request(app).post('/api/v1/volunteers/register').send({ email: 'invalid' });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('REGISTRATION_DISABLED');
    expect(invite).not.toHaveBeenCalled();
    expect(repo.findAdminVolunteerConflict).not.toHaveBeenCalled();
    expect(repo.insertSelfRegisteredVolunteer).not.toHaveBeenCalled();
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it('does not enable registration for values other than the exact word true', async () => {
    for (const value of ['false', 'TRUE', '1']) {
      vi.stubEnv('PUBLIC_VOLUNTEER_REGISTRATION_ENABLED', value);
      const result = await request(app).post('/api/v1/volunteers/register').send(registration);
      expect(result.status).toBe(403);
    }
    expect(invite).not.toHaveBeenCalled();
  });

  it('keeps authenticated Admin invitations working when public registration is disabled', async () => {
    vi.stubEnv('PUBLIC_VOLUNTEER_REGISTRATION_ENABLED', 'false');
    const result = await request(app).post('/api/v1/volunteers').set(auth).send({
      email: 'applicant@example.test', name: 'Applicant Person', registrationCode: 'VOL-020',
    });
    expect(result.status).toBe(201);
    expect(invite).toHaveBeenCalledWith('applicant@example.test', 'Applicant Person');
    expect(repo.insertInvitedVolunteer).toHaveBeenCalledTimes(1);
    expect(repo.insertSelfRegisteredVolunteer).not.toHaveBeenCalled();
  });

  it('sends the existing invite and creates a pending application with server-owned account role', async () => {
    const result = await request(app).post('/api/v1/volunteers/register').send(registration);
    expect(result.status).toBe(201);
    expect(consumeRateLimit).toHaveBeenCalledWith(expect.any(String), 'applicant@example.test');
    expect(invite).toHaveBeenCalledWith('applicant@example.test', 'Applicant Person');
    expect(repo.insertSelfRegisteredVolunteer).toHaveBeenCalledWith(volunteerActor.authUserId, {
      email: 'applicant@example.test', name: 'Applicant Person', phoneE164: '+919876543210',
      skills: ['Food Handling'],
    }, expect.anything());
    expect(result.body.data.status).toBe('PENDING');
    expect(result.body.data.message).toBe('Application submitted successfully. Your Volunteer account is awaiting administrator approval.');
    expect(JSON.stringify(result.body)).not.toContain('authUserId');
    expect(JSON.stringify(result.body)).not.toContain('safe-test-nonce');
  });

  it('accepts registration without an internal code and lets the server create the code', async () => {
    const { registrationCode: _legacyCode, ...publicInput } = registration;
    const result = await request(app).post('/api/v1/volunteers/register').send(publicInput);
    expect(result.status).toBe(201);
    expect(repo.insertSelfRegisteredVolunteer).toHaveBeenCalledWith(volunteerActor.authUserId, {
      email: 'applicant@example.test', name: 'Applicant Person', phoneE164: '+919876543210', skills: ['Food Handling'],
    }, expect.anything());
  });

  it('does not invite or create an application after the durable rate limit is reached', async () => {
    consumeRateLimit.mockResolvedValueOnce(false);
    const result = await request(app).post('/api/v1/volunteers/register').send(registration);
    expect(result.status).toBe(429);
    expect(result.body.error.code).toBe('INVITE_RATE_LIMITED');
    expect(invite).not.toHaveBeenCalled();
    expect(repo.findAdminVolunteerConflict).not.toHaveBeenCalled();
    expect(repo.insertSelfRegisteredVolunteer).not.toHaveBeenCalled();
  });

  it('rejects invalid, duplicate, and client-authoritative fields before sending an invitation', async () => {
    for (const body of [
      { ...registration, email: 'invalid' },
      { ...registration, name: ' ' },
      { ...registration, phoneE164: '9876543210' },
      { ...registration, registrationCode: ' ' },
      { ...registration, role: 'ADMIN' },
      { ...registration, authUserId: volunteerActor.authUserId },
      { ...registration, volunteerId },
      { ...registration, applicationStatus: 'APPROVED' },
    ]) {
      expect((await request(app).post('/api/v1/volunteers/register').send(body)).status).toBe(400);
    }
    expect(invite).not.toHaveBeenCalled();
    expect(repo.insertSelfRegisteredVolunteer).not.toHaveBeenCalled();
  });

  it('handles duplicate registration details and duplicate email without retrying or deleting Auth users', async () => {
    repo.findAdminVolunteerConflict.mockResolvedValueOnce('registrationCode');
    const conflict = await request(app).post('/api/v1/volunteers/register').send(registration);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('VOLUNTEER_REGISTRATION_CONFLICT');
    expect(invite).not.toHaveBeenCalled();

    invite.mockRejectedValueOnce(new HttpError(409, 'VOLUNTEER_ALREADY_EXISTS', 'email exists'));
    const duplicateEmail = await request(app).post('/api/v1/volunteers/register').send(registration);
    expect(duplicateEmail.status).toBe(409);
    expect(duplicateEmail.body.error.code).toBe('VOLUNTEER_REGISTRATION_CONFLICT');
    expect(JSON.stringify(duplicateEmail.body)).not.toContain('email exists');
    expect(repo.insertSelfRegisteredVolunteer).not.toHaveBeenCalled();
  });

  it('reports a safe recovery result if Auth invitation succeeds but database provisioning fails', async () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    repo.insertSelfRegisteredVolunteer.mockRejectedValueOnce(new Error('private database detail'));
    try {
      const result = await request(app).post('/api/v1/volunteers/register').send(registration);
      expect(result.status).toBe(503);
      expect(result.body.error.code).toBe('VOLUNTEER_REGISTRATION_REVIEW_REQUIRED');
      expect(JSON.stringify(result.body)).not.toContain('private database detail');
      expect(diagnostic).toHaveBeenCalledWith(JSON.stringify({ level: 'error', subsystem: 'VolunteerRegistration', code: 'REGISTRATION_REVIEW_REQUIRED' }));
    } finally { diagnostic.mockRestore(); }
  });
});

describe('Admin Volunteer application review', () => {
  it('lists pending applications with submitted fields and server-resolved email', async () => {
    const result = await request(app).get('/api/v1/volunteers/applications').set(auth);
    expect(result.status).toBe(200);
    expect(repo.listPendingVolunteerApplications).toHaveBeenCalledWith({ limit: 25 });
    expect(getEmail).toHaveBeenCalledWith(volunteerActor.authUserId);
    expect(result.body.data.items[0]).toMatchObject({
      volunteerId, email: 'applicant@example.test', name: 'Applicant Person',
      phoneE164: '+919876543210', registrationCode: 'VOL-020', skills: ['Food Handling'],
      applicationId, status: 'PENDING', submittedAt: '2026-11-01T08:30:00.000Z',
    });
    expect(JSON.stringify(result.body)).not.toContain('auth_user_id');
  });

  it('allows only an authenticated Admin to list or decide applications', async () => {
    expect((await request(app).get('/api/v1/volunteers/applications')).status).toBe(401);
    expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}/approval`).send({ status: 'APPROVED' })).status).toBe(401);
    for (const role of ['VOLUNTEER', 'DONOR']) {
      findUser.mockResolvedValueOnce({ ...admin, role, ...(role === 'VOLUNTEER' ? { volunteerApplicationStatus: 'APPROVED' } : {}) });
      expect((await request(app).get('/api/v1/volunteers/applications').set(auth)).status).toBe(403);
      findUser.mockResolvedValueOnce({ ...admin, role, ...(role === 'VOLUNTEER' ? { volunteerApplicationStatus: 'APPROVED' } : {}) });
      expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}/approval`).set(auth).send({ status: 'DENIED' })).status).toBe(403);
    }
    expect(repo.listPendingVolunteerApplications).not.toHaveBeenCalled();
    expect(repo.setVolunteerApplicationDecision).not.toHaveBeenCalled();
  });

  it('approves and denies only pending linked Volunteer applications and records the Admin actor', async () => {
    const approved = await request(app).patch(`/api/v1/volunteers/${volunteerId}/approval`).set(auth).send({ status: 'APPROVED' });
    expect(approved.status).toBe(200);
    expect(approved.body.data).toEqual({ volunteerId, status: 'APPROVED' });
    expect(repo.setVolunteerApplicationDecision).toHaveBeenCalledWith(volunteerId, 'APPROVED', admin.id, expect.anything());

    repo.findVolunteerApplicationForUpdate.mockResolvedValueOnce({ id: applicationId, volunteer_id: volunteerId, status: 'PENDING', app_user_role: 'VOLUNTEER' });
    const denied = await request(app).patch(`/api/v1/volunteers/${volunteerId}/approval`).set(auth).send({ status: 'DENIED' });
    expect(denied.status).toBe(200);
    expect(denied.body.data.status).toBe('DENIED');
    expect(repo.setVolunteerApplicationDecision).toHaveBeenCalledWith(volunteerId, 'DENIED', admin.id, expect.anything());
  });

  it('rejects malformed IDs/bodies, missing applications and already reviewed records', async () => {
    expect((await request(app).patch('/api/v1/volunteers/not-a-uuid/approval').set(auth).send({ status: 'APPROVED' })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}/approval`).set(auth).send({ status: 'PENDING' })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}/approval`).set(auth).send({ status: 'APPROVED', role: 'ADMIN' })).status).toBe(400);
    repo.findVolunteerApplicationForUpdate.mockResolvedValueOnce(null);
    expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}/approval`).set(auth).send({ status: 'APPROVED' })).status).toBe(404);
    repo.findVolunteerApplicationForUpdate.mockResolvedValueOnce({ id: applicationId, volunteer_id: volunteerId, status: 'DENIED', app_user_role: 'VOLUNTEER' });
    expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}/approval`).set(auth).send({ status: 'APPROVED' })).status).toBe(409);
    expect(repo.setVolunteerApplicationDecision).not.toHaveBeenCalled();
  });
});

describe('Volunteer approval authorization boundary', () => {
  it.each([
    ['PENDING', 'VOLUNTEER_PENDING_APPROVAL'],
    ['DENIED', 'VOLUNTEER_APPLICATION_DENIED'],
  ] as const)('blocks %s applicants from Volunteer and assignment routes', async (status, code) => {
    findUser.mockResolvedValue({ ...volunteerActor, volunteerApplicationStatus: status });
    for (const path of ['/api/v1/volunteers/me', '/api/v1/assignments/me']) {
      const result = await request(app).get(path).set(auth);
      expect(result.status).toBe(403);
      expect(result.body.error.code).toBe(code);
    }
    const statusChange = await request(app).patch(`/api/v1/assignments/${volunteerId}/status`).set(auth)
      .send({ action: 'ACCEPT', expectedVersion: 0 });
    expect(statusChange.status).toBe(403);
    expect(statusChange.body.error.code).toBe(code);
    expect(repo.findByAppUserId).not.toHaveBeenCalled();
  });

  it('lets an applicant read their own approval state from /me without granting Volunteer access', async () => {
    findUser.mockResolvedValue({ ...volunteerActor, volunteerApplicationStatus: 'PENDING' });
    const result = await request(app).get('/api/v1/me').set(auth);
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ role: 'VOLUNTEER', volunteerApplicationStatus: 'PENDING' });
  });

  it('preserves protected access for legacy Admin-created Volunteers without an application row', async () => {
    findUser.mockResolvedValue({ ...volunteerActor, volunteerApplicationStatus: null });
    repo.findByAppUserId.mockResolvedValue({
      id: volunteerId, person_id: '44bada71-76fd-41ad-a1af-b2cd9f2df902',
      registration_code: 'VOL-LEGACY', name: 'Legacy Volunteer', phone_e164: null,
      skills: [], status: 'ACTIVE',
    });
    const result = await request(app).get('/api/v1/volunteers/me').set(auth);
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ registrationCode: 'VOL-LEGACY', status: 'ACTIVE' });
  });
});
