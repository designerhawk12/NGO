import { useEffect, useState } from 'react'
import type { DistributionCenter } from '@aaharaconnect/shared'
import { centerLabel, listDistributionCenters } from './api'

/** Required destination picker for scheduled pickups. Only active, server-stored centers are offered. */
export default function DistributionCenterSelect({ value, onChange, disabled = false, keepCurrentLabel }: {
  value: string
  onChange: (id: string, center: DistributionCenter | null) => void
  disabled?: boolean
  /** Edit dialogs: label for the empty option that keeps the pickup's existing destination. */
  keepCurrentLabel?: string
}) {
  const [centers, setCenters] = useState<DistributionCenter[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    listDistributionCenters().then(items => { if (active) setCenters(items) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [])
  if (failed) return <p role="alert" className="field-error">Could not load Distribution Centers. Reload the page and try again.</p>
  if (centers === null) return <p className="quiet-text" role="status">Loading Distribution Centers…</p>
  if (centers.length === 0 && !keepCurrentLabel) {
    return <p className="quiet-text">No Distribution Centers yet. <a href="#/workspace/distribution">Add a Distribution Center</a> first, then schedule the pickup.</p>
  }
  return (
    <>
      <select value={value} disabled={disabled} required={!keepCurrentLabel}
        onChange={event => onChange(event.target.value, centers.find(center => center.id === event.target.value) ?? null)}>
        <option value="">{keepCurrentLabel ?? 'Select a Distribution Center'}</option>
        {centers.map(center => <option key={center.id} value={center.id}>{centerLabel(center)}</option>)}
      </select>
      <small><a href="#/workspace/distribution">Add or edit Distribution Centers</a></small>
    </>
  )
}
