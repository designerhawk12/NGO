import { useCallback, useEffect, useState } from 'react'
import { isLiveAdmin } from './adapters'
import { calculateAiLogistics } from './aiLogistics'
import {
  fetchDrivers,
  fetchFoodRequests,
  fetchPickups,
  fetchVehicleAssignments,
  fetchVehicles,
  fetchVolunteers,
} from './api'
import { apiFetchVessels } from '../vessels/api'
import type { VesselItem } from '@aaharaconnect/shared'
import type {
  AssignmentStatusLive,
  FoodRequestSummary,
  LiveAssignment,
  Pickup,
  PickupStatus,
  VehicleAssignmentSummary,
} from './types'

export const initialDemoPickups: Pickup[] = [
  {
    id: 'p1000000-0000-4000-8000-000000000001',
    foodRequestId: 'f1000000-0000-4000-8000-000000000001',
    donorName: 'Bengaluru Palace Banquet',
    donorLocation: 'Vasanth Nagar, Bengaluru',
    deliveryAddress: 'AaharaConnect Indiranagar Distribution Center',
    status: 'PLANNED',
    windowStartsAt: new Date(Date.now() + 3600000).toISOString(),
    windowEndsAt: new Date(Date.now() + 10800000).toISOString(),
    version: 1,
    createdAt: new Date().toISOString(),
    foods: [
      { name: 'Rice', foodType: 'VEG', quantity: 25, unit: 'kg', peopleFed: 120 },
      { name: 'Dal / sambar', foodType: 'VEG', quantity: 15, unit: 'kg', peopleFed: 100 },
      { name: 'Veg curry', foodType: 'VEG', quantity: 10, unit: 'kg', peopleFed: 80 },
      { name: 'Gulab jamun', foodType: 'SWEETS', quantity: 5, unit: 'kg', peopleFed: 60 },
    ],
    aiAssessment: calculateAiLogistics([
      { name: 'Rice', foodType: 'VEG', quantity: 25, unit: 'kg', peopleFed: 120 },
      { name: 'Dal / sambar', foodType: 'VEG', quantity: 15, unit: 'kg', peopleFed: 100 },
      { name: 'Veg curry', foodType: 'VEG', quantity: 10, unit: 'kg', peopleFed: 80 },
      { name: 'Gulab jamun', foodType: 'SWEETS', quantity: 5, unit: 'kg', peopleFed: 60 },
    ], 'Bengaluru Palace Banquet', 'Vasanth Nagar, Bengaluru'),
  },
  {
    id: 'p1000000-0000-4000-8000-000000000002',
    foodRequestId: 'f1000000-0000-4000-8000-000000000002',
    donorName: 'Koramangala Community Kitchen',
    donorLocation: '5th Block Koramangala, Bengaluru',
    deliveryAddress: 'AaharaConnect Shanthi Nagar Community Shelter',
    status: 'ASSIGNED',
    windowStartsAt: new Date(Date.now() + 7200000).toISOString(),
    windowEndsAt: new Date(Date.now() + 14400000).toISOString(),
    version: 1,
    createdAt: new Date().toISOString(),
    foods: [
      { name: 'Veg biryani', foodType: 'VEG', quantity: 12, unit: 'kg', peopleFed: 50 },
      { name: 'Raita', foodType: 'VEG', quantity: 4, unit: 'kg', peopleFed: 40 },
    ],
    aiAssessment: calculateAiLogistics([
      { name: 'Veg biryani', foodType: 'VEG', quantity: 12, unit: 'kg', peopleFed: 50 },
      { name: 'Raita', foodType: 'VEG', quantity: 4, unit: 'kg', peopleFed: 40 },
    ], 'Koramangala Community Kitchen', '5th Block Koramangala, Bengaluru'),
  },
]

