import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { HttpError } from '../middleware/errorHandler'

const { verify, findUser, invite, revoke, repo, withTransaction } = vi.hoisted(() => ({
  verify: vi.fn(), findUser: vi.fn(), invite: vi.fn(), revoke: vi.fn(), withTransaction: vi.fn(),
  repo: {
    findAdminVolunteerConflict: vi.fn(),
    findVolunteerForAdminUpdate: vi.fn(), updateAdminVolunteerRows: vi.fn(),
  },
}))
vi.mock('../auth/supabase', () => ({
  verifySupabaseToken: verify, inviteSupabaseUserByEmail: invite, revokeNewSupabaseInvite: revoke,
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
  repo.findVolunteerForAdminUpdate.mockResolvedValue(row)
  repo.updateAdminVolunteerRows.mockImplementation(async (_row: unknown, input: Record<string, unknown>) => ({
    ...row, name: input.name ?? row.name, phone_e164: input.phoneE164 === undefined ? row.phone_e164 : input.phoneE164,
    registration_code: input.registrationCode ?? row.registration_code, skills: input.skills ?? row.skills,
    status: input.status ?? row.status,
  }))
  withTransaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => callback({}))
})

describe('ADMIN volunteer creation (retired: Volunteers join through mobile registration and approval)', () => {
  it('answers 410 without inviting anyone or writing Volunteer records', async () => {
    for (const body of [createBody, { ...createBody, skills: ['Driver'] }, {}]) {
      const result = await request(app).post('/api/v1/volunteers').set(auth).send(body)
      expect(result.status).toBe(410)
      expect(result.body.error.code).toBe('ADMIN_VOLUNTEER_CREATION_RETIRED')
    }
    expect(invite).not.toHaveBeenCalled()
    expect(repo.findAdminVolunteerConflict).not.toHaveBeenCalled()
    expect(withTransaction).not.toHaveBeenCalled()
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

  it('never deletes or revokes existing invitations', async () => {
    await request(app).post('/api/v1/volunteers').set(auth).send(createBody)
    expect(revoke).not.toHaveBeenCalled()
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
