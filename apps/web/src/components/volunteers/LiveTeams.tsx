import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Team, Volunteer } from '@aaharaconnect/shared'
import { ArrowRight, Crown, Plus, RefreshCw, ShieldCheck, Trash2, UsersRound } from 'lucide-react'
import { ApiClientError } from '../../api/client'
import { createAdminTeam, deleteAdminTeam, getAdminTeam, listAdminTeams, listAdminVolunteers, updateAdminTeam } from '../../features/volunteers/api'
import { Avatar, Drawer, EmptyState, Modal, StatusBadge, Toast } from '../common/UI'

function safeTeamError(error: unknown): string {
  if (error instanceof ApiClientError && ['VALIDATION_ERROR', 'RESOURCE_CONFLICT', 'NOT_FOUND'].includes(error.code)) return error.message
  return 'Could not save team. Check your connection and try again.'
}

export default function LiveTeams({ token }: { token: string }) {
  const [teams, setTeams] = useState<Team[]>([])
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [rosterLoaded, setRosterLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Team | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [name, setName] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [leaderId, setLeaderId] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [feedback, setFeedback] = useState<{ message: string; kind: 'success' | 'error' } | null>(null)
  const getVolunteer = (id: string) => volunteers.find(volunteer => volunteer.id === id)
  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    setError(false)
    try {
      const [nextTeams, nextVolunteers] = await Promise.all([listAdminTeams(token), listAdminVolunteers(token)])
      setTeams(nextTeams); setVolunteers(nextVolunteers); setRosterLoaded(true)
    } catch { setError(true) }
    finally { if (initial) setLoading(false) }
  }, [token])
  useEffect(() => { void load(true) }, [load])
  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id); setDetail(null); setDetailLoading(true); setDetailError(false)
    try { setDetail(await getAdminTeam(token, id)) }
    catch { setDetailError(true) }
    finally { setDetailLoading(false) }
  }, [token])

  const openCreate = () => { setEditingTeam(null); setName(''); setMemberIds([]); setLeaderId(''); setFormError(''); setFormOpen(true) }
  const openEdit = (team: Team) => { setEditingTeam(team); setName(team.name); setMemberIds([...team.memberIds]); setLeaderId(team.leaderVolunteerId ?? ''); setFormError(''); setFormOpen(true) }
  const closeForm = () => { if (!saving) { setFormOpen(false); setFormError('') } }
  const removeTeam = async (team: Team) => {
    if (!window.confirm(`Delete ${team.name}? Team membership links will be removed. Teams with pickup assignments cannot be deleted.`)) return
    try {
      await deleteAdminTeam(token, team.id)
      setTeams(current => current.filter(item => item.id !== team.id))
      if (selectedId === team.id) { setSelectedId(null); setDetail(null) }
      setFeedback({ message: 'Team deleted. No pickup records were removed.', kind: 'success' })
    } catch (cause) { setFeedback({ message: safeTeamError(cause), kind: 'error' }) }
  }
  const toggleMember = (id: string) => {
    if (memberIds.includes(id)) {
      setMemberIds(current => current.filter(memberId => memberId !== id))
      if (leaderId === id) setLeaderId('')
    } else setMemberIds(current => [...new Set([...current, id])])
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    const trimmed = name.trim()
    if (!trimmed) { setFormError('Team name is required.'); return }
    if (trimmed.length > 200) { setFormError('Team name must be 200 characters or fewer.'); return }
    if (new Set(memberIds).size !== memberIds.length) { setFormError('Team members must be unique.'); return }
    if (leaderId && !memberIds.includes(leaderId)) { setFormError('The leader must be a team member.'); return }
    setSaving(true); setFormError('')
    try {
      const input = { name: trimmed, memberIds, leaderVolunteerId: leaderId || null }
      const saved = editingTeam ? await updateAdminTeam(token, editingTeam.id, input) : await createAdminTeam(token, input)
      setTeams(current => editingTeam ? current.map(team => team.id === saved.id ? saved : team) : [saved, ...current])
      if (selectedId === saved.id) setDetail(saved)
      setFormOpen(false); setEditingTeam(null); setName(''); setMemberIds([]); setLeaderId('')
      setFeedback({ message: editingTeam ? 'Team updated successfully.' : 'Team created successfully.', kind: 'success' })
      void load()
    } catch (cause) { setFormError(safeTeamError(cause)) }
    finally { setSaving(false) }
  }

  return <>
    <div className="page-heading"><div><span className="eyebrow">PEOPLE WORKING TOGETHER</span><h1>Volunteer Teams</h1><p>Build reliable crews for every food rescue.</p></div><div className="flex gap-2"><button className="button button-secondary" onClick={() => void load(true)} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> Refresh</button><button className="button button-primary" disabled={!rosterLoaded || loading} onClick={openCreate}><Plus size={18}/> Create Team</button></div></div>
    <div className="team-intro"><div className="team-intro-icon"><UsersRound size={23}/></div><div><strong>Live team roster</strong><p>Manage teams and membership through the shared API.</p></div><span>{teams.length} teams</span></div>
    {error && <section className="panel live-team-load-error" role="alert">Could not refresh teams or volunteers. <button className="button button-secondary" onClick={() => void load(true)}>Retry</button></section>}
    {loading ? <section className="panel" style={{ padding: 20 }}><p>Loading teams…</p></section> : !rosterLoaded ? <section className="panel"><EmptyState title="Could not load teams" description="Check your administrator session and API connection, then retry." action={<button className="button button-secondary" onClick={() => void load(true)}>Retry</button>}/></section> : teams.length ? <div className="team-grid">{teams.map(team => {
      const members = team.memberIds.map(getVolunteer).filter((member): member is Volunteer => !!member)
      const leader = team.leaderVolunteerId ? getVolunteer(team.leaderVolunteerId) : null
      return <article className="team-card" key={team.id}><div className="team-card-top"><div className="team-symbol"><UsersRound size={22}/></div></div><div className="team-card-title"><span>{team.id}</span><h2>{team.name}</h2></div><div className="team-leader"><span>TEAM LEADER</span><div><Avatar name={leader?.name ?? 'Team leader'} size="sm"/><strong>{leader?.name ?? 'Unassigned'}</strong><Crown size={15}/></div></div><div className="team-card-stats"><div><strong>{team.memberIds.length}</strong><span>Members</span></div></div><div className="team-card-footer"><div className="avatar-stack">{members.slice(0, 4).map(member => <Avatar key={member.id} name={member.name} size="sm"/>)}{members.length > 4 && <span className="avatar-overflow">+{members.length - 4}</span>}</div><button onClick={() => void loadDetail(team.id)}>View Team <ArrowRight size={17}/></button></div></article>
    })}</div> : <section className="panel"><EmptyState title="No teams found" description="Create a team to organize your Volunteer roster." action={<button className="button button-secondary" onClick={openCreate}>Create Team</button>}/></section>}
    {selectedId && <Drawer title="Team details" onClose={() => { setSelectedId(null); setDetail(null) }}><div className="drawer-body">{detailLoading ? <p className="quiet-text">Loading team details…</p> : detailError ? <EmptyState title="Could not load team details" description="Try again to read this record." action={<button className="button button-secondary" onClick={() => void loadDetail(selectedId)}>Retry</button>}/> : detail ? <><div className="team-detail-hero"><div className="team-symbol"><UsersRound size={26}/></div><span>{detail.id}</span><h2>{detail.name}</h2><p>Team membership from the shared API.</p></div><div className="team-detail-summary"><div><span>Leader</span><strong>{detail.leaderVolunteerId ? getVolunteer(detail.leaderVolunteerId)?.name ?? 'Unknown volunteer' : 'Unassigned'}</strong></div><div><span>Members</span><strong>{detail.memberIds.length}</strong></div></div><div className="detail-section"><div className="section-heading"><h3>Team members</h3></div>{detail.memberIds.length ? detail.memberIds.map(id => {
      const member = getVolunteer(id)
      return <div className="member-row" key={id}><Avatar name={member?.name ?? 'Volunteer'}/><div><strong>{member?.name ?? 'Unknown volunteer'}{id === detail.leaderVolunteerId && <Crown size={14}/>}</strong>{member && <StatusBadge status={member.status}/>}</div></div>
    }) : <p className="quiet-text">No members in this team.</p>}</div><div className="detail-section"><div className="leadership-note"><ShieldCheck size={20}/><span>Membership and leadership are managed by administrators.</span></div><button className="button button-secondary full-width" onClick={() => openEdit(detail)}>Edit Team</button><button className="button button-danger full-width mt-2" onClick={() => void removeTeam(detail)}><Trash2 size={16}/> Delete Team</button></div></> : null}</div></Drawer>}
    {formOpen && <Modal title={editingTeam ? 'Edit team' : 'Create a team'} subtitle="Choose members from the live Volunteer roster." onClose={closeForm} wide><form className="dialog-form" onSubmit={event => { void save(event) }} noValidate>
      <label className="field">Team name<input value={name} onChange={event => setName(event.target.value)} maxLength={200} autoFocus/></label>
      <fieldset className="team-member-fieldset"><legend>Team members</legend>{volunteers.length ? <div className="team-member-options">{volunteers.map(volunteer => {
        const assignedElsewhere = teams.some(team => team.id !== editingTeam?.id && team.memberIds.includes(volunteer.id))
        return <label className="team-member-option" key={volunteer.id}><input type="checkbox" checked={memberIds.includes(volunteer.id)} disabled={saving || assignedElsewhere} onChange={() => toggleMember(volunteer.id)}/><span><strong>{volunteer.name}</strong><small>{volunteer.registrationCode}{assignedElsewhere ? ' · Already in another team' : ''}</small></span></label>
      })}</div> : <p className="quiet-text">No volunteers are available in the live roster.</p>}</fieldset>
      <label className="field">Team leader (optional)<select value={leaderId} onChange={event => setLeaderId(event.target.value)} disabled={saving || memberIds.length === 0}><option value="">No leader</option>{memberIds.map(id => <option key={id} value={id}>{getVolunteer(id)?.name ?? 'Unknown volunteer'}</option>)}</select></label>
      {formError && <p className="settings-auth-message" role="alert">{formError}</p>}
      <div className="dialog-footer"><button type="button" className="button button-secondary" disabled={saving} onClick={closeForm}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : editingTeam ? 'Save Team' : 'Create Team'}</button></div>
    </form></Modal>}
    {feedback && <Toast message={feedback.message} kind={feedback.kind} onClose={() => setFeedback(null)}/>}
  </>
}
