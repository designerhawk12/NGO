import type { Pickup, Team, Volunteer } from '@aaharaconnect/shared'
import { apiRequest } from './client'

export type DashboardPage<T> = { items: T[]; nextCursor: string | null }

export function listDashboardVolunteers(accessToken: string): Promise<DashboardPage<Volunteer>> {
  return apiRequest('volunteers?limit=100', { headers: { Authorization: `Bearer ${accessToken}` } })
}

export function listDashboardTeams(accessToken: string): Promise<DashboardPage<Team>> {
  return apiRequest('teams?limit=100', { headers: { Authorization: `Bearer ${accessToken}` } })
}

export function listDashboardPickups(accessToken: string): Promise<DashboardPage<Pickup>> {
  return apiRequest('pickups?limit=10', { headers: { Authorization: `Bearer ${accessToken}` } })
}
