import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { HttpError } from '../middleware/errorHandler'

const { verify, findUser, invite, revoke, setPassword, repo, withTransaction } = vi.hoisted(() => ({
  verify: vi.fn(), findUser: vi.fn(), invite: vi.fn(), revoke: vi.fn(), setPassword: vi.fn(), withTransaction: vi.fn(),
  repo: {
    findAdminVolunteerConflict: vi.fn(), insertInvitedVolunteer: vi.fn(),
    findVolunteerForAdminUpdate: vi.fn(), updateAdminVolunteerRows: vi.fn(), findVolunteerAuthAccountById: vi.fn(),
  },
}))
vi.mock('../auth/supabase', () => ({
  verifySupabaseToken: verify, inviteSupabaseUserByEmail: invite, revokeNewSupabaseInvite: revoke, setVolunteerPassword: setPassword,
}))
vi.mock('../auth/appUsers', () => ({ findOrCreateAppUser: findUser }))
vi.mock('../db/pool', () => ({ withTransaction }))
vi.mock('../modules/volunteers/repository', () => repo)

import { app } from '../app'

const authUserId = '076f89a1-77a8-44de-bef3-189291a0f331'
const volunteerId = '7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5'
const actor = { id: '76b128ea-58d8-4d81-a031-74018056dcf5', authUserId, role: 'ADMIN', displayName: null }
const row = {
  id: volunteerId, person_id: 'f50a3e0e-9f8c-4293-bb2b-fc55e4b3d3d8',
  registration_code: 'VOL-002', name: 'Kavya Iyer', phone_e164: '+919876543210',
  skills: ['Driving', 'Packing'], status: 'ACTIVE',
}
const createBody = {
  email: '  KAVYA@example.com  ', name: ' Kavya Iyer ', phoneE164: '+919876543210',
  registrationCode: ' VOL-002 ', skills: ['Driving', 'Packing'], status: 'ACTIVE',
}
const auth = { Authorization: 'Bearer verified-token' }

beforeEach(() => {
  vi.resetAllMocks()
  verify.mockResolvedValue({ authUserId, email: 'admin@example.test' })
  findUser.mockResolvedValue(actor)
  invite.mockResolvedValue({ authUserId: 'a0458efe-a4be-43da-a4ed-c290ac3b48cd', inviteNonce: 'nonce' })
  revoke.mockResolvedValue(true)
  repo.findAdminVolunteerConflict.mockResolvedValue(null)
  repo.findVolunteerAuthAccountById.mockResolvedValue({ auth_user_id: 'linked-volunteer-auth-id', app_user_role: 'VOLUNTEER', disabled_at: null })
  setPassword.mockResolvedValue(undefined)
  repo.insertInvitedVolunteer.mockResolvedValue(row)
  repo.findVolunteerForAdminUpdate.mockResolvedValue(row)
  repo.updateAdminVolunteerRows.mockImplementation(async (_row: unknown, input: Record<string, unknown>) => ({
    ...row, name: input.name ?? row.name, phone_e164: input.phoneE164 === undefined ? row.phone_e164 : input.phoneE164,
    registration_code: input.registrationCode ?? row.registration_code, skills: input.skills ?? row.skills,
    status: input.status ?? row.status,
  }))
  withTransaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => callback({}))
})

