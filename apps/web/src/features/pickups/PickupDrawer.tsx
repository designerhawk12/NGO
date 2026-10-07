import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Sparkles,
  Truck,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Drawer, formatDate, formatTime, StatusBadge } from '../../components/common/UI'
import { isLiveAdmin, map409ErrorMessage } from './adapters'
import { calculateAiLogistics } from './aiLogistics'
import { transitionAssignment } from './api'
import { updateDemoPickupStatus, useVehicleAssignments } from './hooks'
import type { LiveAssignment, Pickup, PickupStatus } from './types'

interface Props {
  pickup: Pickup
  assignment?: LiveAssignment | null
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
  onClose,
  onOpenAssign,
  onAssignmentUpdated,
  notify,
}: Props) {
  const currentStepIndex = statusSteps.indexOf(pickup.status)
  const isCancelledOrFailed = pickup.status === 'CANCELLED' || pickup.status === 'FAILED'

  const aiAssessment = useMemo(
    () =>
      pickup.aiAssessment ||
      calculateAiLogistics(pickup.foods || [], pickup.donorName, pickup.donorLocation),
    [pickup]
  )

  const { assignments: vehicleAssignments, loading: loadingVehicleProj } = useVehicleAssignments(
    assignment?.vehicleId
  )

  const [transitionReason, setTransitionReason] = useState('')
  const [submittingAction, setSubmittingAction] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleAdminAction = async (action: 'DELIVER' | 'CANCEL' | 'FAIL') => {
    if (!assignment) return
    if ((action === 'CANCEL' || action === 'FAIL') && !transitionReason.trim()) {
      notify('A reason is required to cancel or mark failure.', 'error')
      return
    }
    setSubmittingAction(true)
    setActionError(null)
    try {
      const updated = await transitionAssignment(
        assignment.id,
        action,
        assignment.version,
        transitionReason.trim() || undefined
      )
      notify(`Assignment updated: ${action}`)
      setTransitionReason('')
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
    if (onAssignmentUpdated && assignment) {
      onAssignmentUpdated({ ...assignment, status: nextStatus as any })
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
        {!isLiveAdmin() && pickup.status !== 'PLANNED' && !isCancelledOrFailed && (
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
        {isLiveAdmin() && assignment && !isCancelledOrFailed && (
          <div className="detail-section">
            <h3>Admin Actions</h3>
            {actionError && (
              <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                {actionError}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {assignment.status === 'FOOD_COLLECTED' && (
                <button
                  type="button"
                  className="button button-primary full-width"
                  disabled={submittingAction}
                  onClick={() => handleAdminAction('DELIVER')}
                >
                  Deliver
                </button>
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
        )}

        {/* Vehicle Projection View */}
        {assignment?.vehicleId && (
          <div className="detail-section">
            <h3>Vehicle view</h3>
            <p className="quiet-text">Module 3 vehicle assignment projection.</p>
            {loadingVehicleProj ? (
              <p>Loading vehicle schedule…</p>
            ) : vehicleAssignments.length === 0 ? (
              <p>No active projection items for this vehicle.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {vehicleAssignments.map(va => (
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
                      {formatTime(va.pickupWindow.windowStartsAt)} –{' '}
                      {formatTime(va.pickupWindow.windowEndsAt)}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  )
}