export function saveDemoPickup(pickup: Pickup) {
  try {
    let list: Pickup[] = []
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('aa:demo-pickups') : null
    if (stored) {
      list = JSON.parse(stored)
    } else {
      list = [...initialDemoPickups]
    }
    const next = [pickup, ...list.filter(p => p.id !== pickup.id)]
    window.localStorage.setItem('aa:demo-pickups', JSON.stringify(next))

    // Update donation in aa:donations to record the scheduled pickup
    try {
      const rawDonations = window.localStorage.getItem('aa:donations')
      if (rawDonations) {
        const donations: FoodRequestSummary[] = JSON.parse(rawDonations)
        if (Array.isArray(donations)) {
          const updated = donations.map(d =>
            d.id === pickup.foodRequestId
              ? {
                  ...d,
                  pickup: {
                    id: pickup.id,
                    status: pickup.status,
                    windowStartsAt: pickup.windowStartsAt,
                    windowEndsAt: pickup.windowEndsAt,
                    deliveryAddress: pickup.deliveryAddress,
                  },
                }
              : d
          )
          window.localStorage.setItem('aa:donations', JSON.stringify(updated))
        }
      }
    } catch {}

    // Broadcast change so all tabs update immediately
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('aahara_donations')
      bc.postMessage({ type: 'PICKUP_SCHEDULED', data: pickup })
      setTimeout(() => bc.close(), 500)
    }
  } catch {}
}

export function updateDemoPickupStatus(pickupId: string, status: PickupStatus) {
  try {
    let list: Pickup[] = []
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('aa:demo-pickups') : null
    if (stored) {
      list = JSON.parse(stored)
    } else {
      list = [...initialDemoPickups]
    }
    const next = list.map(p => (p.id === pickupId ? { ...p, status } : p))
    window.localStorage.setItem('aa:demo-pickups', JSON.stringify(next))
  } catch {}
}

export function saveDemoAssignment(assignment: LiveAssignment) {
  try {
    let map: Record<string, LiveAssignment> = {}
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('aa:demo-assignments') : null
    if (stored) {
      map = JSON.parse(stored)
    }
    map[assignment.pickupId] = assignment
    map[assignment.id] = assignment
    window.localStorage.setItem('aa:demo-assignments', JSON.stringify(map))
  } catch {}
}

export function getDemoAssignment(pickupIdOrAssignmentId: string): LiveAssignment | null {
  try {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('aa:demo-assignments') : null
    if (stored) {
      const map = JSON.parse(stored)
      return map[pickupIdOrAssignmentId] || null
    }
  } catch {}
  return null
}

export function updateDemoAssignmentStatus(assignmentId: string, status: AssignmentStatusLive): LiveAssignment | null {
  try {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('aa:demo-assignments') : null
    if (stored) {
      const map = JSON.parse(stored)
      const existing = map[assignmentId]
      if (existing) {
        const updated: LiveAssignment = { ...existing, status, version: (existing.version || 0) + 1 }
        map[assignmentId] = updated
        if (existing.pickupId) {
          map[existing.pickupId] = updated
        }
        window.localStorage.setItem('aa:demo-assignments', JSON.stringify(map))
        return updated
      }
    }
  } catch {}
  return null
}

export function syncPickupsWithDonations(basePickups: Pickup[]): Pickup[] {
  let donations: FoodRequestSummary[] = []
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('aa:donations') : null
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) donations = parsed
    }
  } catch {}

  const allRequests = [...donations, ...fallbackDemoFoodRequests]
  const requestsById = new Map<string, FoodRequestSummary>()
  for (const r of allRequests) {
    if (r.id) requestsById.set(r.id, r)
  }

  // Preserve existing scheduled pickups, enriching them with donor details and AI assessment
  // Do NOT automatically create pickups for newly submitted donations.
  const enriched = basePickups.map(p => {
    const matched = requestsById.get(p.foodRequestId)
    const donorName = p.donorName || matched?.donorName || 'Food Donor'
    const donorLocation = p.donorLocation || matched?.location || 'Bengaluru'
    const foods = p.foods && p.foods.length > 0 ? p.foods : matched?.foods || []
    const aiAssessment = p.aiAssessment || calculateAiLogistics(foods, donorName, donorLocation)

    return {
      ...p,
      donorName,
      donorLocation,
      foods,
      aiAssessment,
    }
  })

  // Ensure default demo pickups exist if no pickups exist at all
  if (enriched.length === 0) {
    for (const init of initialDemoPickups) {
      enriched.push({
        ...init,
        donorName: init.donorName || 'Food Donor',
        donorLocation: init.donorLocation || 'Bengaluru',
        foods: init.foods || [],
        aiAssessment: calculateAiLogistics(init.foods || [], init.donorName, init.donorLocation),
      })
    }
  }

  return enriched
}