describe('ADMIN volunteer creation', () => {
  it('invites and provisions a canonical volunteer with server-owned identity', async () => {
    const result = await request(app).post('/api/v1/volunteers').set(auth).send(createBody)
    expect(result.status).toBe(201)
    expect(invite).toHaveBeenCalledWith('kavya@example.com', 'Kavya Iyer')
    expect(repo.insertInvitedVolunteer).toHaveBeenCalledWith(
      'a0458efe-a4be-43da-a4ed-c290ac3b48cd',
      { email: 'kavya@example.com', name: 'Kavya Iyer', phoneE164: '+919876543210', registrationCode: 'VOL-002', skills: ['Driving', 'Packing'], status: 'ACTIVE' },
      expect.anything()
    )
    expect(result.body.data).toEqual({ id: volunteerId, personId: row.person_id, registrationCode: 'VOL-002', name: 'Kavya Iyer', phoneE164: row.phone_e164, skills: row.skills, status: 'ACTIVE' })
    expect(JSON.stringify(result.body)).not.toContain('authUserId')
  })

  it('requires a verified ADMIN before side effects', async () => {
    expect((await request(app).post('/api/v1/volunteers').send(createBody)).status).toBe(401)
    verify.mockRejectedValueOnce(new HttpError(401, 'UNAUTHENTICATED', 'Invalid token.'))
    expect((await request(app).post('/api/v1/volunteers').set(auth).send(createBody)).status).toBe(401)
    for (const role of ['VOLUNTEER', 'DONOR']) {
      findUser.mockResolvedValueOnce({ ...actor, role })
      expect((await request(app).post('/api/v1/volunteers').set(auth).send(createBody)).status).toBe(403)
    }
    expect(invite).not.toHaveBeenCalled()
  })

  it('strictly rejects role and every client-owned ID', async () => {
    for (const key of ['role', 'authUserId', 'auth_user_id', 'appUserId', 'app_user_id', 'personId', 'person_id', 'volunteerId', 'volunteer_id', 'id']) {
      const result = await request(app).post('/api/v1/volunteers').set(auth).send({ ...createBody, [key]: key === 'role' ? 'ADMIN' : volunteerId })
      expect(result.status, key).toBe(400)
    }
    expect(invite).not.toHaveBeenCalled()
  })

  it('rejects invalid email, phone, duplicate skills and empty registration', async () => {
    for (const change of [{ email: 'invalid' }, { phoneE164: '9876543210' }, { skills: ['Driving', 'driving'] }, { registrationCode: ' ' }]) {
      expect((await request(app).post('/api/v1/volunteers').set(auth).send({ ...createBody, ...change })).status).toBe(400)
    }
    expect(invite).not.toHaveBeenCalled()
  })

  it('rejects local registration and phone conflicts before inviting', async () => {
    repo.findAdminVolunteerConflict.mockResolvedValueOnce('registrationCode').mockResolvedValueOnce('phoneE164')
    for (let index = 0; index < 2; index++) {
      const result = await request(app).post('/api/v1/volunteers').set(auth).send(createBody)
      expect(result.status).toBe(409)
      expect(result.body.error.code).toBe(index === 0 ? 'REGISTRATION_CODE_ALREADY_EXISTS' : 'PHONE_ALREADY_EXISTS')
    }
    expect(invite).not.toHaveBeenCalled()
  })

  it('maps provider conflicts and outages without leaking provider errors', async () => {
    invite.mockRejectedValueOnce(new HttpError(409, 'RESOURCE_CONFLICT', 'Existing account.'))
      .mockRejectedValueOnce(new HttpError(503, 'SERVICE_UNAVAILABLE', 'Volunteer invitation is not configured.'))
      .mockRejectedValueOnce(new HttpError(503, 'SERVICE_UNAVAILABLE', 'Invitation failed.'))
    for (const status of [409, 503, 503]) {
      const result = await request(app).post('/api/v1/volunteers').set(auth).send(createBody)
      expect(result.status).toBe(status)
      expect(repo.insertInvitedVolunteer).not.toHaveBeenCalled()
    }
  })

  it('reports recovery required after database failure without deleting the invitation', async () => {
    repo.insertInvitedVolunteer.mockRejectedValueOnce(new Error('database failure'))
    const result = await request(app).post('/api/v1/volunteers').set(auth).send(createBody)
    expect(result.status).toBe(503)
    expect(result.body.error.code).toBe('INVITE_RECOVERY_REQUIRED')
    expect(revoke).not.toHaveBeenCalled()
  })

  it('reports recovery required for a database conflict without Auth cleanup', async () => {
    repo.insertInvitedVolunteer.mockRejectedValueOnce({ code: '23505' })
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await request(app).post('/api/v1/volunteers').set(auth).send(createBody)
      expect(result.status).toBe(503)
      expect(result.body.error.code).toBe('INVITE_RECOVERY_REQUIRED')
      expect(diagnostic).toHaveBeenCalled()
    } finally { diagnostic.mockRestore() }
  })
})

describe('ADMIN volunteer edit', () => {
  it.each([
    [{ name: 'New Name' }, 'name', 'New Name'],
    [{ phoneE164: '+919999999999' }, 'phoneE164', '+919999999999'],
    [{ registrationCode: 'VOL-003' }, 'registrationCode', 'VOL-003'],
    [{ skills: ['First Aid'] }, 'skills', ['First Aid']],
    [{ status: 'INACTIVE' }, 'status', 'INACTIVE'],
    [{ phoneE164: null }, 'phoneE164', null],
  ])('edits allowed field %#', async (change, field, expected) => {
    const result = await request(app).patch(`/api/v1/volunteers/${volunteerId}`).set(auth).send(change)
    expect(result.status).toBe(200)
    expect(repo.updateAdminVolunteerRows).toHaveBeenCalledWith(row, expect.objectContaining({ [field]: expected }), expect.anything())
  })

  it('rejects unauthorized callers and invalid input', async () => {
    expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}`).send({ name: 'New' })).status).toBe(401)
    for (const role of ['VOLUNTEER', 'DONOR']) {
      findUser.mockResolvedValueOnce({ ...actor, role })
      expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}`).set(auth).send({ name: 'New' })).status).toBe(403)
    }
    expect((await request(app).patch('/api/v1/volunteers/not-a-uuid').set(auth).send({ name: 'New' })).status).toBe(400)
    for (const body of [{}, { role: 'ADMIN' }, { authUserId }, { appUserId: actor.id }, { personId: row.person_id }, { volunteerId }, { email: 'new@example.com' }, { phoneE164: 'invalid' }]) {
      expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}`).set(auth).send(body)).status).toBe(400)
    }
    expect(repo.updateAdminVolunteerRows).not.toHaveBeenCalled()
  })

  it('returns 404 when missing and 409 for duplicate phone or registration', async () => {
    repo.findVolunteerForAdminUpdate.mockResolvedValueOnce(null)
    expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}`).set(auth).send({ name: 'New' })).status).toBe(404)
    repo.findAdminVolunteerConflict.mockResolvedValueOnce('phoneE164').mockResolvedValueOnce('registrationCode')
    expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}`).set(auth).send({ phoneE164: '+919999999999' })).status).toBe(409)
    expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}`).set(auth).send({ registrationCode: 'VOL-003' })).status).toBe(409)
  })
})

