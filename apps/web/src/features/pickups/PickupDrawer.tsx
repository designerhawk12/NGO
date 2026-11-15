import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MapPin,
  Navigation,
  Sparkles,
  Truck,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Drawer, formatDate, formatTime, StatusBadge } from '../../components/common/UI'
import { isLiveAdmin, map409ErrorMessage } from './adapters'
import { calculateAiLogistics } from './aiLogistics'
import { fetchActiveAssignment, transitionAssignment } from './api'
import {
  getDemoAssignment,
  updateDemoAssignmentStatus,
  updateDemoPickupStatus,
  useAssignWizardResources,
  usePickupVessels,
  useVehicleAssignments,
} from './hooks'
import type { LiveAssignment, Pickup, PickupStatus } from './types'
import { buildTripRoute } from './vehicleRouting'

interface Props {
  pickup: Pickup
  assignment?: LiveAssignment | null
  open?: boolean
  onClose: () => void
  onOpenAssign: () => void
  onAssignmentUpdated?: (assignment: LiveAssignment) => void
  notify: (message: string, kind?: 'success' | 'error') => void
}

const statusSteps: PickupStatus[] = [
  'PLANNED',
  'ASSIGNED',
  'EN_ROUTE',
  'ARRIVED_AT_DONOR',
  'FOOD_COLLECTED',
  'DELIVERED',
]

const TERMINAL_STATUSES = new Set(['DELIVERED', 'CANCELLED', 'FAILED', 'REJECTED'])

const friendlyNames: Record<string, string> = {
  PLANNED: 'Planned',
  ASSIGNED: 'Assigned',
  EN_ROUTE: 'En Route',
  ARRIVED_AT_DONOR: 'Arrived At Donor',
  FOOD_COLLECTED: 'Food Collected',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
}

