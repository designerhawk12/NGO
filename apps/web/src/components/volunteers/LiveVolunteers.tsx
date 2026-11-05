import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Team, Volunteer, VolunteerApplication } from '@aaharaconnect/shared'
import { Check, ChevronDown, Phone, Search, SlidersHorizontal, Smartphone, Users, X, XCircle } from 'lucide-react'
import { ApiClientError } from '../../api/client'
import {
  decideAdminVolunteerApplication, getAdminVolunteer, listAdminTeams, listAdminVolunteerApplications,
  listAdminVolunteers, updateAdminVolunteer, type UpdateAdminVolunteerInput,
} from '../../features/volunteers/api'
import { Avatar, Drawer, EmptyState, Modal, StatusBadge, Toast } from '../common/UI'

type VolunteerForm = {
  name: string
  phone: string
  registrationCode: string
  skills: string
  status: 'ACTIVE' | 'INACTIVE'
}
const emptyForm: VolunteerForm = { name: '', phone: '', registrationCode: '', skills: '', status: 'ACTIVE' }
const phonePattern = /^\+[1-9][0-9]{7,14}$/
// Volunteers are crew members. Driving NGO vehicles is reserved for employee drivers (Assign Driver).
const crewSkillSuggestions = ['Food pickup assistance', 'Packing', 'Loading', 'Distribution', 'Food handling', 'Coordination']
const splitSkills = (value: string) => value.split(',').map(skill => skill.trim()).filter(Boolean)

function volunteerWriteError(cause: unknown): string {
  if (!(cause instanceof ApiClientError)) return 'Could not save volunteer. Try again.'
  const messages: Record<string, string> = {
    PHONE_ALREADY_EXISTS: 'A volunteer with this phone number already exists.',
    REGISTRATION_CODE_ALREADY_EXISTS: 'This registration code is already in use.',
    DATABASE_UNAVAILABLE: 'The database is temporarily unavailable.',
    NETWORK_ERROR: 'Could not reach the API. Check your connection and try again.',
  }
  return messages[cause.code] ?? 'Could not save volunteer. Try again.'
}

function parseForm(form: VolunteerForm):
  | { value: UpdateAdminVolunteerInput; error: null }
  | { value: null; error: string } {
  const name = form.name.trim()
  const registrationCode = form.registrationCode.trim()
  const phone = form.phone.trim()
  const skills = splitSkills(form.skills)
  if (!name || name.length > 200) return { value: null, error: 'Enter a name (up to 200 characters).' }
  if (!registrationCode || registrationCode.length > 64) return { value: null, error: 'Enter a registration code (up to 64 characters).' }
  if (phone && !phonePattern.test(phone)) return { value: null, error: 'Use E.164 phone format, for example +919876543210.' }
  if (skills.length > 32 || skills.some(skill => skill.length > 100)
    || new Set(skills.map(skill => skill.toLowerCase())).size !== skills.length) {
    return { value: null, error: 'Enter up to 32 unique skills, separated by commas.' }
  }
  return { value: { name, phoneE164: phone || null, registrationCode, skills, status: form.status }, error: null }
}

