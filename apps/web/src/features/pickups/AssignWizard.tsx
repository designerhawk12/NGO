import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Navigation,
  ShieldAlert,
  Sparkles,
  Truck,
  User,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../../components/common/UI'
import { isLiveAdmin, map409ErrorMessage } from './adapters'
import { calculateAiLogistics, rankVehiclesForPickup, rankVolunteersForPickup } from './aiLogistics'
import { createAssignment, fetchEligibleVolunteersForPickup } from './api'
import { saveDemoAssignment, updateDemoPickupStatus, useAssignWizardResources } from './hooks'
import type { LiveAssignment, Pickup } from './types'

interface Props {
  pickup: Pickup
  onClose: () => void
  onSuccess: (assignment: LiveAssignment) => void
  notify: (message: string, kind?: 'success' | 'error') => void
}

const wizardSteps = [
  'Select Volunteers',
  'Select Driver',
  'Select Vehicle',
  'Containers',
  'Review Assignment',
]

const demoVolunteersFallback = [
  { volunteerId: 'vol-1', name: 'Kavya Iyer', role: 'Packing Volunteer', skills: ['Packing', 'Food Safety'] },
  { volunteerId: 'vol-2', name: 'Amit Patel', role: 'Loading Crew', skills: ['Packing', 'Heavy Lifting'] },
  { volunteerId: 'vol-3', name: 'Neha Rao', role: 'Food Inspector', skills: ['Food Safety', 'Packing'] },
  { volunteerId: 'vol-4', name: 'Rohan Verma', role: 'Distribution Volunteer', skills: ['Distribution', 'Packaging'] },
  { volunteerId: 'vol-5', name: 'Vikram Singh', role: 'Volunteer Driver', skills: ['Driving'] },
]

const demoDriversFallback = [
  { driverId: 'drv-1', name: 'Rahul Kumar', licenceStatus: 'VALID' },
  { driverId: 'drv-2', name: 'Suresh Gowda', licenceStatus: 'VALID' },
  { driverId: 'drv-3', name: 'Priya Sharma', licenceStatus: 'VALID' },
]

const demoVehiclesFallback = [
  { vehicleId: 'veh-1', registrationNumber: 'KA 01 AB 1234', type: '3-Wheeler Cargo Auto', capacity: 120 },
  { vehicleId: 'veh-2', registrationNumber: 'KA 05 XY 5678', type: 'Tata Ace Mini Truck', capacity: 500 },
  { vehicleId: 'veh-3', registrationNumber: 'KA 03 EV 9012', type: 'Two-Wheeler EV Scooter', capacity: 25 },
  { vehicleId: 'veh-4', registrationNumber: 'KA 04 CR 3456', type: 'Refrigerated Cargo Van', capacity: 1200 },
]

