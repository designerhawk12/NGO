import { useEffect, useState } from 'react'
import { fetchEligibleVolunteersForPickup } from './api'

type Eligibility = Awaited<ReturnType<typeof fetchEligibleVolunteersForPickup>>
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function useVolunteerPickupEligibility(pickupId: string, startsAt: string, endsAt: string, live: boolean) {
  const [eligibility, setEligibility] = useState<Eligibility | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(live)
  const [refreshVersion, setRefreshVersion] = useState(0)

  useEffect(() => {
    if (!live) return
    if (!uuidPattern.test(pickupId)) {
      setLoading(false)
      setEligibility(null)
      setError('This pickup has a demo ID and is not saved in the database. Create the pickup via "Schedule Pickup" to enable live volunteer eligibility checks.')
      return
    }
    let active = true
    let request = 0
    setEligibility(null)
    const refresh = () => {
      const current = ++request
      setLoading(true)
      setEligibility(null)
      setError(null)
      void fetchEligibleVolunteersForPickup(pickupId)
        .then(result => { if (active && current === request) setEligibility(result) })
        .catch((cause: unknown) => {
          if (active && current === request) setError(cause instanceof Error ? cause.message : 'Could not verify volunteer availability for this pickup window.')
        })
        .finally(() => { if (active && current === request) setLoading(false) })
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh) }
  }, [pickupId, startsAt, endsAt, live, refreshVersion])

  return { eligibility, error, loading, refresh: () => setRefreshVersion(value => value + 1) }
}