export default function LiveVolunteers({ token }: { token: string }) {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [applications, setApplications] = useState<VolunteerApplication[]>([])
  const [applicationsLoading, setApplicationsLoading] = useState(true)
  const [applicationsError, setApplicationsError] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [teamId, setTeamId] = useState('all')
  const [skill, setSkill] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Volunteer | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<VolunteerForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)
  const [feedback, setFeedback] = useState<{ message: string; kind: 'success' | 'error' } | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const [nextVolunteers, nextTeams] = await Promise.all([listAdminVolunteers(token), listAdminTeams(token)])
      setVolunteers(nextVolunteers); setTeams(nextTeams)
    } catch { setError(true) }
    finally { setLoading(false) }
  }, [token])
  const loadApplications = useCallback(async () => {
    setApplicationsLoading(true); setApplicationsError(false)
    try { setApplications(await listAdminVolunteerApplications(token)) }
    catch { setApplicationsError(true) }
    finally { setApplicationsLoading(false) }
  }, [token])
  useEffect(() => { void load(); void loadApplications() }, [load, loadApplications])
  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id); setDetail(null); setDetailLoading(true); setDetailError(false)
    try { setDetail(await getAdminVolunteer(token, id)) }
    catch { setDetailError(true) }
    finally { setDetailLoading(false) }
  }, [token])
  const openEdit = (volunteer: Volunteer) => {
    setForm({
      name: volunteer.name, phone: volunteer.phoneE164 ?? '',
      registrationCode: volunteer.registrationCode, skills: volunteer.skills.join(', '), status: volunteer.status,
    })
    setEditingId(volunteer.id); setFormError(null)
  }
  const toggleSuggestedSkill = (value: string) => {
    const current = splitSkills(form.skills)
    const exists = current.some(item => item.toLowerCase() === value.toLowerCase())
    setForm({ ...form, skills: (exists ? current.filter(item => item.toLowerCase() !== value.toLowerCase()) : [...current, value]).join(', ') })
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current || !editingId) return
    const parsed = parseForm(form)
    if (parsed.value === null) { setFormError(parsed.error); return }
    submitting.current = true; setSaving(true); setFormError(null)
    try {
      const updated = await updateAdminVolunteer(token, editingId, parsed.value)
      setVolunteers(current => current.map(item => item.id === updated.id ? updated : item))
      if (selectedId === updated.id) setDetail(updated)
      setFeedback({ message: 'Volunteer profile updated successfully.', kind: 'success' })
      setEditingId(null); setForm(emptyForm)
      void load()
    } catch (cause) {
      setFormError(volunteerWriteError(cause))
    } finally {
      submitting.current = false; setSaving(false)
    }
  }

  const reviewApplication = async (application: VolunteerApplication, status: 'APPROVED' | 'DENIED') => {
    if (reviewingId) return
    const action = status === 'APPROVED' ? 'approve' : 'deny'
    if (!window.confirm(`Are you sure you want to ${action} ${application.name}’s volunteer application?`)) return
    setReviewingId(application.volunteerId)
    try {
      await decideAdminVolunteerApplication(token, application.volunteerId, status)
      setApplications(current => current.filter(item => item.volunteerId !== application.volunteerId))
      setFeedback({ message: status === 'APPROVED' ? 'Volunteer application approved.' : 'Volunteer application denied.', kind: 'success' })
      await loadApplications()
      if (status === 'APPROVED') await load()
    } catch (cause) {
      setFeedback({ message: cause instanceof ApiClientError && cause.code === 'RESOURCE_CONFLICT'
        ? 'This application was already reviewed. Refresh the list.'
        : 'Could not update this volunteer application. Check your session and retry.', kind: 'error' })
    } finally { setReviewingId(null) }
  }
  const teamNames = (id: string) => teams.filter(team => team.memberIds.includes(id)).map(team => team.name).join(', ') || 'Unassigned'
  const skills = useMemo(() => [...new Set(volunteers.flatMap(volunteer => volunteer.skills))].sort(), [volunteers])
  const filtered = useMemo(() => volunteers.filter(volunteer => {
    const query = search.trim().toLowerCase()
    return (!query || `${volunteer.name} ${volunteer.phoneE164 ?? ''} ${volunteer.registrationCode}`.toLowerCase().includes(query))
      && (status === 'all' || volunteer.status === status)
      && (teamId === 'all' || (teamId === 'none' ? !teams.some(team => team.memberIds.includes(volunteer.id)) : teams.some(team => team.id === teamId && team.memberIds.includes(volunteer.id))))
      && (skill === 'all' || volunteer.skills.includes(skill))
  }), [volunteers, teams, search, status, teamId, skill])
  const formSkills = splitSkills(form.skills).map(item => item.toLowerCase())

  return <>
    <div className="page-heading"><div><span className="eyebrow">PEOPLE & CAPACITY</span><h1>Volunteers</h1><p>Manage NGO volunteers and their availability.</p></div></div>
    <div className="info-strip"><div className="info-strip-icon"><Smartphone size={21}/></div><div><strong>Volunteers join through the mobile app</strong><span>New volunteers register in the AaharaConnect Android app and appear below for approval. NGO drivers are employees and are added from Assign Driver.</span></div><span className="info-strip-count">{volunteers.length} profiles</span></div>
    <section className="panel volunteer-panel" aria-live="polite" aria-labelledby="volunteer-approval-heading">
      <div className="table-toolbar">
        <div><strong id="volunteer-approval-heading">Volunteer Applications</strong><p className="quiet-text">{applications.length} <span>{applications.length === 1 ? 'pending application' : 'pending applications'}</span></p></div>
        <button className="text-link" onClick={() => void loadApplications()} disabled={applicationsLoading}>Refresh applications</button>
      </div>
      {applicationsLoading && applications.length === 0 ? <p className="quiet-text" style={{ padding: 20 }}>Loading volunteer applications…</p>
        : applicationsError && applications.length === 0 ? <EmptyState title="Could not load volunteer applications" description="Check your administrator session and API connection, then retry." action={<button className="button button-secondary" onClick={() => void loadApplications()}>Retry</button>}/>
          : applications.length === 0 ? <EmptyState title="No pending applications" description="New volunteer applications will appear here for review."/>
            : <div>{applicationsError && <p className="quiet-text" role="alert">Could not refresh applications. Showing the last loaded results. <button className="text-link" onClick={() => void loadApplications()}>Retry</button></p>}
              {applications.map(application => <article key={application.volunteerId} className="flex flex-col gap-4 border-t border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{application.name}</h3><StatusBadge status={application.status}/></div>
                  <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-slate-500">Email</dt><dd className="break-all">{application.email}</dd></div>
                    <div><dt className="text-xs text-slate-500">Phone</dt><dd>{application.phoneE164 ?? '—'}</dd></div>
                    <div><dt className="text-xs text-slate-500">Registration code</dt><dd>{application.registrationCode}</dd></div>
                    <div><dt className="text-xs text-slate-500">Submitted</dt><dd>{new Date(application.submittedAt).toLocaleString()}</dd></div>
                  </dl>
                  <div className="mt-3"><span className="text-xs text-slate-500">Skills</span><div className="skill-list mt-1">{application.skills.length ? application.skills.map(skill => <span className="skill-badge" key={skill}>{skill}</span>) : <span className="quiet-text">No skills listed.</span>}</div></div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button className="button button-primary" onClick={() => void reviewApplication(application, 'APPROVED')} disabled={reviewingId !== null}><Check size={16}/>{reviewingId === application.volunteerId ? 'Saving…' : 'Approve'}</button>
                  <button className="button button-secondary" onClick={() => void reviewApplication(application, 'DENIED')} disabled={reviewingId !== null}><XCircle size={16}/>{reviewingId === application.volunteerId ? 'Saving…' : 'Deny'}</button>
                </div>
              </article>)}</div>}
    </section>
    <section className="panel volunteer-panel" aria-live="polite">
      <div className="table-toolbar"><div className="search-wrap"><Search size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search volunteers by name, phone or registration" aria-label="Search volunteers"/>{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={16}/></button>}</div><span className="result-count">Showing {filtered.length} of {volunteers.length} volunteers</span></div>
      <div className="filters"><span className="filter-caption"><SlidersHorizontal size={17}/> Filters</span><label className="select-wrap"><select value={status} onChange={event => setStatus(event.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select><ChevronDown size={15}/></label><label className="select-wrap"><select value={teamId} onChange={event => setTeamId(event.target.value)} aria-label="Filter by team"><option value="all">All teams</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}<option value="none">Unassigned</option></select><ChevronDown size={15}/></label><label className="select-wrap"><select value={skill} onChange={event => setSkill(event.target.value)} aria-label="Filter by skill"><option value="all">All skills</option>{skills.map(value => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={15}/></label>{(status !== 'all' || teamId !== 'all' || skill !== 'all') && <button className="clear-filters" onClick={() => { setStatus('all'); setTeamId('all'); setSkill('all') }}>Clear filters</button>}</div>
      {loading && volunteers.length === 0 ? <p className="quiet-text" style={{ padding: 20 }}>Loading volunteers…</p> : error && volunteers.length === 0 ? <EmptyState title="Could not load volunteers" description="Check your administrator session and API connection, then retry." action={<button className="button button-secondary" onClick={() => void load()}>Retry</button>}/> : <>
        {error && <p className="quiet-text" role="alert">Could not refresh volunteers. Showing the last loaded roster. <button className="text-link" onClick={() => void load()}>Retry</button></p>}
        {filtered.length ? <div className="table-scroll"><table className="data-table volunteer-table"><thead><tr><th>Volunteer</th><th>Phone</th><th>Skills</th><th>Team</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map(volunteer => <tr key={volunteer.id}><td><button className="person-cell" onClick={() => void loadDetail(volunteer.id)}><Avatar name={volunteer.name}/><span><strong>{volunteer.name}</strong><small>{volunteer.registrationCode}</small></span></button></td><td>{volunteer.phoneE164 ?? '—'}</td><td><div className="skill-list">{volunteer.skills.map(value => <span className="skill-badge" key={value}>{value}</span>)}</div></td><td><span className="team-cell">{teamNames(volunteer.id)}</span></td><td><StatusBadge status={volunteer.status}/></td><td><button className="text-link" onClick={() => void loadDetail(volunteer.id)}>View profile</button><button className="text-link" onClick={() => openEdit(volunteer)}>Edit volunteer</button></td></tr>)}</tbody></table></div> : <EmptyState title="No volunteers found" description="Try a different search or clear the filters to see more people." action={<button className="button button-secondary" onClick={() => { setSearch(''); setStatus('all'); setTeamId('all'); setSkill('all') }}>Clear search and filters</button>}/>}
      </>}
      <div className="table-footer"><span>Live volunteer roster</span><button className="text-link" onClick={() => void load()} disabled={loading}>Refresh</button></div>
    </section>
    {selectedId && <Drawer title="Volunteer profile" onClose={() => { setSelectedId(null); setDetail(null) }}><div className="drawer-body">{detailLoading ? <p className="quiet-text">Loading volunteer profile…</p> : detailError ? <EmptyState title="Could not load volunteer profile" description="Try again to read this record." action={<button className="button button-secondary" onClick={() => void loadDetail(selectedId)}>Retry</button>}/> : detail ? <><div className="profile-hero"><Avatar name={detail.name} size="lg"/><h2>{detail.name}</h2><span className="muted-id">{detail.registrationCode}</span><StatusBadge status={detail.status}/><button className="button button-secondary" onClick={() => { setSelectedId(null); setDetail(null); openEdit(detail) }}>Edit Volunteer</button></div><div className="detail-section"><h3>Volunteer details</h3><div className="detail-grid"><div><span>Phone</span><strong><Phone size={15}/>{detail.phoneE164 ?? '—'}</strong></div><div><span>Team</span><strong><Users size={15}/>{teamNames(detail.id)}</strong></div></div><div className="detail-skills"><span>Skills</span><div className="skill-list">{detail.skills.map(value => <span className="skill-badge" key={value}>{value}</span>)}</div></div></div><p className="quiet-text">Availability and assignment history are not included in this administrator read API.</p></> : null}</div></Drawer>}
    {editingId && <Modal title="Edit volunteer" subtitle="Update this volunteer’s administrative profile." onClose={() => { if (!saving) setEditingId(null) }}>
      <form className="dialog-form" onSubmit={event => void submit(event)} noValidate>
        <div className="form-grid">
          <label className="field field-full">Full name <span aria-hidden="true">*</span><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="e.g. Kavya Iyer" required maxLength={200}/></label>
          <label className="field">Phone<input type="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="+919876543210" aria-describedby="volunteer-phone-help"/><small id="volunteer-phone-help">Include country code, for example +919876543210.</small></label>
          <label className="field">Registration code <span aria-hidden="true">*</span><input value={form.registrationCode} onChange={event => setForm({ ...form, registrationCode: event.target.value })} placeholder="VOL-002" required maxLength={64}/></label>
          <label className="field field-full">Crew skills<input value={form.skills} onChange={event => setForm({ ...form, skills: event.target.value })} placeholder="Packing, Loading"/><small>Separate skills with commas. Skills describe crew work only; they never make a volunteer a vehicle driver.</small></label>
          <div className="field field-full"><span>Common crew skills</span><div className="skill-picker">{crewSkillSuggestions.map(value => <label key={value} className={formSkills.includes(value.toLowerCase()) ? 'selected' : ''}><input type="checkbox" checked={formSkills.includes(value.toLowerCase())} onChange={() => toggleSuggestedSkill(value)}/>{value}</label>)}</div></div>
          <label className="field">Volunteer status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as VolunteerForm['status'] })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
        </div>
        {formError && <p className="settings-auth-message" role="alert">{formError}</p>}
        <div className="dialog-footer"><button type="button" className="button button-secondary" disabled={saving} onClick={() => setEditingId(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button></div>
      </form>
    </Modal>}
    {feedback && <Toast message={feedback.message} kind={feedback.kind} onClose={() => setFeedback(null)}/>}
  </>
}