export function usePickups() {
  const [pickups, setPickups] = useState<Pickup[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadInitial = useCallback(async () => {
    if (!isLiveAdmin()) {
      let list = [...initialDemoPickups]
      try {
        const stored = typeof window !== 'undefined' ? window.localStorage.getItem('aa:demo-pickups') : null
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) {
            list = parsed
          }
        }
      } catch {}

      const synced = syncPickupsWithDonations(list)
      setPickups(synced)
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('aa:demo-pickups', JSON.stringify(synced))
        }
      } catch {}
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [pickupData, foodData] = await Promise.all([
        fetchPickups(null),
        fetchFoodRequests().catch(() => null),
      ])

      const foodMap = new Map<string, FoodRequestSummary>()
      if (Array.isArray(foodData?.items)) {
        for (const f of foodData.items) {
          foodMap.set(f.id, f)
        }
      }

      const enriched = pickupData.items.map(p => {
        const fr = foodMap.get(p.foodRequestId)
        const donorName = p.donorName || fr?.donorName || 'Food Donor'
        const donorLocation = p.donorLocation || fr?.location || 'Bengaluru'
        const foods = p.foods && p.foods.length > 0 ? p.foods : fr?.foods || []
        const aiAssessment = p.aiAssessment || calculateAiLogistics(foods, donorName, donorLocation)

        return {
          ...p,
          donorName,
          donorLocation,
          foods,
          aiAssessment,
        }
      })

      setPickups(enriched)
      setNextCursor(pickupData.nextCursor)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load pickups.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || !isLiveAdmin()) return
    setLoadingMore(true)
    try {
      const data = await fetchPickups(nextCursor)
      setPickups(prev => [...prev, ...data.items])
      setNextCursor(data.nextCursor)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load more pickups.')
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore])

  useEffect(() => {
    void loadInitial()
    const handleSync = () => void loadInitial()
    let bc: BroadcastChannel | null = null
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleSync)
      window.addEventListener('focus', handleSync)
      try {
        if ('BroadcastChannel' in window) {
          bc = new BroadcastChannel('aahara_donations')
          bc.onmessage = () => {
            void loadInitial()
          }
        }
      } catch {}
      return () => {
        window.removeEventListener('storage', handleSync)
        window.removeEventListener('focus', handleSync)
        if (bc) bc.close()
      }
    }
  }, [loadInitial])

  return {
    pickups,
    loading,
    loadingMore,
    hasMore: Boolean(nextCursor),
    error,
    loadMore,
    reload: loadInitial,
  }
}

export const fallbackDemoFoodRequests: FoodRequestSummary[] = [
  {
    id: 'f1000000-0000-4000-8000-000000000001',
    donorName: 'Bengaluru Palace Banquet',
    location: 'Vasanth Nagar, Bengaluru',
    readyAt: new Date(Date.now() + 3600000).toISOString(),
    pickupDeadline: new Date(Date.now() + 14400000).toISOString(),
    status: 'SUBMITTED',
    safetyReview: 'APPROVED',
    isDemo: true,
    foods: [
      { name: 'Rice', foodType: 'VEG', quantity: 25, unit: 'kg', peopleFed: 120 },
      { name: 'Dal / sambar', foodType: 'VEG', quantity: 15, unit: 'kg', peopleFed: 100 },
      { name: 'Veg curry', foodType: 'VEG', quantity: 10, unit: 'kg', peopleFed: 80 },
      { name: 'Gulab jamun', foodType: 'SWEETS', quantity: 5, unit: 'kg', peopleFed: 60 },
    ],
    totalFeeds: 360,
  },
  {
    id: 'f1000000-0000-4000-8000-000000000002',
    donorName: 'Koramangala Community Kitchen',
    location: '5th Block Koramangala, Bengaluru',
    readyAt: new Date(Date.now() + 7200000).toISOString(),
    pickupDeadline: new Date(Date.now() + 18000000).toISOString(),
    status: 'SUBMITTED',
    safetyReview: 'APPROVED',
    isDemo: true,
    foods: [
      { name: 'Veg biryani', foodType: 'VEG', quantity: 12, unit: 'kg', peopleFed: 50 },
      { name: 'Raita', foodType: 'VEG', quantity: 4, unit: 'kg', peopleFed: 40 },
    ],
    totalFeeds: 90,
  },
  {
    id: 'f1000000-0000-4000-8000-000000000003',
    donorName: 'Indiranagar Wedding Convention',
    location: '100ft Road Indiranagar, Bengaluru',
    readyAt: new Date(Date.now() + 1800000).toISOString(),
    pickupDeadline: new Date(Date.now() + 10800000).toISOString(),
    status: 'SUBMITTED',
    safetyReview: 'APPROVED',
    isDemo: true,
    foods: [
      { name: 'Chicken biryani', foodType: 'NON_VEG', quantity: 45, unit: 'kg', peopleFed: 180 },
      { name: 'Gravy / Shervah', foodType: 'NON_VEG', quantity: 20, unit: 'kg', peopleFed: 150 },
      { name: 'Roti / Chapati', foodType: 'VEG', quantity: 150, unit: 'pcs', peopleFed: 75 },
    ],
    totalFeeds: 405,
  },
]

