import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { identity, invite, revoke } = vi.hoisted(() => ({
  identity: { authUserId: '' }, invite: vi.fn(), revoke: vi.fn(),
}))
vi.mock('../src/auth/supabase', () => ({
  verifySupabaseToken: vi.fn(async () => ({ authUserId: identity.authUserId, email: 'admin@example.test' })),
  inviteSupabaseUserByEmail: invite,
  revokeNewSupabaseInvite: revoke,
}))
import { app } from '../src/app'
import { closePool, getPool } from '../src/db/pool'

const testUrl = process.env.TEST_DATABASE_URL
let testDatabaseName = ''
try { testDatabaseName = testUrl ? decodeURIComponent(new URL(testUrl).pathname.slice(1)) : '' }
catch { /* Malformed URLs cannot enable mutation. */ }
const enabled = testDatabaseName.endsWith('_test')
  && process.env.ALLOW_TEST_DATABASE_MUTATION === 'true'
  && process.env.DATABASE_URL === testUrl
if (process.env.CI && !enabled) {
  throw new Error('CI volunteer integration tests require the same dedicated _test DATABASE_URL and TEST_DATABASE_URL with ALLOW_TEST_DATABASE_MUTATION=true.')
}
afterAll(async () => { if (enabled) await closePool() })
beforeEach(() => { vi.clearAllMocks(); revoke.mockResolvedValue(true) })

describe.skipIf(!enabled)('ADMIN volunteer create/edit persistence', () => {
  it('creates one VOLUNTEER identity chain, edits fields and rejects duplicate code/phone', async () => {
    const authIds: string[] = []
    const appUserIds: string[] = []
    const personIds: string[] = []
    const volunteerIds: string[] = []
    const code = `VOL-${randomUUID()}`
    const phone = '+919' + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')
    try {
      identity.authUserId = randomUUID()
      authIds.push(identity.authUserId)
      appUserIds.push((await getPool().query<{ id: string }>(
        "INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, 'ADMIN') RETURNING id", [identity.authUserId]
      )).rows[0].id)
      const invitedAuthId = randomUUID()
      authIds.push(invitedAuthId)
      invite.mockResolvedValue({ authUserId: invitedAuthId, inviteNonce: 'integration-nonce' })
      const created = await request(app).post('/api/v1/volunteers').set('Authorization', 'Bearer integration-token')
        .send({ email: 'new@example.test', name: 'Integration Volunteer', phoneE164: phone, registrationCode: code, skills: ['Driving'] })
      expect(created.status).toBe(201)
      volunteerIds.push(created.body.data.id)
      personIds.push(created.body.data.personId)
      const stored = (await getPool().query<{
        app_user_id: string; role: string; display_name: string; name: string; phone_e164: string; registration_code: string; status: string
      }>(`SELECT p.app_user_id, u.role, u.display_name, p.name, p.phone_e164, v.registration_code, v.status
          FROM app.volunteers v JOIN app.people p ON p.id = v.person_id
          JOIN app.app_users u ON u.id = p.app_user_id WHERE v.id = $1`, [volunteerIds[0]])).rows[0]
      appUserIds.push(stored.app_user_id)
      expect(stored).toMatchObject({ role: 'VOLUNTEER', display_name: 'Integration Volunteer', name: 'Integration Volunteer', phone_e164: phone, registration_code: code, status: 'ACTIVE' })

      const phoneConflict = await request(app).post('/api/v1/volunteers').set('Authorization', 'Bearer integration-token')
        .send({ email: 'other@example.test', name: 'Other', phoneE164: phone, registrationCode: `${code}-OTHER` })
      expect(phoneConflict.status).toBe(409)
      expect(invite).toHaveBeenCalledTimes(1)

      const edited = await request(app).patch(`/api/v1/volunteers/${volunteerIds[0]}`)
        .set('Authorization', 'Bearer integration-token')
        .send({ name: 'Edited Volunteer', skills: ['Packing'], status: 'INACTIVE', registrationCode: `${code}-EDIT`, phoneE164: null })
      expect(edited.status).toBe(200)
      expect(edited.body.data).toMatchObject({ name: 'Edited Volunteer', skills: ['Packing'], status: 'INACTIVE', registrationCode: `${code}-EDIT`, phoneE164: null })
      const roster = await request(app).get('/api/v1/volunteers').query({ search: 'Edited Volunteer' })
        .set('Authorization', 'Bearer integration-token')
      expect(roster.body.data.items.some((item: { id: string }) => item.id === volunteerIds[0])).toBe(true)

      const codeConflict = await request(app).post('/api/v1/volunteers').set('Authorization', 'Bearer integration-token')
        .send({ email: 'other@example.test', name: 'Other', registrationCode: `${code}-EDIT` })
      expect(codeConflict.status).toBe(409)
      expect(invite).toHaveBeenCalledTimes(1)
    } finally {
      for (const id of volunteerIds.reverse()) await getPool().query('DELETE FROM app.volunteers WHERE id = $1', [id])
      for (const id of personIds.reverse()) await getPool().query('DELETE FROM app.people WHERE id = $1', [id])
      for (const id of appUserIds.reverse()) await getPool().query('DELETE FROM app.app_users WHERE id = $1', [id])
    }
  })

  it('rolls back partial provisioning and requests administrator recovery after a concurrent phone conflict', async () => {
    const adminAuthId = randomUUID()
    const newAuthId = randomUUID()
    const code = `VOL-${randomUUID()}`
    const phone = '+919' + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')
    let adminId = ''
    let competingPersonId = ''
    try {
      identity.authUserId = adminAuthId
      adminId = (await getPool().query<{ id: string }>(
        "INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, 'ADMIN') RETURNING id", [adminAuthId]
      )).rows[0].id
      invite.mockImplementationOnce(async () => {
        competingPersonId = (await getPool().query<{ id: string }>(
          'INSERT INTO app.people(name, phone_e164) VALUES ($1, $2) RETURNING id', ['Concurrent person', phone]
        )).rows[0].id
        return { authUserId: newAuthId, inviteNonce: 'integration-nonce' }
      })
      const result = await request(app).post('/api/v1/volunteers').set('Authorization', 'Bearer integration-token')
        .send({ email: 'race@example.test', name: 'Race Volunteer', phoneE164: phone, registrationCode: code })
      expect(result.status).toBe(503)
      expect(result.body.error.code).toBe('INVITE_RECOVERY_REQUIRED')
      expect(revoke).not.toHaveBeenCalled()
      const userCount = await getPool().query<{ count: string }>(
        'SELECT count(*)::text AS count FROM app.app_users WHERE auth_user_id = $1', [newAuthId]
      )
      const volunteerCount = await getPool().query<{ count: string }>(
        'SELECT count(*)::text AS count FROM app.volunteers WHERE registration_code = $1', [code]
      )
      expect(userCount.rows[0].count).toBe('0')
      expect(volunteerCount.rows[0].count).toBe('0')
    } finally {
      if (competingPersonId) await getPool().query('DELETE FROM app.people WHERE id = $1', [competingPersonId])
      if (adminId) await getPool().query('DELETE FROM app.app_users WHERE id = $1', [adminId])
    }
  })
})
