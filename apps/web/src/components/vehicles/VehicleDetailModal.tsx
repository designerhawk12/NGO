import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Edit2,
  Flame,
  MapPin,
  Package,
  Phone,
  Plus,
  Scale,
  ShieldAlert,
  Sparkles,
  ThermometerSnowflake,
  Truck,
  UserRound,
  Wrench,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Driver, Vehicle, VehicleMaintenanceRecord } from '../../types'
import { Drawer, StatusBadge, formatDate, formatTime, initials } from '../common/UI'
import { fetchVehicleMaintenance, type ApiMaintenanceItem } from '../../features/vehicles/api'
import { fetchVehicleAssignments } from '../../features/pickups/api'
import type { VehicleAssignmentSummary } from '../../features/pickups/types'
import { isLiveAdmin } from '../../features/pickups/adapters'
import {
  assignDonorPickupToVehicle,
  completeDeliveryTrip,
  fetchAllDonorRequests,
  getActiveTripsForVehicle,
  type DonorPickupRequest,
  type VehicleActiveTrip,
} from '../../features/vehicles/donorTripService'

type Props = {
  vehicle: Vehicle
  drivers: Driver[]
  assignments?: any[]
  events?: any[]
  maintenanceRecords: VehicleMaintenanceRecord[]
  onClose: () => void
  onEdit: () => void
  onLogMaintenance: () => void
  onVehicleStatusChange?: (vehicleId: string, status: string) => void
  notify?: (message: string, kind?: 'success' | 'error') => void
}