export function useFoodRequests() {
  const [foodRequests, setFoodRequests] = useState<FoodRequestSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [isDemoFallback, setIsDemoFallback] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError(null)

    const getScheduledMap = (): Map<string, Pickup> => {
      const map = new Map<string, Pickup>()
      try {
        const stored = typeof window !== 'undefined' ? window.localStorage.getItem('aa:demo-pickups') : null
        const list: Pickup[] = stored ? JSON.parse(stored) : initialDemoPickups
        if (Array.isArray(list)) {
          for (const p of list) {
            if (p.foodRequestId && p.status !== 'CANCELLED' && p.status !== 'FAILED') {
              map.set(p.foodRequestId, p)
            }
          }
        }
      } catch {}
      return map
    }

    if (!isLiveAdmin()) {
      let localDonations: FoodRequestSummary[] = []
      try {
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem('aa:donations') : null
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            localDonations = parsed
          }
        }
        const persistedRaw = typeof window !== 'undefined' ? window.localStorage.getItem('aa:last-persisted-food-request-data') : null
        if (persistedRaw) {
          const persisted = JSON.parse(persistedRaw)
          if (persisted?.id && !localDonations.some(d => d.id === persisted.id)) {
            localDonations.unshift({
              id: persisted.id,
              donorName: persisted.donorName || persisted.sourceName || 'Food Donor',
              location: persisted.location || persisted.pickupAddress || 'Bengaluru',
              readyAt: persisted.readyAt,
              pickupDeadline: persisted.pickupDeadline,
              status: persisted.status || 'SUBMITTED',
              safetyReview: persisted.safetyReview || 'PENDING',
              foods: persisted.foods || [],
            })
          }
        }
      } catch {}

      const scheduledMap = getScheduledMap()
      const combined = [...localDonations, ...fallbackDemoFoodRequests].map(fr => {
        const scheduled = scheduledMap.get(fr.id)
        return {
          ...fr,
          pickup: scheduled
            ? {
                id: scheduled.id,
                status: scheduled.status,
                windowStartsAt: scheduled.windowStartsAt,
                windowEndsAt: scheduled.windowEndsAt,
                deliveryAddress: scheduled.deliveryAddress,
              }
            : fr.pickup || null,
        }
      })

      setFoodRequests(combined)
      setIsDemoFallback(true)
      setLoading(false)
      return
    }

    try {
      const res = await fetchFoodRequests()
      if (Array.isArray(res?.items)) {
        setFoodRequests(res.items)
        setIsDemoFallback(false)
      } else {
        setFoodRequests([])
        setIsDemoFallback(false)
      }
    } catch (err: unknown) {
      // In live admin mode, report the error honestly rather than pretending live succeeded with fake data
      const message = err instanceof Error ? err.message : 'Unable to fetch food requests from server.'
      setError(message)
      setFoodRequests([])
      setIsDemoFallback(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRequests()
    const handleSync = () => void loadRequests()
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleSync)
      window.addEventListener('focus', handleSync)
      let bc: BroadcastChannel | null = null
      try {
        if ('BroadcastChannel' in window) {
          bc = new BroadcastChannel('aahara_donations')
          bc.onmessage = () => void loadRequests()
        }
      } catch {}
      return () => {
        window.removeEventListener('storage', handleSync)
        window.removeEventListener('focus', handleSync)
        if (bc) bc.close()
      }
    }
  }, [loadRequests])

  return { foodRequests, loading, isDemoFallback, error, reload: loadRequests }
}

