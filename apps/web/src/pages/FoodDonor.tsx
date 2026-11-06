import { Package, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Avatar, Drawer, StatusBadge } from '../components/common/UI'
import { useProfilePhotos } from '../features/photos/useProfilePhotos'
import {
  assignDonorPickupToVehicle,
  fetchAllDonorRequests,
  getAllActiveTrips,
  type DonorPickupRequest,
} from '../features/vehicles/donorTripService'
import {
  createAssignment,
  fetchDrivers,
  fetchVehicles,
  fetchVolunteers,
} from '../features/pickups/api'
import { isLiveAdmin } from '../features/pickups/adapters'
import type { Vehicle } from '../types'

interface Props {
  vehicles?: Vehicle[]
  setVehicles?: Dispatch<SetStateAction<Vehicle[]>>
  notify?: (message: string, kind?: 'success' | 'error') => void
}

export default function FoodDonor({ vehicles = [], setVehicles, notify }: Props) {
  const [requests, setRequests] = useState<DonorPickupRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [liveVehicles, setLiveVehicles] = useState<Vehicle[]>([])
  const [selectedVehicleMap, setSelectedVehicleMap] = useState<Record<string, string>>({})
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<DonorPickupRequest | null>(null)
  const [showCancelledHistory, setShowCancelledHistory] = useState(false)
  const photoIds = useMemo(() => requests.map(request => request.donorId ?? ''), [requests])
  const photos = useProfilePhotos('DONOR', photoIds)

  const loadRequests = useCallback(async (cancelledHistory: boolean) => {
    setLoading(true)
    setError(null)
    setLoadError(false)
    try {
      const live = isLiveAdmin()
      const data = await fetchAllDonorRequests(live, cancelledHistory ? 'CANCELLED' : undefined)
      const activeTrips = live ? [] : getAllActiveTrips()

      // Merge assignment status from active trips
      const enriched = data.map(req => {
        const matchingTrip = activeTrips.find(t => t.foodRequestId === req.id)
        if (matchingTrip) {
          return {
            ...req,
            status: 'ASSIGNED' as const,
            assignedVehicleId: matchingTrip.vehicleId,
            assignedVehicleReg: matchingTrip.vehicleReg,
          }
        }
        return req
      })

      // Keep cancelled requests visible for history while never mixing them into
      // the active scheduling section above submitted/assigned work.
      enriched.sort((a, b) => Number(a.status === 'CANCELLED') - Number(b.status === 'CANCELLED'))
      setRequests(enriched)
    } catch (err: unknown) {
      setLoadError(true)
      setError(err instanceof Error ? err.message : 'Could not load food requests from the API. Check your Admin session and retry.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load live vehicles directly from PostgreSQL in live admin mode
  useEffect(() => {
    if (isLiveAdmin()) {
      fetchVehicles()
        .then(res => {
          if (Array.isArray(res?.items) && res.items.length > 0) {
            const mapped: Vehicle[] = res.items.map((v: any) => ({
              vehicleId: v.vehicleId || v.id,
              registrationNumber: v.registrationNumber || v.registration_number,
              type: v.type || v.vehicleType || 'Van',
              capacityKg: Number(v.capacityKg || v.capacity_kg) || 500,
              status: v.status || 'AVAILABLE',
              fuelType: v.fuelType || 'DIESEL',
              driverId: v.assignedDriverId || v.driverId,
              driverName: v.driverName,
            }))
            setLiveVehicles(mapped)
          }
        })
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    void loadRequests(showCancelledHistory)
    const handleSync = () => void loadRequests(showCancelledHistory)
    window.addEventListener('storage', handleSync)
    window.addEventListener('focus', handleSync)
    let bc: BroadcastChannel | null = null
    try {
      if ('BroadcastChannel' in window) {
        bc = new BroadcastChannel('aahara_donations')
        bc.onmessage = () => void loadRequests(showCancelledHistory)
      }
    } catch {}
    return () => {
      window.removeEventListener('storage', handleSync)
      window.removeEventListener('focus', handleSync)
      if (bc) bc.close()
    }
  }, [loadRequests, showCancelledHistory])

  // Live mode must not make a mock vehicle dispatchable when the API has not
  // returned a canonical vehicle record.
  const displayVehicles = isLiveAdmin() ? liveVehicles : vehicles
  const availableVehicles = displayVehicles.filter(v => v.status === 'AVAILABLE')

  const handleAssign = async (request: DonorPickupRequest) => {
    if (isLiveAdmin() && request.safetyReview !== 'APPROVED') {
      notify?.('An administrator must complete the food-safety review before this pickup can be scheduled.', 'error')
      return
    }

    const chosenVehicleId = selectedVehicleMap[request.id] || availableVehicles[0]?.vehicleId
    if (!chosenVehicleId) {
      notify?.('Please select an available vehicle to assign.', 'error')
      return
    }

    const vehicle = displayVehicles.find(v => v.vehicleId === chosenVehicleId)
    if (!vehicle) {
      notify?.('Selected vehicle was not found.', 'error')
      return
    }

    if (vehicle.capacityKg < request.estimatedWeightKg) {
      notify?.(
        `Vehicle capacity (${vehicle.capacityKg} kg) is insufficient for this pickup (${request.estimatedWeightKg} kg).`,
        'error'
      )
      return
    }

    if (isLiveAdmin()) {
      setAssigningId(request.id)
      try {
        // The backend rechecks the approved safety review before scheduling.
        // Live pickups are scheduled in Pickup & Logistics, where a Distribution Center is chosen.
        if (!request.pickup) {
          notify?.('Schedule this pickup in Pickup & Logistics and choose a Distribution Center first.', 'error')
          return
        }
        const pickup = request.pickup
        if (pickup.status !== 'PLANNED') {
          notify?.(`This pickup is already ${pickup.status.toLowerCase()}. Refresh the request before assigning it again.`, 'error')
          await loadRequests(showCancelledHistory)
          return
        }

        // Find available driver & volunteer to assign.
        const [driverRes, volRes] = await Promise.allSettled([fetchDrivers(), fetchVolunteers()])
        const driverItem: any =
          driverRes.status === 'fulfilled' && Array.isArray(driverRes.value?.items)
            ? driverRes.value.items.find((d: any) => d.status === 'ACTIVE') || driverRes.value.items[0]
            : null
        const volItem: any =
          volRes.status === 'fulfilled' && Array.isArray(volRes.value?.items)
            ? volRes.value.items[0]
            : null

        const driverId = vehicle.driverId || driverItem?.driverId || driverItem?.id || null
        const volunteerIds = volItem ? [volItem.volunteerId || volItem.id] : []

        await createAssignment(
          pickup.id,
          {
            teamId: null,
            volunteerIds,
            driverId: driverId || '',
            vehicleId: vehicle.vehicleId,
            role: 'Pickup Volunteer',
            windowStartsAt: pickup.windowStartsAt,
            windowEndsAt: pickup.windowEndsAt,
            containers: [
              {
                containerType: 'insulated crate',
                count: request.totalVessels,
                estimatedLoadKg: request.estimatedWeightKg,
              },
            ],
          },
          crypto.randomUUID()
        )

        setRequests(prev =>
          prev.map(r =>
            r.id === request.id
              ? {
                  ...r,
                  status: 'ASSIGNED',
                  assignedVehicleId: vehicle.vehicleId,
                  assignedVehicleReg: vehicle.registrationNumber,
                }
              : r
          )
        )

        notify?.(
          `Scheduled pickup & assigned vehicle ${vehicle.registrationNumber} in PostgreSQL!`,
          'success'
        )
        return
      } catch (err: unknown) {
        notify?.(err instanceof Error ? err.message : 'Backend assignment failed.', 'error')
        return
      } finally {
        setAssigningId(null)
      }
    }

    // Demo mode fallback
    const res = assignDonorPickupToVehicle(vehicle, request)
    if (res.success && res.trip) {
      if (setVehicles) {
        setVehicles(prev =>
          prev.map(v => (v.vehicleId === vehicle.vehicleId ? { ...v, status: 'ON TRIP' } : v))
        )
      }

      setRequests(prev =>
        prev.map(r =>
          r.id === request.id
            ? {
                ...r,
                status: 'ASSIGNED',
                assignedVehicleId: vehicle.vehicleId,
                assignedVehicleReg: vehicle.registrationNumber,
              }
            : r
        )
      )

      notify?.(
        `Assigned ${request.donorName} (${request.estimatedWeightKg} kg) to vehicle ${vehicle.registrationNumber}!`,
        'success'
      )
    } else {
      notify?.(res.error || 'Failed to assign vehicle.', 'error')
    }
  }

  const awaitingCount = requests.filter(r => r.status === 'SUBMITTED').length
  const assignedCount = requests.filter(r => ['ASSIGNED', 'IN_TRANSIT'].includes(r.status)).length

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">FOOD & DONOR MANAGEMENT</span>
          <h1>Food & Donors</h1>
          <p>{isLiveAdmin() ? 'Food requests from the shared API. Schedule vehicles through Pickup & Logistics.' : 'Demo donor requests and fleet planning.'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="button button-secondary"
            aria-pressed={showCancelledHistory}
            onClick={() => {
              const next = !showCancelledHistory
              setShowCancelledHistory(next)
            }}
            disabled={loading}
          >
            {showCancelledHistory ? 'Show active requests' : 'Cancelled history'}
          </button>
          <button
            type="button"
            className="button button-secondary flex items-center gap-1.5"
            onClick={() => void loadRequests(showCancelledHistory)}
            title="Refresh donor requests"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs">
          <span className="text-xs font-semibold text-slate-400 block">Total Donor Requests</span>
          <strong className="text-2xl font-black text-slate-800 mt-1 block">{requests.length}</strong>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Received via backend & donor app</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-amber-200/80 bg-amber-50/20 shadow-2xs">
          <span className="text-xs font-semibold text-amber-700 block">Awaiting review / pickup planning</span>
          <strong className="text-2xl font-black text-amber-800 mt-1 block">{awaitingCount}</strong>
          <span className="text-[11px] text-amber-600 mt-0.5 block">Review food safety before scheduling</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-emerald-200/80 bg-emerald-50/20 shadow-2xs">
          <span className="text-xs font-semibold text-emerald-700 block">Assigned / In Transit</span>
          <strong className="text-2xl font-black text-emerald-800 mt-1 block">{assignedCount}</strong>
          <span className="text-[11px] text-emerald-600 mt-0.5 block">Active vehicle rescue operations</span>
        </div>
      </div>

      {/* Main Request List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Package size={18} className="text-emerald-700" />
            {showCancelledHistory ? 'Cancelled Food Request History' : 'Live Food Requests from Donors'}
          </h2>
          <span className="text-xs text-slate-500 font-medium">
            {availableVehicles.length} vehicles currently available
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
            <RefreshCw size={24} className="mx-auto text-emerald-600 animate-spin mb-2" />
            <p className="text-sm text-slate-600">Loading donor requests from backend…</p>
          </div>
        ) : loadError || error ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-red-200 text-red-600" role="alert">
            <p className="text-sm font-semibold">{error || 'Could not load food requests from the API. Check your Admin session and retry.'}</p>
            <button
              type="button"
              className="button button-secondary mt-3"
              onClick={() => void loadRequests(showCancelledHistory)}
            >
              Retry
            </button>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
            <Package size={32} className="mx-auto text-slate-300 mb-2" />
            <h3 className="font-bold text-slate-700">No donor requests found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              {isLiveAdmin() ? 'No food requests have been submitted yet.' : 'No demo donor requests are available.'}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table donor-request-table">
              <thead><tr><th>Donor</th><th>Food items</th><th>Quantity</th><th>Pickup address</th><th>Prepared / deadline</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {requests.map(req => {
                  const selectedVehId = selectedVehicleMap[req.id] || availableVehicles[0]?.vehicleId || ''
                  const candidateVehicle = displayVehicles.find(v => v.vehicleId === selectedVehId)
                  const hasCapacity = candidateVehicle ? candidateVehicle.capacityKg >= req.estimatedWeightKg : false
                  const itemSummary = req.foods.map(f => f.name).join(', ')
                  const quantitySummary = req.foods.map(f => `${f.quantity} ${String(f.unit).toLowerCase()}`).join(' + ')
                  return (
                    <tr key={req.id}>
                      <td><span className="person-cell"><Avatar name={req.donorName} size="sm" src={req.donorId ? photos[req.donorId] : undefined} /><span><strong>{req.donorName}</strong>{req.contactPhone && <small>{req.contactPhone}</small>}</span></span></td>
                      <td className="clamp-cell" title={itemSummary}>{itemSummary || '—'}</td>
                      <td><strong>{quantitySummary || '—'}</strong><small className="block-small">{req.weightProvided === false ? 'Weight not provided' : `${req.estimatedWeightKg} kg`}</small></td>
                      <td className="clamp-cell" title={req.pickupAddress}>{req.pickupAddress}</td>
                      <td><span className="block-small">{new Date(req.preparedAt || req.readyAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span><small className="block-small">Due {new Date(req.pickupDeadline).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></td>
                      <td><StatusBadge status={req.status} /></td>
                      <td className="actions-cell">
                        <button type="button" className="text-link" onClick={() => setSelectedRequest(req)}>View Details</button>
                        {req.status !== 'CANCELLED' && !isLiveAdmin() && req.status !== 'ASSIGNED' && (
                          <span className="inline-assign">
                            <label htmlFor={`veh-select-${req.id}`} className="sr-only">Select Vehicle</label>
                            <select id={`veh-select-${req.id}`} value={selectedVehId} onChange={e => setSelectedVehicleMap(prev => ({ ...prev, [req.id]: e.target.value }))} disabled={availableVehicles.length === 0}>
                              {availableVehicles.length === 0 ? <option value="">No vehicles available</option> : availableVehicles.map(v => <option key={v.vehicleId} value={v.vehicleId}>{`${v.registrationNumber} · ${v.capacityKg} kg ${v.capacityKg < req.estimatedWeightKg ? '(too small)' : ''}`}</option>)}
                            </select>
                            <button type="button" className="button button-primary" onClick={() => handleAssign(req)} disabled={availableVehicles.length === 0 || !hasCapacity || assigningId === req.id}>{assigningId === req.id ? 'Assigning…' : 'Assign'}</button>
                          </span>
                        )}
                        {req.status === 'ASSIGNED' && !isLiveAdmin() && <small className="block-small">Vehicle {req.assignedVehicleReg || 'assigned'}</small>}
                        {isLiveAdmin() && req.status !== 'CANCELLED' && req.safetyReview !== 'APPROVED' && <small className="block-small warn-text">Safety review pending</small>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selectedRequest && <Drawer title={`Food request ${selectedRequest.id.slice(0, 8)}`} onClose={() => setSelectedRequest(null)}>
        <div className="drawer-body space-y-4">
          <div className="detail-section"><h3>Donor and pickup</h3><div className="detail-grid">
            <div><span>Donor</span><strong>{selectedRequest.donorName}</strong></div>
            <div><span>Request status</span><strong><StatusBadge status={selectedRequest.status}/></strong></div>
            <div><span>Pickup address</span><strong>{selectedRequest.pickupAddress}</strong></div>
            <div><span>Contact</span><strong>{selectedRequest.contactName || '—'}{selectedRequest.contactPhone ? ` · ${selectedRequest.contactPhone}` : ''}</strong></div>
            <div><span>Food prepared</span><strong>{new Date(selectedRequest.preparedAt || selectedRequest.readyAt).toLocaleString()}</strong></div>
            <div><span>Pickup deadline</span><strong>{new Date(selectedRequest.pickupDeadline).toLocaleString()}</strong></div>
            <div><span>Estimated weight</span><strong>{selectedRequest.weightProvided === false ? 'Not provided' : `${selectedRequest.estimatedWeightKg} kg`}</strong></div>
            <div><span>Food-safety review</span><strong>{selectedRequest.safetyReview ?? 'Not reviewed'}</strong></div>
          </div></div>
          <div className="detail-section"><h3>Food items</h3>{selectedRequest.foods.length ? <ul>{selectedRequest.foods.map((food, index) => <li key={`${food.name}-${index}`}>{food.name} · {food.quantity} {food.unit}{food.foodType ? ` · ${food.foodType}` : ''}</li>)}</ul> : <p>No item details provided.</p>}</div>
          <div className="detail-section"><h3>Handling and notes</h3><p>{selectedRequest.handlingRequirements || 'No special handling requirements.'}</p><p>{selectedRequest.notes || 'No additional notes.'}</p></div>
          {selectedRequest.pickup && <div className="detail-section"><h3>Scheduled pickup</h3><div className="detail-grid"><div><span>Pickup status</span><strong>{selectedRequest.pickup.status}</strong></div><div><span>Assignment status</span><strong>{selectedRequest.pickup.assignmentStatus || 'No active assignment'}</strong></div><div><span>Window starts</span><strong>{new Date(selectedRequest.pickup.windowStartsAt).toLocaleString()}</strong></div><div><span>Window ends</span><strong>{new Date(selectedRequest.pickup.windowEndsAt).toLocaleString()}</strong></div><div><span>Delivery address</span><strong>{selectedRequest.pickup.deliveryAddress}</strong></div></div></div>}
        </div>
      </Drawer>}
    </>
  )
}