export default function VehicleDetailModal({
  vehicle,
  drivers,
  maintenanceRecords,
  onClose,
  onEdit,
  onLogMaintenance,
  onVehicleStatusChange,
  notify,
}: Props) {
  const [liveMaintenance, setLiveMaintenance] = useState<ApiMaintenanceItem[] | null>(null)
  const [liveAssignments, setLiveAssignments] = useState<VehicleAssignmentSummary[]>([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [assignmentsError, setAssignmentsError] = useState(false)
  const [activeTrips, setActiveTrips] = useState<VehicleActiveTrip[]>([])
  const [availableDonors, setAvailableDonors] = useState<DonorPickupRequest[]>([])
  const [showAssignPanel, setShowAssignPanel] = useState(false)

  // 1. Fetch live maintenance from backend
  useEffect(() => {
    let active = true
    if (isLiveAdmin()) setLiveMaintenance([])
    if (vehicle.vehicleId) {
      fetchVehicleMaintenance(vehicle.vehicleId)
        .then(res => {
          if (active) setLiveMaintenance(res.items)
        })
        .catch(() => { if (active && isLiveAdmin()) setLiveMaintenance([]) })
    }
    return () => {
      active = false
    }
  }, [vehicle.vehicleId])

  // 2. Load active trips and available donor requests
  useEffect(() => {
    let active = true
    if (isLiveAdmin()) {
      setActiveTrips([])
      setAvailableDonors([])
      setAssignmentsLoading(true)
      setAssignmentsError(false)
      void fetchVehicleAssignments(vehicle.vehicleId)
        .then(items => { if (active) setLiveAssignments(items) })
        .catch(() => { if (active) { setLiveAssignments([]); setAssignmentsError(true) } })
        .finally(() => { if (active) setAssignmentsLoading(false) })
      return () => { active = false }
    }
    let trips = getActiveTripsForVehicle(vehicle.vehicleId)

    // If vehicle is ON TRIP but has no trip saved in storage yet, seed an active donor assignment
    if (trips.length === 0 && (vehicle.status === 'ON TRIP' || vehicle.status === 'On Trip')) {
      const defaultTrip: VehicleActiveTrip = {
        assignmentId: 'TRIP-' + (vehicle.vehicleId.slice(-4) || '2048'),
        foodRequestId: 'f1000000-0000-4000-8000-000000000001',
        vehicleId: vehicle.vehicleId,
        vehicleReg: vehicle.registrationNumber,
        driverId: vehicle.driverId,
        driverName: vehicle.driverName || 'Ramesh Kumar',
        donorName: 'Royal Orchid Convention Center',
        pickupAddress: 'Royal Orchid Convention Center, Bellary Road, Yelahanka, Bengaluru',
        deliveryDestination: 'AaharaConnect Distribution Center, Indiranagar',
        windowStartsAt: new Date(Date.now() + 1800000).toISOString(),
        windowEndsAt: new Date(Date.now() + 12600000).toISOString(),
        estimatedWeightKg: 66,
        totalVessels: 4,
        foods: [
          { name: 'Basmati Rice', quantity: 30, unit: 'kg', foodType: 'VEG' },
          { name: 'Dal Makhani', quantity: 18, unit: 'kg', foodType: 'VEG' },
          { name: 'Mixed Veg Curry', quantity: 12, unit: 'kg', foodType: 'VEG' },
          { name: 'Gulab Jamun', quantity: 6, unit: 'kg', foodType: 'SWEETS' },
        ],
        equipment: {
          needsRefrigerator: false,
          needsInsulatedBody: true,
          label: 'Insulated Body Required (> 60°C)',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
          reason: 'Cooked surplus food requires thermal body retention to maintain safe temperature (>60°C).',
          containerRecommendation: 'Thermal Hot Boxes with silicone gasket lid clamps',
        },
        status: 'ASSIGNED',
        assignedAt: new Date().toISOString(),
      }
      trips = [defaultTrip]
      try {
        const key = 'aaharaconnect_vehicle_active_trips'
        const existing = JSON.parse(window.localStorage.getItem(key) || '[]')
        window.localStorage.setItem(key, JSON.stringify([defaultTrip, ...existing.filter((t: any) => t.assignmentId !== defaultTrip.assignmentId)]))
      } catch {}
    }

    setActiveTrips(trips)

    // Load available donor requests from backend / donor portal
    void fetchAllDonorRequests().then(donors => {
      setAvailableDonors(donors.filter(d => d.status === 'SUBMITTED'))
    })
  }, [vehicle.vehicleId, vehicle.status, vehicle.registrationNumber, vehicle.driverId, vehicle.driverName])

  // Complete Delivery Action: removes trip and sets vehicle Available
  const handleCompleteDelivery = (assignmentId: string) => {
    completeDeliveryTrip(assignmentId)
    setActiveTrips(prev => prev.filter(t => t.assignmentId !== assignmentId))
    onVehicleStatusChange?.(vehicle.vehicleId, 'AVAILABLE')
    notify?.('Delivery completed! Entry removed and vehicle marked Available.', 'success')
  }

  // Calculate total currently assigned load
  const currentAssignedWeight = activeTrips.reduce((acc, t) => acc + (t.estimatedWeightKg || 0), 0)
  const remainingCapacityKg = Math.max(0, vehicle.capacityKg - currentAssignedWeight)

  // Assign Donor Pickup to this Vehicle
  const handleAssignDonor = (donor: DonorPickupRequest) => {
    if (remainingCapacityKg < donor.estimatedWeightKg) {
      notify?.(
        `Remaining capacity (${remainingCapacityKg} kg of ${vehicle.capacityKg} kg) is insufficient for this pickup (${donor.estimatedWeightKg} kg).`,
        'error'
      )
      return
    }

    const res = assignDonorPickupToVehicle(vehicle, donor)
    if (res.success && res.trip) {
      setActiveTrips(prev => [res.trip!, ...prev])
      onVehicleStatusChange?.(vehicle.vehicleId, 'ON TRIP')
      setShowAssignPanel(false)
      notify?.(`Assigned ${donor.donorName} (${donor.estimatedWeightKg} kg) to this vehicle!`, 'success')
    } else {
      notify?.(res.error || 'Failed to assign donor.', 'error')
    }
  }

  const driver = drivers.find(d => d.driverId === vehicle.driverId)
  const activeDriverName = vehicle.driverName || driver?.name
  const activeDriverPhone = vehicle.driverPhone || driver?.phone
  const activeDriverLicence = vehicle.driverLicence || driver?.licenseNumber || driver?.licenceNumber

  const fallbackMaintenance = isLiveAdmin() ? [] : maintenanceRecords.filter(m => m.vehicleId === vehicle.vehicleId)
  const displayedMaintenance = liveMaintenance ?? fallbackMaintenance

  return (
    <Drawer title={`Vehicle: ${vehicle.registrationNumber}`} onClose={onClose}>
      <div className="p-6 space-y-6">
        {/* Top Header Hero Card */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40 p-5 shadow-xs">
          <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-emerald-200/30 blur-2xl" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-700/20">
                <Truck size={24} className="stroke-[2.2]" />
              </div>
              <div>
                <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-0.5 font-mono text-base font-black tracking-wide text-slate-800 shadow-2xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  {vehicle.registrationNumber}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">{vehicle.type}</span>
                  {vehicle.sizeCategory && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span className="rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 border border-emerald-200/60">
                        {vehicle.sizeCategory}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <StatusBadge status={vehicle.status} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 pt-3.5 border-t border-emerald-100/80 text-xs">
            <div className="rounded-xl border border-emerald-100/80 bg-white/85 p-3 shadow-2xs">
              <span className="block text-[11px] font-semibold text-slate-400">Payload Capacity</span>
              <strong className="mt-0.5 block text-base font-extrabold text-slate-800">{vehicle.capacityKg} kg</strong>
            </div>
            <div className="rounded-xl border border-emerald-100/80 bg-white/85 p-3 shadow-2xs">
              <span className="block text-[11px] font-semibold text-slate-400">Indicative Max Vessels</span>
              <strong className="mt-0.5 block text-base font-extrabold text-slate-800">
                {vehicle.indicativeMaxVessels ? `${vehicle.indicativeMaxVessels}` : '—'}
              </strong>
            </div>
          </div>
        </div>

        {/* Reliable Readiness Evaluation Card */}
        {(() => {
          const isMaintenance = vehicle.status === 'MAINTENANCE' || vehicle.status === 'Maintenance'
            || vehicle.readiness?.dispatchStatus === 'MAINTENANCE_RESTRICTED'
          const isRetired = vehicle.status === 'RETIRED' || vehicle.status === 'Retired'
          const isOnTrip = vehicle.status === 'ON TRIP' || vehicle.status === 'On Trip'
            || (isLiveAdmin() ? liveAssignments.some(item => !['REJECTED', 'CANCELLED', 'FAILED', 'DELIVERED'].includes(item.status)) : activeTrips.length > 0)
          const hasUnsafe = (liveMaintenance ?? (isLiveAdmin() ? [] : maintenanceRecords)).some(
            m => m.vehicleId === vehicle.vehicleId && m.condition === 'UNSAFE'
          )

          const isReady = vehicle.readiness?.isReady ?? (!isMaintenance && !isRetired && !hasUnsafe && !isOnTrip)
          const dispatchStatus = vehicle.readiness?.dispatchStatus ?? (isRetired
            ? 'RETIRED'
            : isMaintenance || hasUnsafe
            ? 'MAINTENANCE'
            : isOnTrip
            ? 'ON TRIP'
            : 'READY')

          return (
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                  <ShieldAlert size={16} className="text-emerald-600" /> Dispatch Readiness
                </h4>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    isReady
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : isOnTrip
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : isRetired
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {dispatchStatus}
                </span>
              </div>

              <div className="text-xs space-y-2">
                {isReady ? (
                  <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50/90 to-teal-50/40 p-3.5 shadow-2xs">
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                    <p className="font-semibold text-emerald-900 leading-snug">
                      Ready for dispatch and food recovery trips.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-rose-200/80 bg-gradient-to-r from-rose-50/90 to-amber-50/40 p-3.5 shadow-2xs">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" />
                    <p className="font-semibold text-rose-900 leading-snug">
                      Not currently dispatchable for new pickups.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* Assigned Driver Card */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <UserRound size={16} className="text-emerald-600" /> Current Assigned Driver
            </h4>
          </div>
          {activeDriverName ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-emerald-200 transition-colors space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center border-2 border-emerald-200 shadow-2xs shrink-0 text-sm">
                    {initials(activeDriverName)}
                  </div>
                  <div>
                    <h5 className="font-bold text-slate-900 text-sm leading-tight">{activeDriverName}</h5>
                    <p className="text-[11px] text-slate-400 mt-0.5">Assigned to vehicle</p>
                  </div>
                </div>
                <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full shrink-0">
                  Assigned via Pickup
                </span>
              </div>

              <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100 text-xs">
                {activeDriverPhone && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1 text-slate-600">
                    <Phone size={13} className="text-emerald-600" />
                    <span>{activeDriverPhone}</span>
                  </div>
                )}
                {activeDriverLicence && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1 font-mono text-slate-600">
                    <span className="font-sans text-slate-400 font-medium">Licence:</span>
                    <span>{activeDriverLicence}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center">
              <UserRound size={22} className="mx-auto text-slate-300 mb-1" />
              <p className="text-xs text-slate-500 italic">
                No driver currently assigned to this vehicle (drivers are linked per pickup dispatch).
              </p>
            </div>
          )}
        </div>

        {/* Live Admin assignment data comes from the canonical Pickup projection. */}
        {isLiveAdmin() ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2"><Clock size={16} className="text-emerald-600"/> Current pickup assignments</h4>
            <p className="text-[11px] text-slate-500">Read-only assignments from Pickup & Logistics. Create and update assignments in that workflow.</p>
            {assignmentsLoading ? <p role="status" className="text-xs text-slate-500">Loading assignments…</p>
              : assignmentsError ? <p role="alert" className="text-xs text-rose-700">Could not load current assignments. Retry from Vehicle Details.</p>
                : liveAssignments.length ? <div className="space-y-2">{liveAssignments.map(item => <article key={item.assignmentId} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><strong>Assignment {item.assignmentId.slice(0, 8)}…</strong><StatusBadge status={item.status}/></div><p className="mt-1 text-slate-600">Pickup {item.pickupId.slice(0, 8)}… · {item.volunteerIds.length} volunteer(s)</p><p className="mt-1 text-slate-600">Window: {item.windowStartsAt ? `${formatDate(item.windowStartsAt)} ${formatTime(item.windowStartsAt)}` : '—'} – {item.windowEndsAt ? `${formatDate(item.windowEndsAt)} ${formatTime(item.windowEndsAt)}` : '—'}</p></article>)}</div>
                  : <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">No current assignments returned for this vehicle.</p>}
          </section>
        ) : <div>
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Clock size={16} className="text-emerald-600" /> Active Trips & Assignments
            </h4>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold">
              Live Food Donor Trips
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mb-2.5">
            Real food donor requests assigned based on payload, volume, and temperature requirements.
          </p>

          {activeTrips.length > 0 ? (
            <div className="space-y-3">
              {activeTrips.map(trip => (
                <div
                  key={trip.assignmentId}
                  className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-xs space-y-3"
                >
                  {/* Top Bar: Trip ID, Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-slate-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                        {trip.assignmentId}
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                        Assigned Trip
                      </span>
                    </div>
                    <StatusBadge status={trip.status} />
                  </div>

                  {/* Donor & Pickup Address */}
                  <div className="space-y-1">
                    <h5 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <MapPin size={15} className="text-emerald-600 shrink-0" />
                      {trip.donorName}
                    </h5>
                    <p className="text-xs text-slate-600 pl-5 leading-relaxed">{trip.pickupAddress}</p>
                    <p className="text-[11px] text-emerald-700 pl-5 font-medium">
                      {`Destination: ${trip.deliveryDestination}`}
                    </p>
                  </div>

                  {/* Pickup Timing Window */}
                  <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50/80 p-2.5 rounded-xl border border-slate-150">
                    <Clock size={14} className="text-emerald-600 shrink-0" />
                    <span>
                      {`Window: ${formatTime(trip.windowStartsAt)} - ${formatTime(trip.windowEndsAt)}`}
                    </span>
                  </div>

                  {/* Cargo Specifications: Weight & Vessels */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl border border-slate-150 bg-slate-50/70 p-2.5">
                      <span className="block text-[10px] font-bold uppercase text-slate-400">Cargo Weight</span>
                      <strong className="text-sm font-extrabold text-slate-800 flex items-center gap-1 mt-0.5">
                        <Scale size={13} className="text-emerald-600" /> {`${trip.estimatedWeightKg} kg`}
                      </strong>
                    </div>
                    <div className="rounded-xl border border-slate-150 bg-slate-50/70 p-2.5">
                      <span className="block text-[10px] font-bold uppercase text-slate-400">Indicative Vessels</span>
                      <strong className="text-sm font-extrabold text-slate-800 flex items-center gap-1 mt-0.5">
                        <Package size={13} className="text-emerald-600" /> {`${trip.totalVessels} Vessels`}
                      </strong>
                    </div>
                  </div>

                  {/* Automatically Calculated Equipment Requirement */}
                  <div className={`p-3 rounded-xl border text-xs space-y-1 ${trip.equipment.badgeClass}`}>
                    <div className="flex items-center gap-1.5 font-bold">
                      {trip.equipment.needsRefrigerator ? (
                        <ThermometerSnowflake size={14} />
                      ) : trip.equipment.needsInsulatedBody ? (
                        <Flame size={14} />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      <span>{trip.equipment.label}</span>
                    </div>
                    <p className="text-[11px] opacity-90 leading-tight">{trip.equipment.reason}</p>
                    <p className="text-[10px] opacity-80 pt-0.5">
                      {`Containers: ${trip.equipment.containerRecommendation}`}
                    </p>
                  </div>

                  {/* Food Items Breakdown */}
                  {trip.foods && trip.foods.length > 0 && (
                    <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                      <span className="font-semibold text-slate-700">Food Items: </span>
                      <span>{trip.foods.map(f => `${f.name} (${f.quantity} ${f.unit})`).join(', ')}</span>
                    </div>
                  )}

                  {/* Completed Delivery Action Button */}
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleCompleteDelivery(trip.assignmentId)}
                      className="w-full h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-xs shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CheckCircle2 size={16} /> Completed
                    </button>
                  </div>
                </div>
              ))}

              {/* Action Button: Assign Another Donor Pickup */}
              {vehicle.status !== 'MAINTENANCE' && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAssignPanel(!showAssignPanel)}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                  >
                    <Plus size={15} />
                    <span>Assign Food Donor Pickup</span>
                    <span className="ml-auto text-[11px] font-mono font-medium text-emerald-700 bg-white/80 px-2 py-0.5 rounded-md border border-emerald-200">
                      {`${remainingCapacityKg} kg free`}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-5 text-center space-y-2">
              <Truck size={24} className="mx-auto text-slate-300" />
              <p className="text-xs text-slate-500 font-medium">
                No active or scheduled assignments for this vehicle.
              </p>
              {vehicle.status !== 'MAINTENANCE' && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAssignPanel(!showAssignPanel)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer mt-1"
                  >
                    <Plus size={14} /> Assign Food Donor Pickup
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quick Assign Panel (Visible if vehicle is Available) */}
          {showAssignPanel && (
            <div className="mt-3 p-4 bg-emerald-50/40 rounded-2xl border border-emerald-200 space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                  <Package size={14} /> Available Food Donor Pickups
                </h5>
                <button
                  type="button"
                  onClick={() => setShowAssignPanel(false)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Close
                </button>
              </div>

              {availableDonors.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No pending food donor requests available.</p>
              ) : (
                <div className="space-y-2">
                  {availableDonors.map(donor => {
                    const fits = remainingCapacityKg >= donor.estimatedWeightKg
                    return (
                      <div
                        key={donor.id}
                        className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-2 shadow-2xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <strong className="text-slate-800 text-sm block">{donor.donorName}</strong>
                            <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <MapPin size={11} className="text-emerald-600 shrink-0" />
                              <span>{donor.pickupAddress}</span>
                            </p>
                          </div>
                          <span className="font-bold text-slate-700 shrink-0 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {`${donor.estimatedWeightKg} kg`}
                          </span>
                        </div>

                        <div className={`p-2 rounded-lg text-[11px] ${donor.equipment.badgeClass}`}>
                          {donor.equipment.label}
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-slate-500">
                            {fits
                              ? `✓ Fits remaining capacity (${remainingCapacityKg} kg free)`
                              : `⚠️ Exceeds free capacity (${remainingCapacityKg} kg free)`}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAssignDonor(donor)}
                            disabled={!fits}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Truck size={13} /> Assign
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>}

        {/* Maintenance History */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Wrench size={16} className="text-emerald-600" /> Maintenance Records
            </h4>
          </div>

          {displayedMaintenance.length > 0 ? (
            <div className="space-y-2">
              {displayedMaintenance.map((m: any) => (
                <div
                  key={m.id || m.recordId}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-emerald-200 transition-colors space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                      <Wrench size={13} className="text-emerald-600" />
                      {m.serviceType || 'Service Record'}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        m.condition === 'GOOD'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : m.condition === 'NEEDS_SERVICE'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {m.condition}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{m.summary}</p>
                  <div className="flex items-center justify-between text-slate-400 pt-1 text-[11px] border-t border-slate-100">
                    <span>Serviced: {formatDate(m.servicedOn)}</span>
                    {m.nextServiceDueOn && <span>Next Due: {formatDate(m.nextServiceDueOn)}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center">
              <Wrench size={20} className="mx-auto text-slate-300 mb-1" />
              <p className="text-xs text-slate-500 italic">
                No service logs recorded yet.
              </p>
            </div>
          )}
        </div>

        {/* Sticky Drawer Action Buttons */}
        <div className="sticky bottom-0 -mx-6 -mb-6 p-4 bg-white/95 backdrop-blur-md border-t border-slate-200 flex gap-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-10">
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 h-11 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-semibold text-sm shadow-2xs transition-all flex items-center justify-center gap-2 hover:border-slate-400 cursor-pointer"
          >
            <Edit2 size={16} className="text-slate-500" />
            <span>Edit Specs</span>
          </button>
          <button
            type="button"
            onClick={onLogMaintenance}
            className="flex-1 h-11 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 active:from-emerald-800 active:to-emerald-900 text-white font-semibold text-sm shadow-md shadow-emerald-700/25 transition-all flex items-center justify-center gap-2 cursor-pointer border border-emerald-600"
          >
            <Wrench size={16} className="text-white" />
            <span>Log Service</span>
          </button>
        </div>
      </div>
    </Drawer>
  )
}