export function PickupDrawer({
  pickup,
  assignment,
  open = true,
  onClose,
  onOpenAssign,
  onAssignmentUpdated,
  notify,
}: Props) {
  const currentStepIndex = statusSteps.indexOf(pickup.status)
  const isCancelledOrFailed = pickup.status === 'CANCELLED' || pickup.status === 'FAILED'

  const [currentAssignment, setCurrentAssignment] = useState<LiveAssignment | null>(() => {
    if (!isLiveAdmin() && pickup?.id) {
      if (assignment?.pickupId === pickup.id) return assignment
      return getDemoAssignment(pickup.id)
    }
    return null
  })
  const [loadingAssignment, setLoadingAssignment] = useState(false)
  const [assignmentError, setAssignmentError] = useState<string | null>(null)

  const { volunteers: resourceVolunteers, drivers: resourceDrivers, vehicles: resourceVehicles } = useAssignWizardResources()
  const { issuedVessels } = usePickupVessels(pickup?.id)

  const resolvedDriver = useMemo(() => {
    if (!currentAssignment?.driverId) return null
    return (resourceDrivers as any[]).find(d => (d.driverId || d.id) === currentAssignment.driverId) || null
  }, [currentAssignment?.driverId, resourceDrivers])

  const resolvedVehicle = useMemo(() => {
    if (!currentAssignment?.vehicleId) return null
    return (resourceVehicles as any[]).find(v => (v.vehicleId || v.id) === currentAssignment.vehicleId) || null
  }, [currentAssignment?.vehicleId, resourceVehicles])

  const resolvedVolunteers = useMemo(() => {
    if (!currentAssignment?.volunteerIds || currentAssignment.volunteerIds.length === 0) return []
    return currentAssignment.volunteerIds.map(id => {
      const match = (resourceVolunteers as any[]).find(v => (v.volunteerId || v.id) === id)
      return { id, name: match?.name || match?.fullName || id }
    })
  }, [currentAssignment?.volunteerIds, resourceVolunteers])

  const assignedTripRoute = useMemo(() => {
    if (!resolvedVehicle) return null
    return buildTripRoute(
      resolvedVehicle,
      pickup?.donorLocation || (pickup as any)?.pickupAddress || '',
      pickup?.deliveryAddress || ''
    )
  }, [resolvedVehicle, pickup?.donorLocation, (pickup as any)?.pickupAddress, pickup?.deliveryAddress])

  useEffect(() => {
    let isCancelled = false

    if (!open || !pickup?.id) {
      setCurrentAssignment(null)
      setAssignmentError(null)
      setLoadingAssignment(false)
      return
    }

    // Always clear immediately when switching pickups to guarantee previous pickup's assignment never leaks
    setCurrentAssignment(null)
    setAssignmentError(null)

    if (!isLiveAdmin()) {
      if (assignment && assignment.pickupId === pickup.id) {
        setCurrentAssignment(assignment)
      } else {
        const stored = getDemoAssignment(pickup.id)
        if (stored) {
          setCurrentAssignment(stored)
        }
      }
      setLoadingAssignment(false)
      return
    }

    setLoadingAssignment(true)
    fetchActiveAssignment(pickup.id)
      .then(data => {
        if (!isCancelled) {
          setCurrentAssignment(data)
          setAssignmentError(null)
        }
      })
      .catch(err => {
        if (!isCancelled) {
          console.error('Failed to fetch active assignment:', err)
          setCurrentAssignment(null)
          setAssignmentError('Unable to load active assignment.')
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setLoadingAssignment(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [open, pickup?.id, assignment])

  const aiAssessment = useMemo(
    () =>
      pickup.aiAssessment ||
      calculateAiLogistics(pickup.foods || [], pickup.donorName, pickup.donorLocation),
    [pickup]
  )

  const { assignments: vehicleAssignments, loading: loadingVehicleProj } = useVehicleAssignments(
    currentAssignment?.vehicleId
  )

  const [transitionReason, setTransitionReason] = useState('')
  const [submittingAction, setSubmittingAction] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleAdminAction = async (action: 'ACCEPT' | 'START' | 'ARRIVE' | 'COLLECT' | 'DELIVER' | 'CANCEL' | 'FAIL') => {
    if (!currentAssignment) return
    if ((action === 'CANCEL' || action === 'FAIL') && !transitionReason.trim()) {
      notify('A reason is required to cancel or mark failure.', 'error')
      return
    }
    setSubmittingAction(true)
    setActionError(null)
    try {
      const updated = await transitionAssignment(
        currentAssignment.id,
        action,
        currentAssignment.version,
        transitionReason.trim() || undefined
      )
      notify(`Assignment updated: ${action}`)
      setTransitionReason('')

      if (TERMINAL_STATUSES.has(updated.status)) {
        setCurrentAssignment(null)
      } else {
        setCurrentAssignment(updated)
      }

      try {
        const refreshed = await fetchActiveAssignment(pickup.id)
        setCurrentAssignment(refreshed)
      } catch {
        if (TERMINAL_STATUSES.has(updated.status)) {
          setCurrentAssignment(null)
        }
      }

      if (onAssignmentUpdated) onAssignmentUpdated(updated)
    } catch (err: unknown) {
      const msg = map409ErrorMessage(err)
      setActionError(msg)
      notify(msg, 'error')
    } finally {
      setSubmittingAction(false)
    }
  }

  const handleDemoTransition = (nextStatus: PickupStatus) => {
    updateDemoPickupStatus(pickup.id, nextStatus)
    pickup.status = nextStatus
    notify(`Pickup status updated to ${friendlyNames[nextStatus] || nextStatus}`)
    if (currentAssignment) {
      const updated = updateDemoAssignmentStatus(currentAssignment.id, nextStatus as any)
      if (updated) setCurrentAssignment(updated)
      if (onAssignmentUpdated) {
        onAssignmentUpdated(updated || { ...currentAssignment, status: nextStatus as any })
      }
    }
  }

  return (
    <Drawer title="Pickup details" onClose={onClose}>
      <div className="drawer-body">
        <div className="assignment-detail-hero">
          <span className="muted-id">{pickup.id}</span>
          <h2>{pickup.donorName || 'Food Donor'}</h2>
          <StatusBadge status={friendlyNames[pickup.status] || pickup.status} />
          <p style={{ marginTop: '0.4rem', color: '#1e293b' }}>
            <MapPin size={16} /> <strong>Pickup from:</strong> {pickup.donorLocation || 'Donor Location'}
          </p>
          <p style={{ margin: '0.2rem 0 0', color: '#047857', fontSize: '0.88rem' }}>
            <strong>Deliver to NGO:</strong> {pickup.deliveryAddress}
          </p>
          {pickup.foods && pickup.foods.length > 0 && (
            <p style={{ margin: '0.35rem 0 0', color: '#b45309', fontWeight: 600, fontSize: '0.88rem' }}>
              🥘 Food to collect: {pickup.foods.map(f => `${f.name} (${f.quantity} ${f.unit})`).join(', ')}
            </p>
          )}
        </div>

        {/* AI Logistics Assessment Section */}
        <div
          className="detail-section"
          style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
            border: '1px solid #a7f3d0',
            borderRadius: '10px',
            padding: '1rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.6rem',
            }}
          >
            <h3
              style={{
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                color: '#065f46',
                fontSize: '0.95rem',
              }}
            >
              <Sparkles size={16} /> AI Logistics Assessment
            </h3>
            <span
              style={{
                background: '#d1fae5',
                color: '#065f46',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '999px',
              }}
            >
              {`${aiAssessment.vehicle.suitabilityScore}% Match`}
            </span>
          </div>

          <div style={{ marginBottom: '0.6rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontWeight: 600,
                fontSize: '0.85rem',
              }}
            >
              <Truck size={15} style={{ color: '#059669' }} />
              <span>Recommended Vehicle</span>
              <span>:</span>
              <strong style={{ color: '#047857' }}>{aiAssessment.vehicle.vehicleType}</strong>
            </div>
            <p style={{ margin: '3px 0 0', color: '#475569', fontSize: '0.78rem' }}>
              {aiAssessment.vehicle.reason}
            </p>
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem' }}>
              <span>Required Vessels</span>
              <span>:</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {aiAssessment.vessels.map(v => (
                <div
                  key={v.containerType}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '0.45rem 0.65rem',
                    fontSize: '0.8rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span>{`${v.count}x ${v.containerType}`}</span>
                    <span style={{ color: '#059669' }}>{v.capacityPerUnit}</span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '2px' }}>
                    {v.purpose}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stepper */}
        <div className="detail-section">
          <h3>Pickup progress</h3>
          {isCancelledOrFailed ? (
            <div className="wizard-tip" style={{ color: '#dc2626' }}>
              <AlertCircle size={18} /> {friendlyNames[pickup.status] || pickup.status}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                margin: '1rem 0',
                paddingLeft: '0.5rem',
              }}
            >
              {statusSteps.map((stepKey, idx) => {
                const isPassed = currentStepIndex >= idx
                const isCurrent = currentStepIndex === idx
                return (
                  <div
                    key={stepKey}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      opacity: isPassed ? 1 : 0.45,
                    }}
                  >
                    <span
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: isCurrent ? '#059669' : isPassed ? '#10b981' : '#e5e7eb',
                        color: isPassed ? '#ffffff' : '#6b7280',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      {isPassed ? <CheckCircle2 size={16} /> : idx + 1}
                    </span>
                    <strong style={{ fontSize: '0.9rem' }}>
                      {friendlyNames[stepKey] || stepKey}
                    </strong>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Overview */}
        <div className="detail-section">
          <h3>Pickup overview</h3>
          <div className="detail-grid">
            <div>
              <span>Window Start</span>
              <strong>
                <Clock3 size={15} />
                {formatDate(pickup.windowStartsAt)} · {formatTime(pickup.windowStartsAt)}
              </strong>
            </div>
            <div>
              <span>Window End</span>
              <strong>
                <Clock3 size={15} />
                {formatDate(pickup.windowEndsAt)} · {formatTime(pickup.windowEndsAt)}
              </strong>
            </div>
            <div>
              <span>Food Request</span>
              <strong>{pickup.foodRequestId}</strong>
            </div>
            <div>
              <span>Created</span>
              <strong>
                <CalendarDays size={15} />
                {formatDate(pickup.createdAt)}
              </strong>
            </div>
          </div>
        </div>

        {/* Active Assignment Details */}
        {loadingAssignment && (
          <div className="detail-section">
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Loading pickups…</p>
          </div>
        )}
        {assignmentError && !loadingAssignment && (
          <div className="detail-section">
            <div style={{ color: '#dc2626', fontSize: '0.85rem' }}>
              {assignmentError}
            </div>
          </div>
        )}
        {currentAssignment && !loadingAssignment && (
          <div className="detail-section">
            <h3>Assignment details</h3>
            <div className="detail-grid">
              <div>
                <span>Assignment ID</span>
                <strong style={{ wordBreak: 'break-all' }}>{currentAssignment.id}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>
                  <span className="live-status">{currentAssignment.status.replaceAll('_', ' ')}</span>
                </strong>
              </div>
              <div>
                <span>Driver</span>
                <strong style={{ wordBreak: 'break-all' }}>
                  {resolvedDriver?.name ? (
                    <>
                      <div>{resolvedDriver.name}</div>
                      <small style={{ color: '#64748b', fontWeight: 400 }}>{currentAssignment.driverId}</small>
                    </>
                  ) : (
                    currentAssignment.driverId
                  )}
                </strong>
              </div>
              <div>
                <span>Vehicle</span>
                <strong style={{ wordBreak: 'break-all' }}>
                  {resolvedVehicle?.registrationNumber ? (
                    <>
                      <div>{resolvedVehicle.registrationNumber} {resolvedVehicle.kind || resolvedVehicle.type ? `(${resolvedVehicle.kind || resolvedVehicle.type})` : ''}</div>
                      <small style={{ color: '#64748b', fontWeight: 400 }}>{currentAssignment.vehicleId}</small>
                    </>
                  ) : (
                    currentAssignment.vehicleId
                  )}
                </strong>
              </div>
              <div>
                <span>Volunteers</span>
                <strong>
                  {resolvedVolunteers.length > 0 ? (
                    <>
                      <div>{resolvedVolunteers.map(v => {
                        const response=currentAssignment.crewResponses?.find(member=>member.volunteerId===v.id)?.response ?? 'PENDING'
                        return `${v.name} (${response.toLowerCase()})`
                      }).join(', ')}</div>
                      <small style={{ color: '#64748b', fontWeight: 400 }}>{`(${currentAssignment.volunteerIds.length} assigned)`}</small>
                    </>
                  ) : (
                    currentAssignment.volunteerIds.length
                  )}
                </strong>
              </div>
              {currentAssignment.teamId && (
                <div>
                  <span>Team</span>
                  <strong style={{ wordBreak: 'break-all' }}>{currentAssignment.teamId}</strong>
                </div>
              )}
              <div>
                <span>{'Issued Vessels'}</span>
                <strong>
                  {issuedVessels.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {issuedVessels.map(vsl => (
                        <div key={vsl.id} style={{ fontSize: '0.8rem', color: '#047857' }}>
                          ✓ {`${vsl.vesselCode} — ${vsl.name} (${vsl.capacityValue} ${vsl.capacityUnit})`}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.82rem' }}>
                      {'No tracked vessels issued'}
                    </span>
                  )}
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* Assigned Vehicle Route & Navigation */}
        {assignedTripRoute && (
          <div
            className="detail-section"
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>
                <Navigation size={16} style={{ color: '#059669' }} />
                <span>{'Assigned Route & Vehicle Proximity'}</span>
              </div>
              <a
                href={assignedTripRoute.navigationUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#047857',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  textDecoration: 'none',
                  background: '#ffffff',
                  border: '1px solid #a7f3d0',
                  borderRadius: '4px',
                  padding: '2px 8px',
                }}
              >
                {'Google Maps Navigation'} <ExternalLink size={12} />
              </a>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>{'Vehicle Station:'}</span>
                <span style={{ color: '#334155' }}>{assignedTripRoute.vehicleLocation.isLiveGps ? '🟢 Live GPS: ' : '🏢 Depot: '}{assignedTripRoute.vehicleLocation.name}</span>
                <span style={{ background: '#ecfdf5', color: '#065f46', fontSize: '0.72rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px' }}>
                  {`📍 ${assignedTripRoute.distanceToDonorKm} km to donor (~${assignedTripRoute.durationToDonorMins} mins)`}
                </span>
              </div>

              <div style={{ color: '#64748b', fontSize: '0.76rem' }}>
                {`Total Trip: ${assignedTripRoute.totalDistanceKm} km (~${assignedTripRoute.totalDurationMins} mins dispatch & delivery)`}
              </div>

              {/* Legs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 8px' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{'🚀 Leg 1: Station ➔ Donor Venue'}</span>
                    <span style={{ color: '#059669' }}>{`${assignedTripRoute.legs?.[0]?.distanceKm ?? 0} km · ~${assignedTripRoute.legs?.[0]?.durationMins ?? 0} min`}</span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '2px' }}>
                    {assignedTripRoute.legs?.[0]?.instructions?.[1] || assignedTripRoute.legs?.[0]?.instructions?.[0] || ''}
                  </div>
                </div>

                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 8px' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{'🥘 Leg 2: Donor Venue ➔ Distribution Center'}</span>
                    <span style={{ color: '#059669' }}>{`${assignedTripRoute.legs?.[1]?.distanceKm ?? 0} km · ~${assignedTripRoute.legs?.[1]?.durationMins ?? 0} min`}</span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '2px' }}>
                    {assignedTripRoute.legs?.[1]?.instructions?.[1] || assignedTripRoute.legs?.[1]?.instructions?.[0] || ''}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Assign Action */}
        {pickup.status === 'PLANNED' && (
          <div className="detail-section">
            <button
              type="button"
              className="button button-primary full-width"
              onClick={onOpenAssign}
            >
              Assign Crew & Vehicle
            </button>
          </div>
        )}

        {/* Demo status transitions */}
        {!isLiveAdmin() && pickup.status !== 'PLANNED' && !isCancelledOrFailed && pickup.status !== 'DELIVERED' && (
          <div className="detail-section">
            <h3>Admin Actions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {pickup.status === 'ASSIGNED' && (
                <button
                  type="button"
                  className="button button-primary full-width"
                  onClick={() => handleDemoTransition('EN_ROUTE')}
                >
                  Mark En Route
                </button>
              )}
              {pickup.status === 'EN_ROUTE' && (
                <button
                  type="button"
                  className="button button-primary full-width"
                  onClick={() => handleDemoTransition('ARRIVED_AT_DONOR')}
                >
                  Arrived At Donor
                </button>
              )}
              {pickup.status === 'ARRIVED_AT_DONOR' && (
                <button
                  type="button"
                  className="button button-primary full-width"
                  onClick={() => handleDemoTransition('FOOD_COLLECTED')}
                >
                  Food Collected
                </button>
              )}
              {pickup.status === 'FOOD_COLLECTED' && (
                <button
                  type="button"
                  className="button button-primary full-width"
                  onClick={() => handleDemoTransition('DELIVERED')}
                >
                  Deliver
                </button>
              )}
            </div>
          </div>
        )}

        {/* Live Admin Transitions */}
        {isLiveAdmin() &&
          currentAssignment &&
          !TERMINAL_STATUSES.has(currentAssignment.status) &&
          !isCancelledOrFailed &&
          pickup.status !== 'DELIVERED' && (() => {
            // Compute trip route once for this assignment (vehicle location -> donor -> delivery)
            // We pass a minimal vehicle stub so getVehicleLocation resolves the fleet depot from vehicleId
            const tripRoute = buildTripRoute(
              { id: currentAssignment.vehicleId },
              pickup.donorLocation,
              pickup.deliveryAddress
            )
            const [dLat, dLng] = tripRoute.donorLocation.coordinates
            const [delivLat, delivLng] = tripRoute.deliveryLocation.coordinates

            // Individual Maps URLs
            const mapsTodonor = `https://www.google.com/maps/dir/?api=1&destination=${dLat},${dLng}&travelmode=driving`
            const mapsToDelivery = `https://www.google.com/maps/dir/?api=1&destination=${delivLat},${delivLng}&travelmode=driving`

            return (
              <div className="detail-section">
                <h3>Dispatch Actions</h3>

                {/* Route summary chip */}
                <div style={{ fontSize: '0.78rem', color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.4rem 0.6rem', marginBottom: '0.6rem' }}>
                  📍 {tripRoute.routeSummary}
                </div>

                {actionError && (
                  <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    {actionError}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                  {/* ACCEPT: PENDING -> ACCEPTED */}
                  {currentAssignment.status === 'PENDING' && (
                    <button
                      type="button"
                      className="button button-primary full-width"
                      disabled={submittingAction}
                      onClick={() => handleAdminAction('ACCEPT')}
                    >
                      Accept Assignment
                    </button>
                  )}

                  {/* START TRIP: ACCEPTED -> EN_ROUTE */}
                  {currentAssignment.status === 'ACCEPTED' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <a
                        href={tripRoute.navigationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.55rem 0.8rem', background: '#f0fdf4', border: '1.5px solid #6ee7b7', borderRadius: '7px', color: '#065f46', fontWeight: 600, fontSize: '0.84rem', textDecoration: 'none' }}
                      >
                        <Navigation size={15} style={{ color: '#059669' }} />
                        View Optimal Route — {tripRoute.distanceToDonorKm} km · ~{tripRoute.durationToDonorMins} min to donor
                        <ExternalLink size={12} style={{ marginLeft: 'auto' }} />
                      </a>
                      <button
                        type="button"
                        className="button button-primary full-width"
                        disabled={submittingAction}
                        onClick={() => handleAdminAction('START')}
                      >
                        Start Trip — Mark EN ROUTE
                      </button>
                    </div>
                  )}

                  {/* ARRIVE: EN_ROUTE -> ARRIVED_AT_DONOR */}
                  {currentAssignment.status === 'EN_ROUTE' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <a
                        href={mapsTodonor}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.55rem 0.8rem', background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: '7px', color: '#1d4ed8', fontWeight: 600, fontSize: '0.84rem', textDecoration: 'none' }}
                      >
                        <Navigation size={15} />
                        Navigate to Donor — {tripRoute.donorLocation.name}
                        <ExternalLink size={12} style={{ marginLeft: 'auto' }} />
                      </a>
                      <button
                        type="button"
                        className="button button-primary full-width"
                        disabled={submittingAction}
                        onClick={() => handleAdminAction('ARRIVE')}
                      >
                        Mark Arrived at Donor
                      </button>
                    </div>
                  )}

                  {/* COLLECT: ARRIVED_AT_DONOR -> FOOD_COLLECTED */}
                  {currentAssignment.status === 'ARRIVED_AT_DONOR' && (
                    <button
                      type="button"
                      className="button button-primary full-width"
                      disabled={submittingAction}
                      onClick={() => handleAdminAction('COLLECT')}
                    >
                      Confirm Food Collected
                    </button>
                  )}

                  {/* DELIVER: FOOD_COLLECTED -> DELIVERED */}
                  {currentAssignment.status === 'FOOD_COLLECTED' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <a
                        href={mapsToDelivery}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.55rem 0.8rem', background: '#fefce8', border: '1.5px solid #fde68a', borderRadius: '7px', color: '#92400e', fontWeight: 600, fontSize: '0.84rem', textDecoration: 'none' }}
                      >
                        <Navigation size={15} />
                        Navigate to Distribution Center — {tripRoute.deliveryLocation.name}
                        <ExternalLink size={12} style={{ marginLeft: 'auto' }} />
                      </a>
                      <button
                        type="button"
                        className="button button-primary full-width"
                        disabled={submittingAction}
                        onClick={() => handleAdminAction('DELIVER')}
                      >
                        Confirm Delivered
                      </button>
                    </div>
                  )}

                  <label className="field">
                    <span>Reason for Cancellation / Failure</span>
                    <input
                      type="text"
                      placeholder="Enter reason"
                      value={transitionReason}
                      onChange={e => setTransitionReason(e.target.value)}
                    />
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="button button-danger"
                      disabled={submittingAction}
                      onClick={() => handleAdminAction('CANCEL')}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button button-danger"
                      disabled={submittingAction}
                      onClick={() => handleAdminAction('FAIL')}
                    >
                      Fail
                    </button>
                  </div>
                </div>
              </div>
            )
          })()
        }

        {/* Vehicle Projection View */}
        {currentAssignment?.vehicleId && (
          <div className="detail-section">
            <h3>Vehicle view</h3>
            <p className="quiet-text">Module 3 vehicle assignment projection.</p>
            {loadingVehicleProj ? (
              <p>Loading vehicle schedule…</p>
            ) : vehicleAssignments.length === 0 ? (
              <p>No active projection items for this vehicle.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {vehicleAssignments.map(va => {
                  const start = va.windowStartsAt || va.pickupWindow?.windowStartsAt
                  const end = va.windowEndsAt || va.pickupWindow?.windowEndsAt
                  return (
                    <div
                      key={va.assignmentId}
                      style={{
                        padding: '0.5rem',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                      }}
                    >
                      <div>
                        <Truck size={14} /> <strong>{va.assignmentId}</strong> · {va.status}
                      </div>
                      <small>
                        {start ? formatTime(start) : 'N/A'} – {end ? formatTime(end) : 'N/A'}
                      </small>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  )
}
