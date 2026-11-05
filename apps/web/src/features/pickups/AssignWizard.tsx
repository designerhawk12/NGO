import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  ShieldAlert,
  Truck,
  User,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ContainerAssignmentOptions,
  ContainerOption,
  DriverAssignmentOption,
  DriverAssignmentOptions,
  PickupLoadSummary,
} from '@aaharaconnect/shared'
import { Modal } from '../../components/common/UI'
import { isLiveAdmin, map409ErrorMessage } from './adapters'
import { calculateAiLogistics, rankVolunteersForPickup } from './aiLogistics'
import { createAssignment, fetchContainerOptions, fetchDriverOptions, fetchEligibleVolunteersForPickup } from './api'
import { saveDemoAssignment, updateDemoPickupStatus, useAssignWizardResources } from './hooks'
import type { LiveAssignment, Pickup } from './types'

interface Props {
  pickup: Pickup
  onClose: () => void
  onSuccess: (assignment: LiveAssignment) => void
  notify: (message: string, kind?: 'success' | 'error') => void
}

// Volunteers are crew; the NGO employee driver brings their one fixed vehicle.
const wizardSteps = [
  'Select Volunteers',
  'Select Driver & Vehicle',
  'Select Containers',
  'Review Assignment',
]

const demoVolunteersFallback = [
  { volunteerId: 'vol-1', name: 'Kavya Iyer', role: 'Packing Volunteer', skills: ['Packing', 'Food Safety'] },
  { volunteerId: 'vol-2', name: 'Amit Patel', role: 'Loading Crew', skills: ['Packing', 'Heavy Lifting'] },
  { volunteerId: 'vol-3', name: 'Neha Rao', role: 'Food Inspector', skills: ['Food Safety', 'Packing'] },
  { volunteerId: 'vol-4', name: 'Rohan Verma', role: 'Distribution Volunteer', skills: ['Distribution', 'Packaging'] },
]

const unitLabel = (unit: string) => (unit === 'LITRES' ? 'L' : 'kg')
const isSealed = (container: ContainerOption) => container.hasTightLid || container.vesselType === 'MILK_CAN'

/** Mirrors the server's container checks so the Admin sees problems before confirming. */
function containerProblems(load: PickupLoadSummary, chosen: ContainerOption[], maxVessels: number | null): string[] {
  const problems: string[] = []
  if (chosen.length === 0) return ['Select at least one clean, food-grade container for this pickup.']
  for (const container of chosen) if (!container.available) problems.push(`${container.vesselCode}: ${container.reason ?? 'not available'}`)
  if (maxVessels != null && chosen.length > maxVessels) problems.push(`The selected vehicle carries at most ${maxVessels} container(s).`)
  const total = chosen.reduce((sum, container) => sum + Number(container.capacityValue), 0)
  const required = load.weightKg ?? load.knownWeightKg
  if (required > 0 && total + 0.0001 < required) problems.push(`Selected containers hold about ${Math.round(total * 100) / 100} kg, but about ${required} kg of food is expected.`)
  if (load.liquidLitres > 0) {
    const sealed = chosen.filter(isSealed).reduce((sum, container) => sum + Number(container.capacityValue), 0)
    if (sealed + 0.0001 < load.liquidLitres) problems.push(`Liquid food (${load.liquidLitres} L) needs sealed containers with at least that capacity.`)
  }
  return problems
}

function describeLoad(load: PickupLoadSummary): string {
  if (load.weightKg == null) return `Capacity verification required · recorded items weigh ${load.knownWeightKg} kg`
  return `${load.weightKg} kg${load.basis === 'MEASURED' ? '' : ' (estimate)'}${load.liquidLitres ? ` · includes ${load.liquidLitres} L of liquids` : ''}`
}