export function useAssignWizardResources() {
  const [volunteers, setVolunteers] = useState<unknown[]>([])
  const [drivers, setDrivers] = useState<unknown[]>([])
  const [vehicles, setVehicles] = useState<unknown[]>([])
  const [vessels, setVessels] = useState<VesselItem[]>([])
  const [waitingTeam1, setWaitingTeam1] = useState<string | null>(null)
  const [waitingTeam5Drivers, setWaitingTeam5Drivers] = useState<string | null>(null)
  const [waitingTeam5Vehicles, setWaitingTeam5Vehicles] = useState<string | null>(null)
  const [waitingVessels, setWaitingVessels] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const loadResources = async () => {
      setLoading(true)

      if (!isLiveAdmin()) {
        if (active) {
          setVolunteers([])
          setDrivers([])
          setVehicles([])
          setVessels([])
          setLoading(false)
        }
        return
      }

      // Check Volunteers (Team 1)
      try {
        const volRes = await fetchVolunteers()
        if (active) {
          if (Array.isArray(volRes?.items) && volRes.items.length > 0) {
            setVolunteers(volRes.items)
            setWaitingTeam1(null)
          } else {
            setWaitingTeam1('Team 1 Volunteers API: no records returned')
          }
        }
      } catch {
        if (active) {
          setWaitingTeam1('Waiting for Team 1 API (GET /volunteers)')
        }
      }

      // Check Drivers (Team 5)
      try {
        const drvRes = await fetchDrivers()
        if (active) {
          if (Array.isArray(drvRes?.items) && drvRes.items.length > 0) {
            setDrivers(drvRes.items)
            setWaitingTeam5Drivers(null)
          } else {
            setWaitingTeam5Drivers('Team 5 Drivers API: no records returned')
          }
        }
      } catch {
        if (active) {
          setWaitingTeam5Drivers('Waiting for Team 5 API (GET /drivers)')
        }
      }

      // Check Vehicles (Team 5)
      try {
        const vehRes = await fetchVehicles()
        if (active) {
          if (Array.isArray(vehRes?.items) && vehRes.items.length > 0) {
            setVehicles(vehRes.items)
            setWaitingTeam5Vehicles(null)
          } else {
            setWaitingTeam5Vehicles('Team 5 Vehicles API: no records returned')
          }
        }
      } catch {
        if (active) {
          setWaitingTeam5Vehicles('Waiting for Team 5 API (GET /vehicles)')
        }
      }

      // Check Vessels (Vessel Inventory Module)
      try {
        const vslRes = await apiFetchVessels({ status: 'AVAILABLE', cleaningStatus: 'CLEAN' })
        if (active) {
          if (Array.isArray(vslRes?.items) && vslRes.items.length > 0) {
            setVessels(vslRes.items)
            setWaitingVessels(null)
          } else {
            setWaitingVessels('No clean, available vessels in inventory.')
          }
        }
      } catch {
        if (active) {
          setWaitingVessels('Waiting for Vessels API (GET /vessels)')
        }
      }

      if (active) setLoading(false)
    }

    void loadResources()
    return () => {
      active = false
    }
  }, [])

  return {
    volunteers,
    drivers,
    vehicles,
    vessels,
    waitingTeam1,
    waitingTeam5Drivers,
    waitingTeam5Vehicles,
    waitingVessels,
    loading,
  }
}

export function usePickupVessels(pickupId?: string | null) {
  const [issuedVessels, setIssuedVessels] = useState<VesselItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!pickupId) {
      setIssuedVessels([])
      return
    }
    let active = true
    setLoading(true)
    apiFetchVessels()
      .then(res => {
        if (active) {
          const matched = (res?.items || []).filter(
            v => v.activeIssuance?.pickupId === pickupId
          )
          setIssuedVessels(matched)
        }
      })
      .catch(() => {
        if (active) setIssuedVessels([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [pickupId])

  return { issuedVessels, loading }
}

export function useVehicleAssignments(vehicleId?: string | null) {
  const [assignments, setAssignments] = useState<VehicleAssignmentSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!vehicleId || !isLiveAdmin()) {
      setAssignments([])
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    fetchVehicleAssignments(vehicleId)
      .then(items => {
        if (active) setAssignments(items)
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load vehicle projection.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [vehicleId])

  return { assignments, loading, error }
}