export function AssignWizard({ pickup, onClose, onSuccess, notify }: Props) {
  const [step, setStep] = useState(0)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [selectedVolunteerIds, setSelectedVolunteerIds] = useState<string[]>([])
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [selectedVesselIds, setSelectedVesselIds] = useState<string[]>([])
  const [role] = useState('Pickup Volunteer')
  const [expandedRouteVehicleId, setExpandedRouteVehicleId] = useState<string | null>(null)

  const aiAssessment = useMemo(
    () =>
      pickup.aiAssessment ||
      calculateAiLogistics(pickup.foods || [], pickup.donorName, pickup.donorLocation),
    [pickup]
  )

  const [containerCount, setContainerCount] = useState(
    () => aiAssessment.vessels.reduce((acc, v) => acc + v.count, 0) || 2
  )
  const [estimatedLoadKg, setEstimatedLoadKg] = useState(
    () => aiAssessment.totalEstimatedWeightKg || 30
  )
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [volunteerEligibility, setVolunteerEligibility] = useState<{
    windowStartsAt: string
    windowEndsAt: string
    volunteerIds: string[]
    reservationConflictVolunteerIds: string[]
    blockingReason: string | null
    foodPickupDeadline: string
    requiresNewDonorRequest: boolean
  } | null>(null)
  const [volunteerEligibilityError, setVolunteerEligibilityError] = useState<string | null>(null)
  const [checkingVolunteerEligibility, setCheckingVolunteerEligibility] = useState(isLiveAdmin())

  const {
    volunteers,
    drivers,
    vehicles,
    vessels,
    waitingTeam1,
    waitingTeam5Drivers,
    waitingTeam5Vehicles,
    waitingVessels,
  } = useAssignWizardResources()

  const activeVolunteers = volunteers.length > 0 ? volunteers : (isLiveAdmin() ? [] : demoVolunteersFallback)
  const activeDrivers = drivers.length > 0 ? drivers : (isLiveAdmin() ? [] : demoDriversFallback)
  const activeVehicles = vehicles.length > 0 ? vehicles : (isLiveAdmin() ? [] : demoVehiclesFallback)

  useEffect(() => {
    if (!isLiveAdmin()) return

    // Guard: pickup.id must be a real server UUID before hitting the API.
    // Demo fixture IDs (e.g. 'p1000000-...') start with non-hex chars and
    // will be rejected by the server uuidSchema with 'Pickup ID must be a UUID'.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(pickup.id)) {
      setCheckingVolunteerEligibility(false)
      setVolunteerEligibility(null)
      setVolunteerEligibilityError(
        'This pickup has a demo ID and is not saved in the database. ' +
        'Create the pickup via \"Schedule Pickup\" to enable live volunteer eligibility checks.'
      )
      return
    }

    let active = true
    setCheckingVolunteerEligibility(true)
    setVolunteerEligibility(null)
    setVolunteerEligibilityError(null)
    void fetchEligibleVolunteersForPickup(pickup.id)
      .then(result => {
        if (active) setVolunteerEligibility(result)
      })
      .catch((error: unknown) => {
        if (active) {
          setVolunteerEligibilityError(error instanceof Error
            ? error.message
            : 'Could not verify volunteer availability for this pickup window.')
        }
      })
      .finally(() => {
        if (active) setCheckingVolunteerEligibility(false)
      })
    return () => { active = false }
  }, [pickup.id])

  // Detect whether a volunteer is categorized as a driver (has driving skill or driver role)
  const isDriverVolunteer = (v: any) => {
    const skills: string[] = Array.isArray(v.skills) ? v.skills : []
    const hasDrivingSkill = skills.some(s => typeof s === 'string' && s.toLowerCase().includes('driv'))
    const role = String(v.role || '').toLowerCase()
    const hasDriverRole = role.includes('driv')
    return hasDrivingSkill || hasDriverRole
  }

  // Step 0: Crew Volunteers — show volunteers whose skills DO NOT include driving (e.g. packing, food handling, heavy lifting)
  const crewVolunteers = useMemo(() => {
    return activeVolunteers.filter((v: any) => !isDriverVolunteer(v))
  }, [activeVolunteers])

  const volunteersWithWindowEligibility = useMemo(() => crewVolunteers.map((volunteer: any) => {
    if (!isLiveAdmin()) return volunteer
    const id = String(volunteer.volunteerId || volunteer.id || '')
    const reservationConflict = volunteerEligibility?.reservationConflictVolunteerIds.includes(id) ?? false
    const windowAvailable = volunteerEligibility?.volunteerIds.includes(id) ?? false
    const pickupWindowBlocked = Boolean(volunteerEligibility?.blockingReason)
    const availabilityLabel = checkingVolunteerEligibility
      ? 'Checking'
      : volunteerEligibilityError
        ? 'Not checked'
        : pickupWindowBlocked
          ? 'Window blocked'
        : reservationConflict
          ? 'Reserved'
          : windowAvailable
            ? 'Schedule eligible'
            : 'Unavailable'
    const windowAvailabilityReason = checkingVolunteerEligibility
      ? 'Checking this volunteer’s schedule and reservation for the pickup window.'
      : volunteerEligibilityError
        ? `Pickup-window eligibility was not checked: ${volunteerEligibilityError}`
      : pickupWindowBlocked
        ? volunteerEligibility?.blockingReason || 'Pickup window is not assignable.'
      : reservationConflict
        ? 'An active assignment reservation overlaps this pickup window.'
        : 'No available volunteer schedule covers this pickup window.'
    return {
      ...volunteer,
      windowAvailable,
      windowAvailabilityReason,
      windowAvailabilityLabel: availabilityLabel,
    }
  }), [
    crewVolunteers,
    checkingVolunteerEligibility,
    volunteerEligibility,
    volunteerEligibilityError,
  ])

  // Step 1: All Drivers — show registered drivers and any volunteer who has the driving skill
  const evaluatedDrivers = useMemo(() => {
    const list: any[] = [...activeDrivers]
    const existingNamesOrIds = new Set(
      list.map((d: any) => (d.name || d.fullName || d.driverId || d.id || '').toLowerCase())
    )

    // Include volunteers with driving skill into drivers list
    const drivingVolunteers: any[] = activeVolunteers.filter((v: any) => isDriverVolunteer(v))
    for (const vol of drivingVolunteers) {
      const volName = String(vol.name || vol.fullName || '')
      const volId = String(vol.driverId || vol.id || vol.volunteerId || '')
      if (volName && !existingNamesOrIds.has(volName.toLowerCase()) && !existingNamesOrIds.has(volId.toLowerCase())) {
        list.push({
          driverId: volId,
          id: volId,
          name: `${volName} (Volunteer Driver)`,
          licenceNumber: vol.licenceNumber || 'Volunteer Driver on file',
          licenceStatus: 'VALID',
          status: vol.status || 'ACTIVE',
        })
        existingNamesOrIds.add(volName.toLowerCase())
        existingNamesOrIds.add(volId.toLowerCase())
      }
    }

    return list.map((drv: any) => {
      const id = String(drv.driverId || drv.id || '')
      const name = String(drv.name || drv.fullName || id)
      const licenceNumber = drv.licenceNumber || drv.licenseNumber || drv.dlNumber || ''
      const licenceStatus = String(drv.licenceStatus || drv.licenseStatus || 'VALID').toUpperCase()
      const status = String(drv.status || 'ACTIVE').toUpperCase()

      let isEligible = true
      let blockingReason = ''

      if (status !== 'ACTIVE') {
        isEligible = false
        blockingReason = 'Driver is currently inactive on roster.'
      } else if (licenceStatus === 'EXPIRED') {
        isEligible = false
        blockingReason = 'Driving licence has expired.'
      } else if (licenceStatus === 'SUSPENDED') {
        isEligible = false
        blockingReason = 'Driving licence is suspended.'
      }

      return {
        id,
        name,
        licenceNumber,
        licenceStatus,
        status,
        isEligible,
        blockingReason,
        availability: 'Available for pickup window',
      }
    })
  }, [activeDrivers, activeVolunteers])

  const volunteerRanking = useMemo(
    () =>
      rankVolunteersForPickup(volunteersWithWindowEligibility, {
        totalEstimatedWeightKg: Number(estimatedLoadKg),
        foods: pickup.foods,
      }),
    [volunteersWithWindowEligibility, estimatedLoadKg, pickup.foods]
  )

  useEffect(() => {
    if (!volunteerEligibility) return
    const eligibleIds = new Set(volunteerEligibility.volunteerIds)
    setSelectedVolunteerIds(current => current.filter(id => eligibleIds.has(id)))
  }, [volunteerEligibility])

  const vehicleRanking = useMemo(
    () =>
      rankVehiclesForPickup(activeVehicles, {
        totalEstimatedWeightKg: Number(estimatedLoadKg),
        totalVessels: Number(containerCount),
        pickupAddress: pickup.donorLocation || (pickup as any).pickupAddress || '',
        deliveryAddress: pickup.deliveryAddress || '',
      }),
    [
      activeVehicles,
      estimatedLoadKg,
      containerCount,
      pickup.donorLocation,
      (pickup as any).pickupAddress,
      pickup.deliveryAddress,
    ]
  )

  useEffect(() => {
    if (!selectedVehicleId && vehicleRanking.bestVehicle?.vehicleId) {
      setSelectedVehicleId(vehicleRanking.bestVehicle.vehicleId)
    }
  }, [selectedVehicleId, vehicleRanking.bestVehicle?.vehicleId])

  const canContinue = () => {
    if (step === 0) return selectedVolunteerIds.length > 0
    if (step === 1) {
      if (!selectedDriverId) return false
      const chosen = evaluatedDrivers.find(d => d.id === selectedDriverId)
      return chosen ? chosen.isEligible : true
    }
    if (step === 2) {
      if (!selectedVehicleId) return false
      const chosen = vehicleRanking.ranked.find(v => v.vehicleId === selectedVehicleId)
      return chosen ? chosen.isEligible : true
    }
    if (step === 3) return Number(containerCount) > 0
    return true
  }

  const canConfirmAssignment = !submitting
    && selectedVolunteerIds.length > 0
    && Boolean(selectedDriverId)
    && Boolean(selectedVehicleId)
    && (!isLiveAdmin() || (
      Boolean(volunteerEligibility)
      && !volunteerEligibilityError
      && selectedVolunteerIds.every(id => volunteerEligibility?.volunteerIds.includes(id))
    ))

  const handleNext = () => {
    if (!canContinue()) {
      notify('Complete required selection to proceed.', 'error')
      return
    }
    setStep(s => s + 1)
  }

  const handleSubmit = async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setErrorMessage(null)
    try {
      if (isLiveAdmin()) {
        // Sanitise numeric fields — NaN / 0 fail the server schema
        const safeCount = Math.max(1, Math.floor(Number(containerCount) || 1))
        const safeTotalKg = Math.max(0, Number(estimatedLoadKg) || 0)

        const containers = selectedVesselIds.length > 0
          ? selectedVesselIds.map(vid => {
              const v = vessels.find(x => x.id === vid)
              const perVesselKg = selectedVesselIds.length > 0
                ? safeTotalKg / selectedVesselIds.length
                : safeTotalKg
              return {
                containerType: v?.name || v?.vesselCode || 'Vessel',
                count: 1,
                estimatedLoadKg: Math.max(0, perVesselKg),
              }
            })
          : [
              {
                containerType: aiAssessment.vessels[0]?.containerType || 'insulated crate',
                count: safeCount,
                estimatedLoadKg: safeTotalKg,
              },
            ]

        if (!selectedDriverId) throw new Error('No driver selected.')
        if (!selectedVehicleId) throw new Error('No vehicle selected.')
        if (selectedVolunteerIds.length === 0) throw new Error('No volunteers selected.')

        // DEBUG: log exact body sent to server
        console.log('[AssignWizard] POST body:', JSON.stringify({
          teamId: null, volunteerIds: selectedVolunteerIds, vesselIds: selectedVesselIds,
          driverId: selectedDriverId, vehicleId: selectedVehicleId, role,
          windowStartsAt: pickup.windowStartsAt, windowEndsAt: pickup.windowEndsAt, containers,
        }, null, 2))

        const assignment = await createAssignment(
          pickup.id,
          {
            teamId: null,
            volunteerIds: selectedVolunteerIds,
            vesselIds: selectedVesselIds,
            driverId: selectedDriverId,
            vehicleId: selectedVehicleId,
            role,
            windowStartsAt: pickup.windowStartsAt,
            windowEndsAt: pickup.windowEndsAt,
            containers,
          },
          idempotencyKey
        )

        notify('Assignment created successfully.')

        onSuccess(assignment)
      } else {
        const demoAssignment: LiveAssignment = {
          id: 'a1000000-0000-4000-8000-' + String(Date.now()).slice(-12).padStart(12, '0'),
          pickupId: pickup.id,
          status: 'ACCEPTED',
          version: 1,
          volunteerIds: selectedVolunteerIds,
          teamId: null,
          driverId: selectedDriverId,
          vehicleId: selectedVehicleId,
        }
        saveDemoAssignment(demoAssignment)
        updateDemoPickupStatus(pickup.id, 'ASSIGNED')
        notify('Assignment created successfully.')
        onSuccess(demoAssignment)
      }
      onClose()
    } catch (err: unknown) {
      const friendly = map409ErrorMessage(err)
      setErrorMessage(friendly)
      notify(friendly, 'error')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Assign Crew & Vehicle"
      subtitle="Assign volunteers, driver, and vehicle for this pickup."
      onClose={onClose}
      wide
    >
      <div className="wizard">
        <div className="wizard-steps">
          {wizardSteps.map((label, idx) => (
            <div
              key={label}
              className={`wizard-step ${idx === step ? 'current' : ''} ${idx < step ? 'done' : ''}`}
            >
              <span>{idx < step ? <Check size={14} /> : idx + 1}</span>
              <small>{label}</small>
            </div>
          ))}
        </div>

        <div className="wizard-content">
          {errorMessage && (
            <div className="wizard-tip error-tip" style={{ color: '#dc2626', marginBottom: '1rem' }}>
              <ShieldAlert size={18} /> {errorMessage}
            </div>
          )}

          {step === 0 && (
            <>
              <div className="wizard-title">
                <h3>Select Volunteers</h3>
                <p>Choose packing and food rescue crew members for this pickup. (Drivers are selected in Step 2)</p>
              </div>
              {waitingTeam1 && volunteers.length === 0 ? (
                <div className="wizard-tip" style={{ marginBottom: '1rem' }}>
                  <strong>{waitingTeam1}</strong>
                </div>
              ) : null}
              {checkingVolunteerEligibility && (
                <div className="wizard-tip" style={{ marginBottom: '1rem' }}>
                  Checking volunteer schedules and active reservations for this pickup window…
                </div>
              )}
              {volunteerEligibilityError && (
                <div className="wizard-tip error-tip" style={{ color: '#b91c1c', marginBottom: '1rem' }}>
                  <ShieldAlert size={16} /> {`Pickup eligibility could not be verified: ${volunteerEligibilityError}`}
                </div>
              )}
              {volunteerEligibility?.blockingReason && (
                <div className="wizard-tip error-tip" style={{ color: '#b91c1c', marginBottom: '1rem' }}>
                  <ShieldAlert size={16} /> {volunteerEligibility.blockingReason}
                  {volunteerEligibility.requiresNewDonorRequest && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <p>
                        Food deadline: {new Date(volunteerEligibility.foodPickupDeadline).toLocaleString()}.
                        This request cannot be rescheduled or reused. A donor must submit a new request;
                        wait for its safety approval, then schedule that request.
                      </p>
                      <a
                        className="button button-primary"
                        href={`${import.meta.env.BASE_URL}donor/index.html`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open donor submission flow
                      </a>
                    </div>
                  )}
                </div>
              )}
              {!checkingVolunteerEligibility && !volunteerEligibilityError && volunteerEligibility?.volunteerIds.length === 0 && (
                !volunteerEligibility.blockingReason && (
                <div className="wizard-tip error-tip" style={{ color: '#b91c1c', marginBottom: '1rem' }}>
                  <ShieldAlert size={16} /> No active volunteer has a covering availability slot without a reservation conflict. Choose a different pickup window or have volunteers update their availability.
                </div>
                )
              )}
              {volunteerRanking.noCandidatesReason && !volunteerEligibility?.blockingReason && (
                <div className="wizard-tip error-tip" style={{ color: '#b91c1c', marginBottom: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem' }}>
                  <ShieldAlert size={16} /> {volunteerRanking.noCandidatesReason}
                </div>
              )}

              {/* Selection summary */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                <span>Showing packing & food handling crew (skills except driving)</span>
                <span style={{ fontWeight: 600, color: selectedVolunteerIds.length > 0 ? '#16a34a' : '#64748b' }}>
                  {`${selectedVolunteerIds.length} volunteer(s) selected`}
                </span>
              </div>

              {/* Table-like column header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', borderRadius: '6px 6px 0 0', border: '1px solid #e2e8f0', borderBottom: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '20px' }}>Select</span>
                  <span>Volunteer Name & Role</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                  <span>Window eligibility</span>
                  <span style={{ minWidth: '95px', textAlign: 'right' }}>Suitability</span>
                </div>
              </div>

              {/* Compact row list */}
              <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                {volunteerRanking.ranked.map((vol, index) => {
                  const id = vol.volunteerId
                  const name = vol.name
                  const isSelected = selectedVolunteerIds.includes(id)
                  const isRecommended = vol.isEligible && vol.rank <= 2
                  return (
                    <div
                      key={id}
                      role="button"
                      tabIndex={vol.isEligible ? 0 : -1}
                      onClick={() => {
                        if (!vol.isEligible) return
                        setSelectedVolunteerIds(prev =>
                          isSelected ? prev.filter(x => x !== id) : [...prev, id]
                        )
                      }}
                      onKeyDown={e => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          if (!vol.isEligible) return
                          setSelectedVolunteerIds(prev =>
                            isSelected ? prev.filter(x => x !== id) : [...prev, id]
                          )
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        padding: '10px 14px',
                        borderBottom: index < volunteerRanking.ranked.length - 1 ? '1px solid #e2e8f0' : 'none',
                        background: isSelected ? '#f0fdf4' : vol.isEligible ? '#ffffff' : '#f8fafc',
                        cursor: vol.isEligible ? 'pointer' : 'not-allowed',
                        opacity: vol.isEligible ? 1 : 0.65,
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Left: Checkbox + Name + Role/Skills */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!vol.isEligible}
                          onChange={() => {}}
                          style={{ width: '18px', height: '18px', accentColor: '#16a34a', cursor: vol.isEligible ? 'pointer' : 'not-allowed', flexShrink: 0 }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>{name}</strong>
                            {vol.role && (
                              <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: '4px' }}>
                                {vol.role}
                              </span>
                            )}
                          </div>
                          {vol.skills && vol.skills.length > 0 && (
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                              {`Skills: ${vol.skills.join(', ')}`}
                            </div>
                          )}
                          {vol.reasons.length > 0 && (
                            <div style={{ color: '#059669', fontSize: '0.73rem', marginTop: '2px' }}>
                              <span>✓ {vol.reasons[0]}</span>
                            </div>
                          )}
                          {vol.constraints.length > 0 && (
                            <div style={{ color: '#dc2626', fontSize: '0.73rem', marginTop: '2px' }}>
                              <span>✕ {vol.constraints[0]}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Availability & Suitability Score */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: vol.isEligible ? '#166534' : vol.availabilityLabel === 'Not checked' ? '#92400e' : '#991b1b', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: vol.isEligible ? '#22c55e' : vol.availabilityLabel === 'Not checked' ? '#f59e0b' : '#ef4444' }} />
                            {vol.availabilityLabel}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>Server-side pickup-window check</span>
                        </div>
                        <div style={{ minWidth: '95px', textAlign: 'right' }}>
                          {isRecommended && (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: '#ecfdf5',
                                color: '#065f46',
                                border: '1px solid #a7f3d0',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                display: 'inline-block',
                              }}
                            >
                              {`⭐ Match ${vol.suitabilityScore}%`}
                            </span>
                          )}
                          {!vol.isEligible && (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: vol.availabilityLabel === 'Not checked' ? '#fef3c7' : '#fee2e2',
                                color: vol.availabilityLabel === 'Not checked' ? '#92400e' : '#991b1b',
                                border: `1px solid ${vol.availabilityLabel === 'Not checked' ? '#fde68a' : '#fecaca'}`,
                                padding: '2px 8px',
                                borderRadius: '999px',
                                display: 'inline-block',
                              }}
                            >
                              {vol.availabilityLabel}
                            </span>
                          )}
                          {vol.isEligible && !isRecommended && (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                background: '#f1f5f9',
                                color: '#475569',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                display: 'inline-block',
                              }}
                            >
                              {`${vol.suitabilityScore}%`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {volunteerRanking.ranked.length === 0 && (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
                    No candidate volunteers found.
                  </div>
                )}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="wizard-title">
                <h3>Select Driver</h3>
                <p>Choose an authorized driver or volunteer driver with a valid licence for this pickup.</p>
              </div>
              {waitingTeam5Drivers && drivers.length === 0 && evaluatedDrivers.length === 0 ? (
                <div className="wizard-tip" style={{ marginBottom: '1rem' }}>
                  <strong>{waitingTeam5Drivers}</strong>
                </div>
              ) : null}

              {/* Table-like column header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', borderRadius: '6px 6px 0 0', border: '1px solid #e2e8f0', borderBottom: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '20px' }}>Select</span>
                  <span>Driver Name & Licence</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                  <span>Availability</span>
                  <span style={{ minWidth: '95px', textAlign: 'right' }}>Licence Status</span>
                </div>
              </div>

              {/* Compact list */}
              <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                {evaluatedDrivers.map((drv, index) => {
                  const id = drv.id
                  const isSelected = selectedDriverId === id
                  return (
                    <div
                      key={id}
                      role="button"
                      tabIndex={drv.isEligible ? 0 : -1}
                      onClick={() => {
                        if (!drv.isEligible) return
                        setSelectedDriverId(id)
                      }}
                      onKeyDown={e => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          if (!drv.isEligible) return
                          setSelectedDriverId(id)
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        padding: '10px 14px',
                        borderBottom: index < evaluatedDrivers.length - 1 ? '1px solid #e2e8f0' : 'none',
                        background: isSelected ? '#f0fdf4' : drv.isEligible ? '#ffffff' : '#f8fafc',
                        cursor: drv.isEligible ? 'pointer' : 'not-allowed',
                        opacity: drv.isEligible ? 1 : 0.65,
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Left: Radio + Name + Licence No */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                        <input
                          type="radio"
                          name="selectedDriver"
                          checked={isSelected}
                          disabled={!drv.isEligible}
                          onChange={() => {}}
                          style={{ width: '18px', height: '18px', accentColor: '#16a34a', cursor: drv.isEligible ? 'pointer' : 'not-allowed', flexShrink: 0 }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>{drv.name}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                            {drv.licenceNumber ? `Licence No: ${drv.licenceNumber}` : 'Driving Licence on file'}
                          </div>
                          {!drv.isEligible && (
                            <div style={{ color: '#dc2626', fontSize: '0.73rem', marginTop: '2px' }}>
                              <span>✕ {drv.blockingReason}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Availability & Status Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: drv.isEligible ? '#166534' : '#991b1b', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: drv.isEligible ? '#22c55e' : '#ef4444' }} />
                            {drv.isEligible ? 'Available' : 'Unavailable'}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>Window active</span>
                        </div>
                        <div style={{ minWidth: '95px', textAlign: 'right' }}>
                          {drv.isEligible ? (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: '#ecfdf5',
                                color: '#065f46',
                                border: '1px solid #a7f3d0',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                display: 'inline-block',
                              }}
                            >
                              ✓ {drv.licenceStatus}
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: '#fee2e2',
                                color: '#991b1b',
                                border: '1px solid #fecaca',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                display: 'inline-block',
                              }}
                            >
                              Ineligible
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {evaluatedDrivers.length === 0 && (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
                    No drivers available.
                  </div>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="wizard-title">
                <h3>Select Vehicle</h3>
                <p>Choose a vehicle with sufficient capacity and fleet readiness. Assignment-window reservations are rechecked on confirmation.</p>
              </div>

              {/* Vehicle Logistics & Nearest Route Recommendation Banner */}
              {vehicleRanking.bestVehicle ? (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
                    border: '1px solid #a7f3d0',
                    borderRadius: '8px',
                    padding: '0.85rem',
                    marginBottom: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                    <Sparkles size={18} style={{ color: '#059669', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '0.85rem', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ fontWeight: 700, color: '#065f46' }}>
                          {'Nearest Vehicle & Route Recommendation'}
                        </div>
                        {vehicleRanking.bestVehicle.route && (
                          <a
                            href={vehicleRanking.bestVehicle.route.navigationUrl}
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
                            <Navigation size={12} /> {'Live Google Maps Route'} <ExternalLink size={12} />
                          </a>
                        )}
                      </div>

                      <div style={{ fontWeight: 600, color: '#0f172a', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <Truck size={15} style={{ color: '#059669' }} />
                        <span>{`${vehicleRanking.bestVehicle.kind} (${vehicleRanking.bestVehicle.registrationNumber}) · ${vehicleRanking.bestVehicle.suitabilityScore}% match`}</span>
                        {vehicleRanking.bestVehicle.distanceToDonorKm != null && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: '4px' }}>
                            {`📍 ${vehicleRanking.bestVehicle.distanceToDonorKm} km to donor (~${vehicleRanking.bestVehicle.durationToDonorMins} mins)`}
                          </span>
                        )}
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {vehicleRanking.bestVehicle.isLiveLocation ? '🟢 Live GPS: ' : '🏢 Depot: '}{vehicleRanking.bestVehicle.locationLabel}
                        </span>
                      </div>

                      <p style={{ margin: '4px 0 0', color: '#334155', fontSize: '0.8rem' }}>
                        {vehicleRanking.bestVehicle.reasons[0] || aiAssessment.vehicle.reason}
                      </p>

                      {/* Specified Route summary & Turn-by-Turn Waypoints */}
                      {vehicleRanking.bestVehicle.route && (
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #d1fae5' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                            <span style={{ fontSize: '0.78rem', color: '#065f46', fontWeight: 600 }}>
                              {`🗺️ Trip Corridor: ${vehicleRanking.bestVehicle.route.routeSummary}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => setExpandedRouteVehicleId(prev => prev === vehicleRanking.bestVehicle?.vehicleId ? null : vehicleRanking.bestVehicle?.vehicleId || null)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#047857',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: 0,
                              }}
                            >
                              {expandedRouteVehicleId === vehicleRanking.bestVehicle.vehicleId ? (
                                <>{'Hide Turn-by-Turn Waypoints'} <ChevronUp size={13} /></>
                              ) : (
                                <>{'View Turn-by-Turn Waypoints'} <ChevronDown size={13} /></>
                              )}
                            </button>
                          </div>

                          {expandedRouteVehicleId === vehicleRanking.bestVehicle.vehicleId && (
                            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {vehicleRanking.bestVehicle.route.legs.map((leg, lIdx) => (
                                <div
                                  key={lIdx}
                                  style={{
                                    background: '#ffffff',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    padding: '8px 10px',
                                    fontSize: '0.78rem',
                                  }}
                                >
                                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>
                                      {lIdx === 0 ? '🚀 Leg 1: Vehicle Hub ➔ Donor Venue' : '🥘 Leg 2: Donor Venue ➔ NGO Distribution Center'}
                                    </span>
                                    <span style={{ color: '#059669', fontWeight: 600 }}>
                                      {`${leg.distanceKm} km · ~${leg.durationMins} mins`}
                                    </span>
                                  </div>
                                  <div style={{ color: '#475569', fontSize: '0.74rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {leg.instructions.map((inst, iIdx) => (
                                      <div key={iIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                                        <span style={{ color: '#16a34a', fontWeight: 700 }}>•</span>
                                        <span>{inst}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
                    border: '1px solid #a7f3d0',
                    borderRadius: '8px',
                    padding: '0.85rem',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.6rem',
                  }}
                >
                  <Sparkles size={18} style={{ color: '#059669', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.85rem' }}>
                    <div style={{ fontWeight: 700, color: '#065f46' }}>
                      {'Vehicle Logistics Profile'}
                    </div>
                    <div style={{ fontWeight: 600, color: '#0f172a', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Truck size={15} style={{ color: '#059669' }} />
                      <span>{aiAssessment.vehicle.vehicleType}</span>
                    </div>
                    <p style={{ margin: '3px 0 0', color: '#475569', fontSize: '0.8rem' }}>
                      {aiAssessment.vehicle.reason}
                    </p>
                  </div>
                </div>
              )}

              {waitingTeam5Vehicles && vehicles.length === 0 ? (
                <div className="wizard-tip" style={{ marginBottom: '1rem' }}>
                  <strong>{waitingTeam5Vehicles}</strong>
                </div>
              ) : null}

              {vehicleRanking.noCandidatesReason && (
                <div className="wizard-tip error-tip" style={{ color: '#b91c1c', marginBottom: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem' }}>
                  <ShieldAlert size={16} /> {vehicleRanking.noCandidatesReason}
                </div>
              )}

              {/* Table-like column header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', borderRadius: '6px 6px 0 0', border: '1px solid #e2e8f0', borderBottom: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '20px' }}>Select</span>
                  <span>Vehicle Plate & Type</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                  <span>Payload & Margin</span>
                  <span style={{ minWidth: '95px', textAlign: 'right' }}>Suitability</span>
                </div>
              </div>

              {/* Compact list */}
              <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                {vehicleRanking.ranked.map((veh, index) => {
                  const id = veh.vehicleId
                  const reg = veh.registrationNumber
                  const isSelected = selectedVehicleId === id
                  const isTopPick = veh.isEligible && veh.rank === 1
                  return (
                    <div
                      key={id}
                      role="button"
                      tabIndex={veh.isEligible ? 0 : -1}
                      onClick={() => {
                        if (!veh.isEligible) return
                        setSelectedVehicleId(id)
                      }}
                      onKeyDown={e => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          if (!veh.isEligible) return
                          setSelectedVehicleId(id)
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        padding: '10px 14px',
                        borderBottom: index < vehicleRanking.ranked.length - 1 ? '1px solid #e2e8f0' : 'none',
                        background: isSelected ? '#f0fdf4' : veh.isEligible ? '#ffffff' : '#f8fafc',
                        cursor: veh.isEligible ? 'pointer' : 'not-allowed',
                        opacity: veh.isEligible ? 1 : 0.65,
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Left: Radio + Plate + Type + Reasons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                        <input
                          type="radio"
                          name="selectedVehicle"
                          checked={isSelected}
                          disabled={!veh.isEligible}
                          onChange={() => {}}
                          style={{ width: '18px', height: '18px', accentColor: '#16a34a', cursor: veh.isEligible ? 'pointer' : 'not-allowed', flexShrink: 0 }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.86rem', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '1px 6px', borderRadius: '4px', color: '#1e293b' }}>
                              {reg}
                            </span>
                            <span style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 500 }}>{veh.kind}</span>
                            {veh.distanceToDonorKm != null && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 600, background: '#ecfdf5', color: '#065f46', border: '1px solid #bbf7d0', padding: '1px 6px', borderRadius: '4px' }}>
                                {`📍 ${veh.distanceToDonorKm} km to donor (~${veh.durationToDonorMins} min)`}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '2px' }}>
                            <span>{veh.isLiveLocation ? '🟢 Live GPS: ' : '🏢 Base Depot: '}{veh.locationLabel}</span>
                          </div>
                          {veh.reasons.length > 0 && (
                            <div style={{ color: '#059669', fontSize: '0.73rem', marginTop: '2px' }}>
                              <span>✓ {veh.reasons[0]}</span>
                            </div>
                          )}
                          {veh.constraints.length > 0 && (
                            <div style={{ color: '#dc2626', fontSize: '0.73rem', marginTop: '2px' }}>
                              <span>✕ {veh.constraints[0]}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Capacity vs Load & Status Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
                            {`${veh.capacityKg} kg`}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: veh.isOverCapacity ? '#dc2626' : '#16a34a', display: 'block' }}>
                            {veh.isOverCapacity ? `Deficit: ${Number(estimatedLoadKg) - veh.capacityKg} kg` : `Margin: +${veh.capacityKg - Number(estimatedLoadKg)} kg`}
                          </span>
                        </div>
                        <div style={{ minWidth: '95px', textAlign: 'right' }}>
                          {isTopPick && (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: '#ecfdf5',
                                color: '#065f46',
                                border: '1px solid #a7f3d0',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                display: 'inline-block',
                              }}
                            >
                              {`⭐ Top Pick · ${veh.suitabilityScore}%`}
                            </span>
                          )}
                          {veh.isOverCapacity && (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: '#fee2e2',
                                color: '#991b1b',
                                border: '1px solid #fecaca',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                display: 'inline-block',
                              }}
                            >
                              Over Capacity
                            </span>
                          )}
                          {!veh.isEligible && !veh.isOverCapacity && (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: '#fee2e2',
                                color: '#991b1b',
                                border: '1px solid #fecaca',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                display: 'inline-block',
                              }}
                            >
                              {veh.status}
                            </span>
                          )}
                          {veh.isEligible && !isTopPick && (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                background: '#f1f5f9',
                                color: '#475569',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                display: 'inline-block',
                              }}
                            >
                              {`${veh.suitabilityScore}%`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {vehicleRanking.ranked.length === 0 && (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
                    No vehicles available.
                  </div>
                )}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="wizard-title">
                <h3>Containers & Load</h3>
                <p>Specify the containers required for food rescue.</p>
              </div>

              {/* AI Vessels Breakdown */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '0.85rem',
                  marginBottom: '1rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                  }}
                >
                  <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>AI Recommended Food-Safe Vessels</strong>
                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                    onClick={() => {
                      setContainerCount(aiAssessment.vessels.reduce((acc, v) => acc + v.count, 0) || 2)
                      setEstimatedLoadKg(aiAssessment.totalEstimatedWeightKg || 30)
                      notify('AI recommended vessels applied.')
                    }}
                  >
                    Apply AI Vessels
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem' }}>
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

              {/* Input controls in compact card */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1rem',
                }}
              >
                <label className="field" style={{ margin: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#334155' }}>Container Count</span>
                  <input
                    type="number"
                    min="1"
                    value={containerCount}
                    onChange={e => setContainerCount(Number(e.target.value))}
                    style={{ marginTop: '4px' }}
                  />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#334155' }}>Estimated Load (kg)</span>
                  <input
                    type="number"
                    min="1"
                    value={estimatedLoadKg}
                    onChange={e => setEstimatedLoadKg(Number(e.target.value))}
                    style={{ marginTop: '4px' }}
                  />
                </label>
              </div>

              {/* Clean Vessel Inventory Table */}
              {waitingVessels && vessels.length === 0 ? (
                <div className="wizard-tip" style={{ marginTop: '1rem' }}>
                  <strong>{waitingVessels}</strong>
                </div>
              ) : null}

              {vessels.length > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                      {`Available Clean Vessel Inventory (${vessels.length} eligible)`}
                    </strong>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      {selectedVesselIds.length > 0 ? `${selectedVesselIds.length} vessels selected` : 'Select specific vessels (optional)'}
                    </span>
                  </div>

                  {/* Table-like column header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', borderRadius: '6px 6px 0 0', border: '1px solid #e2e8f0', borderBottom: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ width: '20px' }}>Select</span>
                      <span>Vessel Code & Name</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                      <span>Type & Capacity</span>
                      <span style={{ minWidth: '95px', textAlign: 'right' }}>Hygiene Status</span>
                    </div>
                  </div>

                  {/* Compact list */}
                  <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                    {vessels.map((vsl, index) => {
                      const isVslSelected = selectedVesselIds.includes(vsl.id)
                      return (
                        <div
                          key={vsl.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSelectedVesselIds(prev => {
                              const next = isVslSelected ? prev.filter(x => x !== vsl.id) : [...prev, vsl.id]
                              if (next.length > 0) setContainerCount(next.length)
                              return next
                            })
                          }}
                          onKeyDown={e => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              setSelectedVesselIds(prev => {
                                const next = isVslSelected ? prev.filter(x => x !== vsl.id) : [...prev, vsl.id]
                                if (next.length > 0) setContainerCount(next.length)
                                return next
                              })
                            }
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            padding: '10px 14px',
                            borderBottom: index < vessels.length - 1 ? '1px solid #e2e8f0' : 'none',
                            background: isVslSelected ? '#f0fdf4' : '#ffffff',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease',
                          }}
                        >
                          {/* Left: Checkbox + Code + Name */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                            <input
                              type="checkbox"
                              checked={isVslSelected}
                              onChange={() => {}}
                              style={{ width: '18px', height: '18px', accentColor: '#16a34a', cursor: 'pointer', flexShrink: 0 }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <strong style={{ fontFamily: 'monospace', fontSize: '0.86rem', color: '#0f172a' }}>{vsl.vesselCode}</strong>
                                <span style={{ fontSize: '0.8rem', color: '#475569' }}>{vsl.name}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                                {vsl.foodGradeCertified ? (
                                  <span style={{ fontSize: '0.7rem', fontWeight: 600, background: '#ecfdf5', color: '#065f46', padding: '1px 6px', borderRadius: '4px' }}>
                                    ✓ Food-Grade Certified
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.7rem', fontWeight: 500, background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: '4px' }}>
                                    Standard
                                  </span>
                                )}
                                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  {`Condition: ${(vsl as any).condition || 'Good'}`}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Right: Type & Hygiene Status */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>
                                {`${vsl.capacityValue} ${vsl.capacityUnit}`}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>
                                {vsl.vesselType}
                              </span>
                            </div>
                            <div style={{ minWidth: '95px', textAlign: 'right' }}>
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  background: '#ecfdf5',
                                  color: '#065f46',
                                  border: '1px solid #a7f3d0',
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  display: 'inline-block',
                                }}
                              >
                                ● {vsl.cleaningStatus}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <div className="wizard-title">
                <h3>Review Assignment</h3>
                <p>Confirm the crew, vehicle, and vessel allocations before dispatching.</p>
              </div>

              {/* Verification banner */}
              {selectedVolunteerIds.length === 0 || !selectedDriverId || !selectedVehicleId
                || (isLiveAdmin() && (!volunteerEligibility || !!volunteerEligibilityError
                  || !selectedVolunteerIds.every(id => volunteerEligibility.volunteerIds.includes(id)))) ? (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#991b1b', fontSize: '0.85rem' }}>
                  <AlertCircle size={18} />
                  <strong>{volunteerEligibilityError
                    ? 'Pickup eligibility could not be verified. Return to Step 1 and review the reason.'
                    : selectedVolunteerIds.length > 0 && volunteerEligibility
                      ? 'A selected volunteer is unavailable for this pickup window. Return to Step 1 and choose an eligible alternative.'
                      : 'Incomplete assignment: Please ensure volunteers, driver, and vehicle are selected.'}</strong>
                </div>
              ) : (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontSize: '0.85rem' }}>
                  <CheckCircle2 size={18} />
                  <strong>{isLiveAdmin()
                    ? 'Volunteer schedules and reservations pass the current check. All resources are revalidated when you confirm.'
                    : 'Demo selections are complete. Live availability and reservation checks require the backend.'}</strong>
                </div>
              )}

              {/* Grouped compact cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* 1. Volunteers */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                      <Users size={16} style={{ color: '#16a34a' }} />
                      <span>Assigned Volunteers</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: selectedVolunteerIds.length > 0 ? '#16a34a' : '#dc2626' }}>
                      {selectedVolunteerIds.length > 0 ? `${selectedVolunteerIds.length} volunteer(s)` : 'Missing selection'}
                    </span>
                  </div>
                  {selectedVolunteerIds.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {selectedVolunteerIds.map(vid => {
                        const v = volunteerRanking.ranked.find(x => x.volunteerId === vid)
                        return (
                          <div key={vid} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px 10px', borderRadius: '6px', fontSize: '0.82rem' }}>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{v?.name || vid}</span>
                            {v?.role && <span style={{ color: '#64748b', fontSize: '0.75rem' }}>({v.role})</span>}
                            {v && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '1px 5px', borderRadius: '4px' }}>
                                {`${v.suitabilityScore}%`}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#dc2626' }}>No volunteers selected. Please return to Step 1.</p>
                  )}
                </div>

                {/* 2. Driver & Vehicle */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                  {/* Driver Card */}
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                        <User size={16} style={{ color: '#16a34a' }} />
                        <span>Assigned Driver</span>
                      </div>
                      {selectedDriverId ? (
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#065f46', background: '#ecfdf5', padding: '1px 6px', borderRadius: '999px' }}>
                          Confirmed
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#991b1b', background: '#fee2e2', padding: '1px 6px', borderRadius: '999px' }}>
                          Required
                        </span>
                      )}
                    </div>
                    {(() => {
                      const drv = evaluatedDrivers.find(d => d.id === selectedDriverId)
                      if (!drv) return <p style={{ margin: 0, fontSize: '0.8rem', color: '#dc2626' }}>No driver selected.</p>
                      return (
                        <div style={{ fontSize: '0.82rem' }}>
                          <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>{drv.name}</strong>
                          <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '2px' }}>
                            {drv.licenceNumber ? `Licence: ${drv.licenceNumber} (${drv.licenceStatus})` : `Licence status: ${drv.licenceStatus}`}
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Vehicle Card */}
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                        <Truck size={16} style={{ color: '#16a34a' }} />
                        <span>Assigned Vehicle</span>
                      </div>
                      {selectedVehicleId ? (
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#065f46', background: '#ecfdf5', padding: '1px 6px', borderRadius: '999px' }}>
                          Confirmed
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#991b1b', background: '#fee2e2', padding: '1px 6px', borderRadius: '999px' }}>
                          Required
                        </span>
                      )}
                    </div>
                    {(() => {
                      const veh = vehicleRanking.ranked.find(v => v.vehicleId === selectedVehicleId)
                      if (!veh) return <p style={{ margin: 0, fontSize: '0.8rem', color: '#dc2626' }}>No vehicle selected.</p>
                      return (
                        <div style={{ fontSize: '0.82rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '1px 6px', borderRadius: '4px' }}>
                              {veh.registrationNumber}
                            </span>
                            <span style={{ color: '#334155' }}>{veh.kind}</span>
                            {veh.distanceToDonorKm != null && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#047857' }}>
                                {`· 📍 ${veh.distanceToDonorKm} km away (~${veh.durationToDonorMins} mins)`}
                              </span>
                            )}
                          </div>
                          <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '3px' }}>
                            {`Capacity: ${veh.capacityKg} kg · Load: ${estimatedLoadKg} kg · Location: ${veh.locationLabel}`}
                          </div>
                          {veh.route && (
                            <div style={{ marginTop: '4px', fontSize: '0.74rem', color: '#047857', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Navigation size={12} />
                              <span>{veh.route.routeSummary}</span>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* 3. Containers & Vessels */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                      <Box size={16} style={{ color: '#16a34a' }} />
                      <span>Allocated Vessels & Containers</span>
                    </div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>
                      {`${containerCount} container(s) · ${estimatedLoadKg} kg load`}
                    </span>
                  </div>
                  {selectedVesselIds.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {selectedVesselIds.map(vid => {
                        const v = vessels.find(x => x.id === vid)
                        return (
                          <div key={vid} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '3px 8px', borderRadius: '4px', fontSize: '0.78rem' }}>
                            <strong style={{ fontFamily: 'monospace', color: '#0f172a' }}>{v?.vesselCode || vid}</strong>
                            <span style={{ color: '#475569' }}>{v?.name || 'Vessel'}</span>
                            {v?.capacityValue && <span style={{ color: '#059669', fontSize: '0.72rem' }}>({v.capacityValue} {v.capacityUnit})</span>}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                      {`Standard food containers allocated (${containerCount} units, ${estimatedLoadKg} kg).`}
                    </p>
                  )}
                </div>

                {/* 4. Pickup Logistics Details */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', marginBottom: '8px' }}>
                    Pickup & Route Information
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', fontSize: '0.8rem' }}>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Pickup ID</span>
                      <strong style={{ fontFamily: 'monospace', color: '#0f172a' }}>{pickup.id.slice(0, 16)}…</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Donor / Source</span>
                      <strong style={{ color: '#0f172a' }}>{pickup.donorName || 'Food Donor'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Pickup Address</span>
                      <span style={{ color: '#334155' }}>{pickup.donorLocation || 'Pickup location on record'}</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Delivery Address</span>
                      <span style={{ color: '#334155' }}>{pickup.deliveryAddress}</span>
                    </div>
                    {(() => {
                      const veh = vehicleRanking.ranked.find(v => v.vehicleId === selectedVehicleId)
                      if (veh?.route) {
                        return (
                          <div style={{ gridColumn: '1 / -1', marginTop: '6px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                              <span style={{ fontSize: '0.78rem', color: '#065f46', fontWeight: 600 }}>
                                {`📍 Dispatch Route: ${veh.distanceToDonorKm} km to donor, ${veh.route.totalDistanceKm} km total trip (~${veh.route.totalDurationMins} mins)`}
                              </span>
                              <a
                                href={veh.route.navigationUrl}
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
                                {'View Live Route on Google Maps'} <ExternalLink size={12} />
                              </a>
                            </div>
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="wizard-footer">
          <button
            type="button"
            className="button button-secondary"
            onClick={step === 0 ? onClose : () => setStep(s => s - 1)}
          >
            {step === 0 ? 'Cancel' : <><ArrowLeft size={17} /> Back</>}
          </button>
          <div className="step-counter">
            Step {step + 1} of 5
          </div>
          {step === 4 ? (
            <button
              type="button"
              className="button button-primary"
              onClick={handleSubmit}
              disabled={!canConfirmAssignment}
            >
              {submitting ? 'Creating…' : 'Confirm Assignment'}
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary"
              onClick={handleNext}
              disabled={!canContinue()}
            >
              Continue <ArrowRight size={17} />
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
