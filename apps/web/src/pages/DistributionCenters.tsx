import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Archive, MapPin, Pencil, Plus, RefreshCw, RotateCcw } from 'lucide-react'
import type { DistributionCenter } from '@aaharaconnect/shared'
import { ApiClientError } from '../api/client'
import { EmptyState, Modal } from '../components/common/UI'
import { createDistributionCenter, listDistributionCenters, updateDistributionCenter } from '../features/distribution/api'

type Form = { name: string; address: string }
const emptyForm: Form = { name: '', address: '' }

export default function DistributionCenters({ notify }: { notify?: (message: string, kind?: 'success' | 'error') => void }) {
  const [centers, setCenters] = useState<DistributionCenter[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<DistributionCenter | 'new' | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false)
    try { setCenters(await listDistributionCenters(true)) } catch { setLoadError(true) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const openForm = (center: DistributionCenter | 'new') => {
    setEditing(center); setError(null)
    setForm(center === 'new' ? emptyForm : { name: center.name ?? '', address: center.address })
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || !editing) return
    const address = form.address.trim(), name = form.name.trim()
    if (address.length < 5) { setError('Enter the full distribution address (at least 5 characters).'); return }
    setSaving(true); setError(null)
    try {
      if (editing === 'new') await createDistributionCenter({ address, ...(name ? { name } : {}) })
      else await updateDistributionCenter(editing.id, { address, name: name || null })
      notify?.(editing === 'new' ? 'Distribution Center added.' : 'Distribution Center updated.')
      setEditing(null); await load()
    } catch (cause) {
      setError(cause instanceof ApiClientError && cause.status === 400 ? 'Check the name and address and try again.' : 'Could not save the Distribution Center. Try again.')
    } finally { setSaving(false) }
  }
  const setActive = async (center: DistributionCenter, isActive: boolean) => {
    try {
      await updateDistributionCenter(center.id, { isActive })
      notify?.(isActive ? 'Distribution Center restored.' : 'Distribution Center archived. Past pickups keep their address.')
      await load()
    } catch { notify?.('Could not update the Distribution Center.', 'error') }
  }
  const visible = centers.filter(center => showArchived || center.isActive)

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DELIVERY DESTINATIONS</span>
          <h1>Distribution Center</h1>
          <p>Addresses where collected food is distributed. Pickups are scheduled to one of these.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="button button-secondary" onClick={() => setShowArchived(value => !value)} aria-pressed={showArchived}>{showArchived ? 'Hide archived' : 'Show archived'}</button>
          <button type="button" className="button button-secondary" onClick={() => void load()}><RefreshCw size={15}/> Refresh</button>
          <button type="button" className="button button-primary" onClick={() => openForm('new')}><Plus size={16}/> Add Distribution Center</button>
        </div>
      </div>
      <section className="panel">
        {loading ? <p className="quiet-text" role="status">Loading Distribution Centers…</p>
          : loadError ? <EmptyState title="Could not load Distribution Centers" description="Check your Admin session and retry." action={<button className="button button-secondary" onClick={() => void load()}>Retry</button>}/>
          : visible.length === 0 ? <EmptyState title="No Distribution Centers yet" description="Add the first address where food will be delivered." action={<button className="button button-primary" onClick={() => openForm('new')}>Add Distribution Center</button>}/>
          : <div className="table-scroll"><table className="data-table"><thead><tr><th>Name</th><th>Address</th><th>Status</th><th>Actions</th></tr></thead><tbody>
            {visible.map(center => <tr key={center.id}>
              <td><strong>{center.name || '—'}</strong></td>
              <td><span className="person-cell"><MapPin size={15} aria-hidden="true"/><span>{center.address}</span></span></td>
              <td>{center.isActive ? 'Active' : 'Archived'}</td>
              <td className="actions-cell">
                <button type="button" className="text-link" onClick={() => openForm(center)}><Pencil size={14}/> Edit</button>
                {center.isActive
                  ? <button type="button" className="text-link" onClick={() => void setActive(center, false)}><Archive size={14}/> Archive</button>
                  : <button type="button" className="text-link" onClick={() => void setActive(center, true)}><RotateCcw size={14}/> Restore</button>}
              </td>
            </tr>)}
          </tbody></table></div>}
      </section>
      {editing && <Modal title={editing === 'new' ? 'Add Distribution Center' : 'Edit Distribution Center'} subtitle="Pickups are delivered to the active centers you add here." onClose={() => setEditing(null)}>
        <form className="dialog-form" onSubmit={save} noValidate>
          <div className="form-grid">
            <label className="field field-full"><span>Name (optional)</span><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} maxLength={120} placeholder="e.g. Indiranagar Centre"/></label>
            <label className="field field-full"><span>Address <span aria-hidden="true">*</span></span><textarea className="center-address-input" value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} maxLength={500} rows={3} placeholder="Building, street, area, city and PIN code"/></label>
          </div>
          {error && <p role="alert" className="field-error">{error}</p>}
          <div className="dialog-footer"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
        </form>
      </Modal>}
    </>
  )
}