export function AssignWizard({ pickup, onClose, onSuccess, notify }: Props) {
  const live = isLiveAdmin()
  const [step, setStep] = useState(0)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [selectedVolunteerIds, setSelectedVolunteerIds] = useState<string[]>([])
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [selectedVesselIds, setSelectedVesselIds] = useState<string[]>([])
  const [role] = useState('Pickup Volunteer')

  const aiAssessment = useMemo(
    () => pickup.aiAssessment || calculateAiLogistics(pickup.foods || [], pickup.donorName, pickup.donorLocation),
    [pickup]
  )
  const estimatedLoadKg = aiAssessment.totalEstimatedWeightKg || 30
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
  const [checkingVolunteerEligibility, setCheckingVolunteerEligibility] = useState(live)

  const [driverOptions, setDriverOptions] = useState<DriverAssignmentOptions | null>(null)
  const [driverOptionsError, setDriverOptionsError] = useState<string | null>(null)
  const [loadingDrivers, setLoadingDrivers] = useState(false)
  const [containerOptions, setContainerOptions] = useState<ContainerAssignmentOptions | null>(null)
  const [containerOptionsError, setContainerOptionsError] = useState<string | null>(null)
  const [loadingContainers, setLoadingContainers] = useState(false)

  const { volunteers, waitingTeam1 } = useAssignWizardResources()
  const activeVolunteers = volunteers.length > 0 ? volunteers : (live ? [] : demoVolunteersFallback)

  useEffect(() => {
    if (!live) return
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(pickup.id)) {
      setCheckingVolunteerEligibility(false)
      setVolunteerEligibility(null)
      setVolunteerEligibilityError(
        'This pickup has a demo ID and is not saved in the database. ' +
        'Create the pickup via "Schedule Pickup" to enable live volunteer eligibility checks.'
      )
      return
    }
    let active = true
    setCheckingVolunteerEligibility(true)
    setVolunteerEligibility(null)
    setVolunteerEligibilityError(null)
    void fetchEligibleVolunteersForPickup(pickup.id)
      .then(result => { if (active) setVolunteerEligibility(result) })
      .catch((error: unknown) => {
        if (active) setVolunteerEligibilityError(error instanceof Error ? error.message : 'Could not verify volunteer availability for this pickup window.')
      })
      .finally(() => { if (active) setCheckingVolunteerEligibility(false) })
    return () => { active = false }
  }, [pickup.id, live])

  // Every approved volunteer is crew; drivers are separate NGO employees chosen in step 2.
  const volunteersWithWindowEligibility = useMemo(() => activeVolunteers.map((volunteer: any) => {
    if (!live) return volunteer
    const id = String(volunteer.volunteerId || volunteer.id || '')
    const reservationConflict = volunteerEligibility?.reservationConflictVolunteerIds.includes(id) ?? false
    const windowAvailable = volunteerEligibility?.volunteerIds.includes(id) ?? false
    const pickupWindowBlocked = Boolean(volunteerEligibility?.blockingReason)
    const availabilityLabel = checkingVolunteerEligibility ? 'Checking'
      : volunteerEligibilityError ? 'Not checked'
        : pickupWindowBlocked ? 'Window blocked'
          : reservationConflict ? 'Reserved'
            : windowAvailable ? 'Schedule eligible' : 'Unavailable'
    const windowAvailabilityReason = checkingVolunteerEligibility
      ? 'Checking this volunteer’s schedule and reservation for the pickup window.'
      : volunteerEligibilityError ? `Pickup-window eligibility was not checked: ${volunteerEligibilityError}`
        : pickupWindowBlocked ? volunteerEligibility?.blockingReason || 'Pickup window is not assignable.'
          : reservationConflict ? 'An active assignment reservation overlaps this pickup window.'
            : 'No available volunteer schedule covers this pickup window.'
    return { ...volunteer, windowAvailable, windowAvailabilityReason, windowAvailabilityLabel: availabilityLabel }
  }), [activeVolunteers, live, checkingVolunteerEligibility, volunteerEligibility, volunteerEligibilityError])

  const volunteerRanking = useMemo(
    () => rankVolunteersForPickup(volunteersWithWindowEligibility, { totalEstimatedWeightKg: Number(estimatedLoadKg), foods: pickup.foods }),
    [volunteersWithWindowEligibility, estimatedLoadKg, pickup.foods]
  )

  useEffect(() => {
    if (!volunteerEligibility) return
    const eligibleIds = new Set(volunteerEligibility.volunteerIds)
    setSelectedVolunteerIds(current => current.filter(id => eligibleIds.has(id)))
  }, [volunteerEligibility])

  const loadDriverOptions = async () => {
    setLoadingDrivers(true); setDriverOptionsError(null)
    try {
      if (!live) throw new Error('Sign in as an administrator in Settings to choose NGO drivers, vehicles and containers.')
      const options = await fetchDriverOptions(pickup.id)
      setDriverOptions(options)
      if (selectedDriverId && !options.options.some(option => option.driverId === selectedDriverId && option.eligible)) setSelectedDriverId('')
    } catch (error) {
      setDriverOptions(null)
      setDriverOptionsError(error instanceof Error ? error.message : 'Could not load drivers for this pickup.')
    } finally { setLoadingDrivers(false) }
  }

  const selectedDriver = driverOptions?.options.find(option => option.driverId === selectedDriverId) ?? null

  const loadContainerOptions = async (driver: DriverAssignmentOption) => {
    setLoadingContainers(true); setContainerOptionsError(null)
    try {
      if (!live) throw new Error('Sign in as an administrator in Settings to choose containers.')
      const options = await fetchContainerOptions(pickup.id, driver.driverId)
      setContainerOptions(options)
      setSelectedVesselIds(options.recommendation.vesselIds)
    } catch (error) {
      setContainerOptions(null)
      setContainerOptionsError(error instanceof Error ? error.message : 'Could not load containers for this pickup.')
    } finally { setLoadingContainers(false) }
  }

  useEffect(() => {
    if (step === 1 && !driverOptions && !loadingDrivers) void loadDriverOptions()
    if (step === 2 && selectedDriver && containerOptions?.driverId !== selectedDriver.driverId && !loadingContainers) void loadContainerOptions(selectedDriver)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const chosenContainers = (containerOptions?.containers ?? []).filter(container => selectedVesselIds.includes(container.id))
  const load = containerOptions?.load ?? driverOptions?.load ?? null
  const plannedProblems = containerOptions && load ? containerProblems(load, chosenContainers, containerOptions.maxVessels) : []

  const canContinue = () => {
    if (step === 0) return selectedVolunteerIds.length > 0
    if (step === 1) return Boolean(selectedDriver?.eligible)
    if (step === 2) return Boolean(containerOptions) && plannedProblems.length === 0
    return true
  }

  const canConfirmAssignment = !submitting
    && selectedVolunteerIds.length > 0
    && Boolean(selectedDriver?.eligible)
    && plannedProblems.length === 0
    && chosenContainers.length > 0
    && (!live || (
      Boolean(volunteerEligibility)
      && !volunteerEligibilityError
      && selectedVolunteerIds.every(id => volunteerEligibility?.volunteerIds.includes(id))
    ))

  const handleNext = () => {
    if (!canContinue()) { notify('Complete required selection to proceed.', 'error'); return }
    setStep(s => s + 1)
  }

  const handleSubmit = async () => {
    if (submittingRef.current || !selectedDriver) return
    submittingRef.current = true
    setSubmitting(true)
    setErrorMessage(null)
    try {
      const totalCapacity = chosenContainers.reduce((sum, container) => sum + Number(container.capacityValue), 0)
      const weight = load?.weightKg ?? null
      const containers = chosenContainers.map(container => ({
        containerType: `${container.name} (${container.vesselCode})`,
        count: 1,
        estimatedLoadKg: weight != null && totalCapacity > 0 ? Math.round(weight * Number(container.capacityValue) / totalCapacity * 100) / 100 : null,
      }))
      if (live) {
        const assignment = await createAssignment(
          pickup.id,
          {
            teamId: null,
            volunteerIds: selectedVolunteerIds,
            vesselIds: chosenContainers.map(container => container.id),
            driverId: selectedDriver.driverId,
            // The server derives this from the driver's fixed link and rejects any mismatch.
            vehicleId: selectedDriver.vehicle.id,
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
          driverId: selectedDriver.driverId,
          vehicleId: selectedDriver.vehicle.id,
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

  const selectedVolunteerNames = volunteerRanking.ranked
    .filter(volunteer => selectedVolunteerIds.includes(volunteer.volunteerId))
    .map(volunteer => volunteer.name)
  const warnings = [...(selectedDriver?.warnings ?? []), ...(containerOptions?.recommendation.reasons ?? []), ...(load?.notes ?? [])]

  return (
    <Modal
      title="Assign Crew & Vehicle"
      subtitle="Assign volunteers, an NGO driver with their vehicle, and containers for this pickup."
      onClose={onClose}
      wide
    >
      <div className="wizard">
        <div className="wizard-steps">
          {wizardSteps.map((label, idx) => (
            <div key={label} className={`wizard-step ${idx === step ? 'current' : ''} ${idx < step ? 'done' : ''}`}>
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
                <p>Choose approved volunteers for packing, loading and food handling. The NGO driver is chosen in Step 2.</p>
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
                <span>Showing approved volunteers only · NGO drivers are not listed here</span>
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
                <h3>Select Driver & Vehicle</h3>
                <p>Choose an NGO employee driver. Their permanently assigned vehicle is selected automatically.</p>
              </div>
              {loadingDrivers && <div className="wizard-tip">Checking drivers, vehicles, capacity and reservations for this pickup…</div>}
              {driverOptionsError && (
                <div className="wizard-tip error-tip" style={{ color: '#b91c1c' }}>
                  <ShieldAlert size={16} /> {driverOptionsError} <button type="button" className="text-link" onClick={() => void loadDriverOptions()}>Retry</button>
                </div>
              )}
              {driverOptions && (
                <>
                  <div className="wizard-tip" style={{ marginBottom: '0.75rem' }}>
                    <Box size={16} /> <strong>Food load:</strong> {describeLoad(driverOptions.load)}
                  </div>
                  {driverOptions.blockingReason && (
                    <div className="wizard-tip error-tip" style={{ color: '#b91c1c', marginBottom: '0.75rem' }}>
                      <ShieldAlert size={16} /> {driverOptions.blockingReason}
                    </div>
                  )}
                  <div className="driver-option-list" role="radiogroup" aria-label="NGO drivers">
                    {driverOptions.options.map(option => {
                      const selected = option.driverId === selectedDriverId
                      return (
                        <label key={option.driverId} className={`driver-option ${selected ? 'selected' : ''} ${option.eligible ? '' : 'disabled'}`}>
                          <input
                            type="radio"
                            name="driver"
                            checked={selected}
                            disabled={!option.eligible}
                            onChange={() => { setSelectedDriverId(option.driverId); setContainerOptions(null) }}
                          />
                          <div className="driver-option-body">
                            <div className="driver-option-row">
                              <span><User size={15} /> <strong>Driver:</strong> {option.name}</span>
                              <span className={`status-badge ${option.eligible ? 'status-available' : 'status-unavailable'}`}><span className="status-dot" />{option.eligible ? 'Available' : 'Unavailable'}</span>
                            </div>
                            <div className="driver-option-grid">
                              <span><Truck size={14} /> <strong>Assigned vehicle:</strong> {option.vehicle.registrationNumber}</span>
                              <span><strong>Vehicle type:</strong> {option.vehicle.kind}</span>
                              <span><strong>Vehicle capacity:</strong> {option.vehicle.capacityKg} kg{option.vehicle.indicativeMaxVessels ? ` · up to ${option.vehicle.indicativeMaxVessels} containers` : ''}</span>
                              <span><strong>Licence:</strong> {option.licenceNumber} · valid until {option.licenceExpiresOn}</span>
                            </div>
                            <p className={`driver-option-note ${option.capacity.status === 'FITS' ? 'ok' : option.capacity.status === 'VERIFY' ? 'warn' : 'bad'}`}>{option.capacity.message}</p>
                            {option.reasons.map(reason => <p key={reason} className="driver-option-note bad">✕ {reason}</p>)}
                            {option.eligible && option.warnings.filter(warning => warning !== option.capacity.message).map(warning => <p key={warning} className="driver-option-note warn"><AlertTriangle size={12} /> {warning}</p>)}
                          </div>
                        </label>
                      )
                    })}
                    {driverOptions.options.length === 0 && (
                      <div className="wizard-tip error-tip">No NGO employee drivers are registered. Add one from Assign Driver.</div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="wizard-title">
                <h3>Select Containers</h3>
                <p>Containers are suggested from registered, clean inventory to hold the food and fit the selected vehicle.</p>
              </div>
              {loadingContainers && <div className="wizard-tip">Checking container inventory for this load…</div>}
              {containerOptionsError && (
                <div className="wizard-tip error-tip" style={{ color: '#b91c1c' }}>
                  <ShieldAlert size={16} /> {containerOptionsError} {selectedDriver && <button type="button" className="text-link" onClick={() => void loadContainerOptions(selectedDriver)}>Retry</button>}
                </div>
              )}
              {containerOptions && (
                <>
                  <div className={`wizard-tip ${containerOptions.recommendation.sufficient ? '' : 'error-tip'}`} style={{ marginBottom: '0.75rem' }}>
                    {containerOptions.recommendation.sufficient ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
                    <div>
                      <strong>{containerOptions.recommendation.summary}</strong>
                      {containerOptions.recommendation.estimate && <small style={{ display: 'block' }}>Estimate · verify the fit at pickup.</small>}
                      {containerOptions.recommendation.reasons.map(reason => <small key={reason} style={{ display: 'block' }}>{reason}</small>)}
                    </div>
                    <button type="button" className="button button-secondary" style={{ marginLeft: 'auto' }} onClick={() => setSelectedVesselIds(containerOptions.recommendation.vesselIds)}>Use recommendation</button>
                  </div>
                  <p className="quiet-text" style={{ marginBottom: '0.5rem' }}>
                    Food load: {describeLoad(containerOptions.load)}{containerOptions.maxVessels ? ` · this vehicle carries up to ${containerOptions.maxVessels} containers` : ''}
                  </p>
                  <div className="container-option-list">
                    {containerOptions.containers.map(container => {
                      const checked = selectedVesselIds.includes(container.id)
                      return (
                        <label key={container.id} className={`container-option ${checked ? 'selected' : ''} ${container.available ? '' : 'disabled'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!container.available && !checked}
                            onChange={() => setSelectedVesselIds(current => checked ? current.filter(id => id !== container.id) : [...current, container.id])}
                          />
                          <span><strong>{container.name}</strong> · {container.vesselCode}</span>
                          <span>{container.capacityValue} {unitLabel(container.capacityUnit)} · {container.temperatureSuitability.toLowerCase()}{isSealed(container) ? ' · sealed' : ''}</span>
                          {!container.available && <small>{container.reason}</small>}
                        </label>
                      )
                    })}
                    {containerOptions.containers.length === 0 && <div className="wizard-tip error-tip">No containers are registered. Add containers in Vessels before assigning this pickup.</div>}
                  </div>
                  {plannedProblems.length > 0 && (
                    <div className="wizard-tip error-tip" style={{ color: '#b91c1c', marginTop: '0.75rem' }}>
                      <ShieldAlert size={16} />
                      <div>{plannedProblems.map(problem => <p key={problem} style={{ margin: 0 }}>{problem}</p>)}</div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="wizard-title">
                <h3>Review Assignment</h3>
                <p>Check every detail. The server re-checks availability, capacity and containers when you confirm.</p>
              </div>
              <div className="assign-review-grid">
                <section>
                  <h4>Pickup</h4>
                  <dl>
                    <dt>Donor</dt><dd>{pickup.donorName || 'Food donor'}</dd>
                    <dt>Pickup location</dt><dd>{pickup.donorLocation || '—'}</dd>
                    <dt>Pickup date & time</dt><dd>{new Date(pickup.windowStartsAt).toLocaleString('en-IN')} – {new Date(pickup.windowEndsAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</dd>
                    <dt>Delivery destination</dt><dd>{pickup.deliveryAddress}</dd>
                    <dt>Food items</dt><dd>{pickup.foods?.length ? pickup.foods.map(food => `${food.name} (${food.quantity} ${food.unit})`).join(', ') : 'See donor request'}</dd>
                    <dt>Total food load</dt><dd>{load ? describeLoad(load) : '—'}</dd>
                  </dl>
                </section>
                <section>
                  <h4>Crew & vehicle</h4>
                  <dl>
                    <dt><Users size={13} /> Volunteers</dt><dd>{selectedVolunteerNames.length ? selectedVolunteerNames.join(', ') : `${selectedVolunteerIds.length} selected`}</dd>
                    <dt><User size={13} /> NGO driver</dt><dd>{selectedDriver ? `${selectedDriver.name} · ${selectedDriver.phone}` : '—'}</dd>
                    <dt><Truck size={13} /> Driver’s vehicle</dt><dd>{selectedDriver ? `${selectedDriver.vehicle.registrationNumber} · ${selectedDriver.vehicle.kind}` : '—'}</dd>
                    <dt>Vehicle capacity</dt><dd>{selectedDriver ? `${selectedDriver.vehicle.capacityKg} kg` : '—'}</dd>
                    <dt><Box size={13} /> Containers</dt><dd>{chosenContainers.length ? chosenContainers.map(container => `${container.name} ${container.vesselCode} (${container.capacityValue} ${unitLabel(container.capacityUnit)})`).join(', ') : '—'}</dd>
                    <dt>Capacity check</dt><dd>{selectedDriver?.capacity.message ?? '—'}</dd>
                  </dl>
                </section>
              </div>
              {warnings.length > 0 && (
                <div className="wizard-tip" style={{ marginTop: '0.75rem', background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
                  <AlertTriangle size={16} />
                  <div>{[...new Set(warnings)].map(warning => <p key={warning} style={{ margin: 0 }}>{warning}</p>)}</div>
                </div>
              )}
              {live && volunteerEligibilityError && (
                <div className="wizard-tip error-tip" style={{ color: '#b91c1c', marginTop: '0.75rem' }}>
                  <ShieldAlert size={16} /> Pickup eligibility could not be verified. Return to Step 1 and review the reason.
                </div>
              )}
            </>
          )}
        </div>

        <div className="wizard-footer">
          <button type="button" className="button button-secondary" onClick={step === 0 ? onClose : () => setStep(s => s - 1)}>
            {step === 0 ? 'Cancel' : <><ArrowLeft size={17} /> Back</>}
          </button>
          <div className="step-counter">Step {step + 1} of {wizardSteps.length}</div>
          {step === wizardSteps.length - 1 ? (
            <button type="button" className="button button-primary" onClick={handleSubmit} disabled={!canConfirmAssignment}>
              {submitting ? 'Creating…' : 'Confirm Assignment'}
            </button>
          ) : (
            <button type="button" className="button button-primary" onClick={handleNext} disabled={!canContinue()}>
              Continue <ArrowRight size={17} />
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
