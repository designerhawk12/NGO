import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, CheckCircle2, RotateCw, Users, UsersRound } from 'lucide-react'
import type { Pickup, Team, Volunteer } from '@aaharaconnect/shared'
import { ApiClientError } from '../api/client'
import { getAdminAccessToken, isLiveAuthConfigured } from '../api/auth'
import { listDashboardPickups, listDashboardTeams, listDashboardVolunteers } from '../api/dashboard'

type Data = { volunteers: Volunteer[]; teams: Team[]; pickups: Pickup[] }

export default function LiveDashboard({ onDemo, onSettings, onPickups }: { onDemo: () => void; onSettings: () => void; onPickups: () => void }) {
  const [state, setState] = useState<'loading' | 'sign-in' | 'forbidden' | 'error' | 'ready'>('loading')
  const [data, setData] = useState<Data | null>(null)
  const load = useCallback(async () => {
    if (!isLiveAuthConfigured()) { setState('error'); return }
    setState('loading')
    try {
      const token = await getAdminAccessToken()
      if (!token) { setData(null); setState('sign-in'); return }
      const [volunteers, teams, pickups] = await Promise.all([
        listDashboardVolunteers(token), listDashboardTeams(token), listDashboardPickups(token),
      ])
      setData({ volunteers: volunteers.items, teams: teams.items, pickups: pickups.items })
      setState('ready')
    } catch (error) {
      setData(null)
      setState(error instanceof ApiClientError && error.status === 401 ? 'sign-in' : error instanceof ApiClientError && error.status === 403 ? 'forbidden' : 'error')
    }
  }, [])
  useEffect(() => { void load() }, [load])
  const stats = data ? [
    { label: 'Active volunteers', value: data.volunteers.filter(v => v.status === 'ACTIVE').length, icon: Users },
    { label: 'Inactive volunteers', value: data.volunteers.filter(v => v.status === 'INACTIVE').length, icon: CheckCircle2 },
    { label: 'Teams', value: data.teams.length, icon: UsersRound },
    { label: 'Pickup records (latest 10)', value: data.pickups.length, icon: CalendarClock },
  ] : []
  return <>
    <div className="page-heading dashboard-heading"><div><h1>Volunteer Management</h1><p>Live operational data from the shared API. Availability and assignment details are not included in these list responses.</p></div><button className="button button-secondary" onClick={onDemo}>Open demo dashboard</button></div>
    {state === 'loading' && <section className="panel" role="status">Loading live dashboard data…</section>}
    {state === 'sign-in' && <section className="panel"><h2>Administrator sign-in required</h2><p>Sign in under Settings to read live volunteer, team, and pickup records.</p><button className="button button-primary" onClick={onSettings}>Open Settings</button><button className="button button-secondary" onClick={onDemo}>Open demo dashboard</button></section>}
    {state === 'forbidden' && <section className="panel" role="alert"><h2>Administrator access required</h2><p>The server denied access. No demo records are shown as live data.</p><button className="button button-secondary" onClick={() => void load()}>Retry</button></section>}
    {state === 'error' && <section className="panel" role="alert"><h2>Live data unavailable</h2><p>Could not load dashboard data from the shared API. No sample records are shown.</p><button className="button button-secondary" onClick={() => void load()}><RotateCw size={16}/> Retry</button></section>}
    {state === 'ready' && data && <>
      <div className="stat-grid">{stats.map(({label,value,icon:Icon}) => <div className="stat-card" key={label}><div className="stat-top"><span>{label}</span><span className="stat-icon green"><Icon size={21}/></span></div><strong>{value}</strong></div>)}</div>
      {!data.volunteers.length && !data.teams.length && !data.pickups.length && <section className="panel"><h2>No live records found</h2><p>The API returned empty volunteer, team, and pickup lists.</p></section>}
      <section className="panel operations-panel"><div className="operations-head"><div><h2>Recent pickup records</h2><p className="card-subtitle">Latest records returned by the authorized API.</p></div><button className="button button-secondary" onClick={onPickups}>{'Open Pickup & Logistics'}</button></div>
        {data.pickups.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Pickup ID</th><th>Window starts</th><th>Window ends</th><th>Status</th></tr></thead><tbody>{data.pickups.map(p => <tr key={p.id}><td>{p.id}</td><td>{new Date(p.windowStartsAt).toLocaleString()}</td><td>{new Date(p.windowEndsAt).toLocaleString()}</td><td>{p.status.replaceAll('_',' ')}</td></tr>)}</tbody></table></div> : <p>No pickup records were returned.</p>}
      </section>
      {(data.volunteers.length === 100 || data.teams.length === 100) && <p className="card-subtitle">Counts reflect the first 100 records returned; additional pages are available.</p>}
    </>}
  </>
}
