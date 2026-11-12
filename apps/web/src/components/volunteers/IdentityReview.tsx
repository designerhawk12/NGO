import { useState } from 'react'
import { apiRequest } from '../../api/client'
type Proof = { required: boolean; documentType: string | null; status: string | null; reviewedBy: string | null; reviewedAt: string | null; reason: string | null; previewUrl: string | null }
export default function IdentityReview({ volunteerId, token }: { volunteerId: string; token: string }) {
  const [proof, setProof] = useState<Proof | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const headers = { Authorization: `Bearer ${token}` }
  const load = async () => {
    setBusy(true); setError('')
    try { setProof(await apiRequest<Proof>(`volunteers/${volunteerId}/identity`, { headers })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Proof could not be loaded.') }
    finally { setBusy(false) }
  }
  const review = async (status: 'VERIFIED' | 'REJECTED') => {
    const reason = window.prompt(status === 'VERIFIED' ? 'Confirm you manually reviewed this proof. Do not enter document numbers.' : 'Reason for rejecting the proof (do not include document numbers):')
    if (!reason?.trim()) return
    setBusy(true); setError('')
    try { await apiRequest(`volunteers/${volunteerId}/identity/review`, { method: 'POST', headers, body: { status, reason } }); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Proof review could not be saved.') }
    finally { setBusy(false) }
  }
  return <section style={{ marginTop: 12 }}>
    <button className="button button-secondary" disabled={busy} onClick={() => void load()}>Review identity proof</button>
    {error && <p role="alert">{error}</p>}
    {proof && <div>
      <p>{proof.required ? 'Identity verification required' : 'Existing application — legacy transition policy'} · {proof.documentType ?? 'No proof submitted'} · {proof.status ?? 'Missing'}</p>
      {proof.previewUrl && <><img src={proof.previewUrl} referrerPolicy="no-referrer" alt="Private identity proof" style={{ maxWidth: '100%', maxHeight: 300, objectFit: 'contain' }} /><p>Private preview expires in two minutes. Reload to view again.</p></>}
      {proof.reviewedAt && <p>Reviewed by {proof.reviewedBy} at {new Date(proof.reviewedAt).toLocaleString()}</p>}
      {proof.reason && <p>{proof.reason}</p>}
      {proof.previewUrl && <div className="flex gap-2">
        <button className="button button-primary" disabled={busy} onClick={() => void review('VERIFIED')}>Mark identity Verified</button>
        <button className="button button-secondary" disabled={busy} onClick={() => void review('REJECTED')}>Reject identity proof</button>
      </div>}
      <button className="button button-secondary" onClick={() => setProof(null)}>Close private preview</button>
    </div>}
  </section>
}
