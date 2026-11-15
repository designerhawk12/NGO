// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useVolunteerPickupEligibility } from './useVolunteerPickupEligibility'

const fetchEligibility = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ fetchEligibleVolunteersForPickup: fetchEligibility }))

const pickupId = '09408ed9-9b8a-40d8-a66c-9e532c2a51ac'
const volunteerId = '63f5ac07-88da-4955-b774-74e6adac0b76'
let container: HTMLDivElement
let root: Root

function Probe({ startsAt = '2026-11-13T06:00:00Z' }: { startsAt?: string }) {
  const { eligibility, loading, refresh } = useVolunteerPickupEligibility(pickupId, startsAt, '2026-11-13T07:00:00Z', true)
  return <button data-volunteers={eligibility?.volunteerIds.join(',') ?? ''} data-loading={loading} onClick={refresh}>Refresh</button>
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  fetchEligibility.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.unstubAllGlobals()
})

it('refreshes an open wizard after mobile availability changes, manual refresh, and pickup reschedule', async () => {
  fetchEligibility.mockResolvedValueOnce({ volunteerIds: [] })
    .mockResolvedValueOnce({ volunteerIds: [volunteerId] })
    .mockResolvedValueOnce({ volunteerIds: [] })
    .mockResolvedValueOnce({ volunteerIds: [volunteerId] })
  await act(async () => { root.render(<Probe />) })
  expect(container.querySelector('button')?.dataset.volunteers).toBe('')

  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(container.querySelector('button')?.dataset.volunteers).toBe(volunteerId)

  await act(async () => { container.querySelector('button')?.click() })
  expect(container.querySelector('button')?.dataset.volunteers).toBe('')

  await act(async () => { root.render(<Probe startsAt="2026-11-13T08:00:00Z" />) })
  expect(container.querySelector('button')?.dataset.volunteers).toBe(volunteerId)
  expect(fetchEligibility).toHaveBeenCalledTimes(4)
  expect(fetchEligibility).toHaveBeenLastCalledWith(pickupId)
})
