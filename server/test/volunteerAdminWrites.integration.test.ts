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

const randomPhone = () => '+919' + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')

describe.skipIf(!enabled)('ADMIN volunteer edit persistence (Volunteers join through mobile registration)', () => {
  it('retires Admin creation without writes, edits an approved Volunteer and rejects duplicate code/phone', async () => {
    const appUserIds: string[] = []
    const personIds: string[] = []
    const volunteerIds: string[] = []
    const code = `VOL-${randomUUID()}`
    const otherCode = `VOL-${randomUUID()}`
    const phone = randomPhone()
    const otherPhone = randomPhone()
    try {
      identity.authUserId = randomUUID()
      appUserIds.push((await getPool().query<{ id: string }>(
        "INSERT INTO app.app_users(auth_user_id, role) VALUES ($1, 'ADMIN') RETURNING id", [identity.authUserId]
      )).rows[0].id)
      // Two Volunteers as created by mobile registration and approved by an Admin.
      for (const [name, volunteerPhone, volunteerCode] of [['Integration Volunteer', phone, code], ['Other Volunteer', otherPhone, otherCode]]) {
        const userId = (await getPool().query<{ id: string }>(
          "INSERT INTO app.app_users(auth_user_id, role, display_name) VALUES ($1, 'VOLUNTEER', $2) RETURNING id", [randomUUID(), name]
        )).rows[0].id
        appUserIds.push(userId)
        const personId = (await getPool().query<{ id: string }>(
          'INSERT INTO app.people(app_user_id, name, phone_e164) VALUES ($1, $2, $3) RETURNING id', [userId, name, volunteerPhone]
        )).rows[0].id
        personIds.push(personId)
        const volunteerId = (await getPool().query<{ id: string }>(
          "INSERT INTO app.volunteers(person_id, registration_code, skills) VALUES ($1, $2, ARRAY['Packing']) RETURNING id", [personId, volunteerCode]
        )).rows[0].id
        volunteerIds.push(volunteerId)
        await getPool().query(
          "INSERT INTO app.volunteer_applications(volunteer_id, status, reviewed_at, reviewed_by) VALUES ($1, 'APPROVED', now(), $2)",
          [volunteerId, appUserIds[0]]
        )
      }

      const retired = await request(app).post('/api/v1/volunteers').set('Authorization', 'Bearer integration-token')
        .send({ email: 'new@example.test', name: 'Should Not Exist', registrationCode: `VOL-${randomUUID()}`, skills: ['Driver'] })
      expect(retired.status).toBe(410)
      expect(invite).not.toHaveBeenCalled()
      const strays = await getPool().query("SELECT count(*)::int AS count FROM app.people WHERE name = 'Should Not Exist'")
      expect(strays.rows[0].count).toBe(0)

      const edited = await request(app).patch(`/api/v1/volunteers/${volunteerIds[0]}`)
        .set('Authorization', 'Bearer integration-token')
        .send({ name: 'Edited Volunteer', skills: ['Packing', 'Distribution'], status: 'INACTIVE', registrationCode: `${code}-EDIT`, phoneE164: null })
      expect(edited.status).toBe(200)
      expect(edited.body.data).toMatchObject({ name: 'Edited Volunteer', skills: ['Packing', 'Distribution'], status: 'INACTIVE', registrationCode: `${code}-EDIT`, phoneE164: null })
      const roster = await request(app).get('/api/v1/volunteers').query({ search: 'Edited Volunteer' })
        .set('Authorization', 'Bearer integration-token')
      expect(roster.body.data.items.some((item: { id: string }) => item.id === volunteerIds[0])).toBe(true)

      const phoneConflict = await request(app).patch(`/api/v1/volunteers/${volunteerIds[0]}`)
        .set('Authorization', 'Bearer integration-token').send({ phoneE164: otherPhone })
      expect(phoneConflict.status).toBe(409)
      const codeConflict = await request(app).patch(`/api/v1/volunteers/${volunteerIds[0]}`)
        .set('Authorization', 'Bearer integration-token').send({ registrationCode: otherCode })
      expect(codeConflict.status).toBe(409)

      const noDriver = await getPool().query('SELECT count(*)::int AS count FROM app.drivers WHERE person_id = ANY($1::uuid[])', [personIds])
      expect(noDriver.rows[0].count).toBe(0)
    } finally {
      for (const id of volunteerIds) await getPool().query('DELETE FROM app.volunteer_applications WHERE volunteer_id = $1', [id])
      for (const id of volunteerIds.reverse()) await getPool().query('DELETE FROM app.volunteers WHERE id = $1', [id])
      for (const id of personIds.reverse()) await getPool().query('DELETE FROM app.people WHERE id = $1', [id])
      for (const id of appUserIds.reverse()) await getPool().query('DELETE FROM app.app_users WHERE id = $1', [id])
    }
  })
})