describe('ADMIN volunteer password setting', () => {
  const path = `/api/v1/volunteers/${volunteerId}/password`

  it('sets a password for the Auth user linked to this volunteer, without sending email', async () => {
    const result = await request(app).patch(path).set(auth).send({ password: 'new-safe-passphrase' })
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ success: true, data: { message: 'Volunteer password updated.' } })
    expect(verify).toHaveBeenCalledWith('verified-token')
    expect(repo.findVolunteerAuthAccountById).toHaveBeenCalledWith(volunteerId)
    expect(setPassword).toHaveBeenCalledWith('linked-volunteer-auth-id', 'new-safe-passphrase')
    expect(invite).not.toHaveBeenCalled()
    expect(JSON.stringify(result.body)).not.toContain('new-safe-passphrase')
  })

  it('requires an authenticated Admin and forbids Volunteer and Donor roles', async () => {
    expect((await request(app).patch(path).send({ password: 'new-safe-passphrase' })).status).toBe(401)
    for (const role of ['VOLUNTEER', 'DONOR']) {
      findUser.mockResolvedValueOnce({ ...actor, role })
      expect((await request(app).patch(path).set(auth).send({ password: 'new-safe-passphrase' })).status).toBe(403)
    }
    expect(repo.findVolunteerAuthAccountById).not.toHaveBeenCalled()
    expect(setPassword).not.toHaveBeenCalled()
  })

  it('rejects invalid volunteer IDs, short passwords, extra fields, and client-supplied Auth IDs', async () => {
    expect((await request(app).patch('/api/v1/volunteers/not-a-uuid/password').set(auth).send({ password: '12345678' })).status).toBe(400)
    for (const body of [{ password: '' }, { password: 'short' }, { password: '12345678', authUserId: 'arbitrary-auth-id' }, { password: '12345678', role: 'ADMIN' }]) {
      expect((await request(app).patch(path).set(auth).send(body)).status).toBe(400)
    }
    expect(repo.findVolunteerAuthAccountById).not.toHaveBeenCalled()
    expect(setPassword).not.toHaveBeenCalled()
  })

  it('returns not found or conflict for missing and unlinked volunteers', async () => {
    repo.findVolunteerAuthAccountById.mockResolvedValueOnce(null)
    expect((await request(app).patch(path).set(auth).send({ password: 'new-safe-passphrase' })).status).toBe(404)
    repo.findVolunteerAuthAccountById.mockResolvedValueOnce({ auth_user_id: null, app_user_role: null, disabled_at: null })
    expect((await request(app).patch(path).set(auth).send({ password: 'new-safe-passphrase' })).status).toBe(409)
    expect(setPassword).not.toHaveBeenCalled()
  })

  it('cannot reset an Admin, disabled account, or account with a non-Volunteer role', async () => {
    for (const linkedAccount of [
      { auth_user_id: 'admin-auth-id', app_user_role: 'ADMIN', disabled_at: null },
      { auth_user_id: 'donor-auth-id', app_user_role: 'DONOR', disabled_at: null },
      { auth_user_id: 'disabled-auth-id', app_user_role: 'VOLUNTEER', disabled_at: new Date() },
    ]) {
      repo.findVolunteerAuthAccountById.mockResolvedValueOnce(linkedAccount)
      expect((await request(app).patch(path).set(auth).send({ password: 'new-safe-passphrase' })).status).toBe(409)
    }
    expect(setPassword).not.toHaveBeenCalled()
  })

  it('returns a safe provider failure without exposing provider details', async () => {
    setPassword.mockRejectedValueOnce(new HttpError(503, 'PASSWORD_UPDATE_FAILED', 'The volunteer password could not be updated.'))
    const result = await request(app).patch(path).set(auth).send({ password: 'new-safe-passphrase' })
    expect(result.status).toBe(503)
    expect(JSON.stringify(result.body)).not.toContain('new-safe-passphrase')
  })
})
