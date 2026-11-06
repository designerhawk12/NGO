import { useRef, useState, type FormEvent } from 'react'
import { AlertTriangle, Lock } from 'lucide-react'
import { ApiClientError } from '../../api/client'
import { Modal } from '../../components/common/UI'
import { cancelPickup, updatePickup } from './api'
import { localDateTimeInputToUtcIso, toLocalDateTimeInputValue } from './dateTime'
import type { Pickup } from './types'
import DistributionCenterSelect from '../distribution/DistributionCenterSelect'

function pickupWriteError(cause: unknown): string {
  if (!(cause instanceof ApiClientError)) return 'Could not save the pickup. Try again.'
  const messages: Record<string, string> = {
    VERSION_CONFLICT: 'This pickup was changed by someone else. Close this window, refresh the list and try again.',
    PICKUP_SCHEDULE_LOCKED: 'This pickup already has an assigned crew and vehicle. Only notes can be changed; remove the pickup to reschedule it.',
    PICKUP_IN_PROGRESS: 'The crew has already started this pickup, so it can no longer be changed.',
    PICKUP_COMPLETED: 'A delivered pickup is part of the permanent record and cannot be removed.',
    PICKUP_NOT_EDITABLE: 'This pickup can no longer be edited.',
    PICKUP_NOT_REMOVABLE: 'This pickup can no longer be removed.',
    NETWORK_ERROR: 'Could not reach the API. Check your connection and try again.',
  }
  return messages[cause.code] ?? cause.message
}

export const isPickupEditable = (pickup: Pickup) => pickup.status === 'PLANNED' || pickup.status === 'ASSIGNED'
export const isPickupRemovable = (pickup: Pickup) => pickup.status === 'PLANNED' || pickup.status === 'ASSIGNED'

export function EditPickupDialog({ pickup, onClose, onSaved }: { pickup: Pickup; onClose: () => void; onSaved: () => void }) {
  const scheduleLocked = pickup.status !== 'PLANNED'
  const [startsAt, setStartsAt] = useState(() => toLocalDateTimeInputValue(pickup.windowStartsAt))
  const [endsAt, setEndsAt] = useState(() => toLocalDateTimeInputValue(pickup.windowEndsAt))
  const deliveryAddress = pickup.deliveryAddress
  const [centerId, setCenterId] = useState('')
  const [notes, setNotes] = useState(pickup.operationalNotes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy.current) return
    const input: Parameters<typeof updatePickup>[1] = { expectedVersion: pickup.version }
    if (!scheduleLocked) {
      const startIso = localDateTimeInputToUtcIso(startsAt)
      const endIso = localDateTimeInputToUtcIso(endsAt)
      if (!startIso || !endIso) { setError('Enter the pickup start and end date and time.'); return }
      if (Date.parse(endIso) <= Date.parse(startIso)) { setError('The pickup window must end after it starts.'); return }
      if (Date.parse(startIso) <= Date.now()) { setError('The new pickup window must start in the future.'); return }
      if (startIso !== new Date(pickup.windowStartsAt).toISOString() || endIso !== new Date(pickup.windowEndsAt).toISOString()) {
        input.windowStartsAt = startIso
        input.windowEndsAt = endIso
      }
      if (centerId) input.distributionCenterId = centerId
    }
    if (notes.trim() !== (pickup.operationalNotes ?? '')) input.operationalNotes = notes.trim() || null
    if (Object.keys(input).length === 1) { setError('Nothing has changed.'); return }
    busy.current = true; setSaving(true); setError(null)
    try {
      await updatePickup(pickup.id, input)
      onSaved()
    } catch (cause) {
      setError(pickupWriteError(cause))
    } finally { busy.current = false; setSaving(false) }
  }

  return <Modal title="Edit scheduled pickup" subtitle={`Pickup ${pickup.id.slice(0, 8)} · ${pickup.donorName || 'Food donor'}`} onClose={() => { if (!saving) onClose() }}>
    <form className="dialog-form" onSubmit={event => void submit(event)} noValidate>
      {scheduleLocked && <p className="wizard-tip" style={{ marginTop: 0 }}><Lock size={15}/> A crew and vehicle are already assigned, so the time and delivery location are locked to avoid changing their trip. Remove the pickup if it must be rescheduled.</p>}
      <div className="form-grid">
        <label className="field">Pickup start <span aria-hidden="true">*</span><input type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} disabled={scheduleLocked} required/></label>
        <label className="field">Pickup end <span aria-hidden="true">*</span><input type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} disabled={scheduleLocked} required/></label>
        <label className="field field-full">Delivery location (Distribution Center)<DistributionCenterSelect value={centerId} onChange={id => setCenterId(id)} disabled={scheduleLocked} keepCurrentLabel={`Keep current: ${deliveryAddress}`}/></label>
        <label className="field field-full">Operational notes<textarea className="notes-input" value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} rows={3} placeholder="e.g. Use the service entrance"/><small>The time must stay within the donor’s ready time and pickup deadline.</small></label>
      </div>
      {error && <p className="settings-auth-message" role="alert">{error}</p>}
      <div className="dialog-footer"><button type="button" className="button button-secondary" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button></div>
    </form>
  </Modal>
}

export function DeletePickupDialog({ pickup, onClose, onDeleted }: { pickup: Pickup; onClose: () => void; onDeleted: (alreadyCancelled: boolean) => void }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy.current) return
    if (reason.trim().length < 3) { setError('Give a short reason for removing this pickup.'); return }
    busy.current = true; setSaving(true); setError(null)
    try {
      const result = await cancelPickup(pickup.id, { expectedVersion: pickup.version, reason: reason.trim() })
      onDeleted(result.alreadyCancelled)
    } catch (cause) {
      setError(pickupWriteError(cause))
    } finally { busy.current = false; setSaving(false) }
  }

  return <Modal title="Delete scheduled pickup" subtitle="Are you sure you want to remove this scheduled pickup?" onClose={() => { if (!saving) onClose() }}>
    <form className="dialog-form" onSubmit={event => void submit(event)} noValidate>
      <div className="wizard-tip error-tip" style={{ marginTop: 0, alignItems: 'flex-start' }}>
        <AlertTriangle size={16}/>
        <div>
          <p style={{ margin: 0 }}><strong>{pickup.donorName || 'Food donor'}</strong> · {new Date(pickup.windowStartsAt).toLocaleString('en-IN')}</p>
          <p style={{ margin: '4px 0 0' }}>The pickup is removed from the active schedule.{pickup.status === 'ASSIGNED' ? ' Its assignment is cancelled, the volunteers, driver and vehicle are released, and its containers are returned for cleaning.' : ''} The donor’s food request is kept and can be scheduled again. The record and its history are kept for audit.</p>
        </div>
      </div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <label className="field field-full">Reason <span aria-hidden="true">*</span><input value={reason} onChange={event => setReason(event.target.value)} maxLength={500} placeholder="e.g. Donor event postponed" required/></label>
      </div>
      {error && <p className="settings-auth-message" role="alert">{error}</p>}
      <div className="dialog-footer"><button type="button" className="button button-secondary" disabled={saving} onClick={onClose}>Keep Pickup</button><button type="submit" className="button button-danger" disabled={saving}>{saving ? 'Removing…' : 'Delete Pickup'}</button></div>
    </form>
  </Modal>
}
