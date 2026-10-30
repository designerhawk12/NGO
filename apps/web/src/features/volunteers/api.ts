import type { Page, Team, Volunteer } from '@aaharaconnect/shared'
import { apiRequest } from '../../api/client'

const bearer = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` })

async function readAll<T>(path: string, accessToken: string): Promise<T[]> {
  const items: T[] = []
  const seen = new Set<string>()
  let cursor: string | null = null
  do {
    const params = new URLSearchParams({ limit: '100' })
    if (cursor) params.set('cursor', cursor)
    const page: Page<T> = await apiRequest<Page<T>>(`${path}?${params}`, { headers: bearer(accessToken) })
    items.push(...page.items)
    cursor = page.nextCursor
    if (cursor && seen.has(cursor)) throw new Error('The API repeated a page cursor. Try again.')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return items
}

export const listAdminVolunteers = (accessToken: string) => readAll<Volunteer>('volunteers', accessToken)
export const getAdminVolunteer = (accessToken: string, id: string) =>
  apiRequest<Volunteer>(`volunteers/${encodeURIComponent(id)}`, { headers: bearer(accessToken) })
export type CreateAdminVolunteerInput = {
  email: string
  name: string
  phoneE164: string | null
  registrationCode: string
  skills: string[]
  status: 'ACTIVE' | 'INACTIVE'
}
export type UpdateAdminVolunteerInput = Partial<Omit<CreateAdminVolunteerInput, 'email'>>
export const createAdminVolunteer = (accessToken: string, input: CreateAdminVolunteerInput) =>
  apiRequest<Volunteer>('volunteers', { method: 'POST', headers: bearer(accessToken), body: input })
export const updateAdminVolunteer = (accessToken: string, id: string, input: UpdateAdminVolunteerInput) =>
  apiRequest<Volunteer>(`volunteers/${encodeURIComponent(id)}`, { method: 'PATCH', headers: bearer(accessToken), body: input })
export const setAdminVolunteerPassword = (accessToken: string, id: string, password: string) =>
  apiRequest<{ message: string }>(`volunteers/${encodeURIComponent(id)}/password`, {
    method: 'PATCH', headers: bearer(accessToken), body: { password },
  })
export const listAdminTeams = (accessToken: string) => readAll<Team>('teams', accessToken)
export const getAdminTeam = (accessToken: string, id: string) =>
  apiRequest<Team>(`teams/${encodeURIComponent(id)}`, { headers: bearer(accessToken) })
export type TeamWriteInput = { name: string; memberIds: string[]; leaderVolunteerId: string | null }
export const createAdminTeam = (accessToken: string, input: TeamWriteInput) =>
  apiRequest<Team>('teams', { method: 'POST', headers: bearer(accessToken), body: input })
export const updateAdminTeam = (accessToken: string, id: string, input: TeamWriteInput) =>
  apiRequest<Team>(`teams/${encodeURIComponent(id)}`, { method: 'PATCH', headers: bearer(accessToken), body: input })
