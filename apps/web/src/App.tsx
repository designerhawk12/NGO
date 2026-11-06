import { useCallback, useEffect, useState } from 'react'
import { Layout } from './components/layout/Layout'
import { Toast } from './components/common/UI'
import CreateAssignmentDialog from './components/assignments/CreateAssignmentDialog'
import { drivers as initialDrivers, events, initialAssignments, initialMaintenanceRecords, initialTeams, initialVolunteers, vehicles as initialVehicles } from './data/mockData'
import Volunteers from './pages/Volunteers'
import Teams from './pages/Teams'
import PickupsLogistics from './pages/PickupsLogistics'
import Settings from './pages/Settings'
import VehicleTracking from './pages/VehicleTracking'
import Vehicles from './pages/Vehicles'
import FoodDonor from './pages/FoodDonor'
import Vessels from './pages/Vessels'
import AssignDriver from './pages/AssignDriver'
import DistributionCenters from './pages/DistributionCenters'
import LiveDashboard from './pages/LiveDashboard'
import { useRenderedLanguage, type Language } from './lib/i18n'
import { restoreAdminSession } from './api/auth'
import type { Assignment, Page, Vehicle, VehicleMaintenanceRecord, Volunteer, VolunteerTeam } from './types'

export default function App() {
  const [language, setLanguage] = useState<Language>(() => window.localStorage.getItem('aaharaconnect-language') === 'kn' ? 'kn' : 'en')
  useRenderedLanguage(language)
  const resolvePageFromUrl = (): Page => {
    if (typeof window !== 'undefined') {
      const searchP = new URLSearchParams(window.location.search).get('page')
      const hashQuery = window.location.hash.includes('?')
        ? new URLSearchParams(window.location.hash.split('?')[1]).get('page')
        : null
      const directHash = window.location.hash.replace(/^#\/?(workspace\/?)?/, '').split('?')[0]
      const p = searchP || hashQuery || directHash
      if (p === 'assignments') return 'pickups'
      if (p === 'food' || p === 'pickups' || p === 'volunteers' || p === 'teams' || p === 'tracking' || p === 'vehicles' || p === 'drivers' || p === 'vessels' || p === 'distribution' || p === 'settings') {
        return p as Page
      }
    }
    return 'dashboard'
  }
  const [page, setPage] = useState<Page>(resolvePageFromUrl)
  const [workspaceAccess, setWorkspaceAccess] = useState<'checking' | 'allowed' | 'denied'>('checking')
  const [workspaceRetry, setWorkspaceRetry] = useState(0)

  useEffect(() => {
    if (page === 'dashboard' || page === 'settings') { setWorkspaceAccess('allowed'); return }
    let active = true
    setWorkspaceAccess('checking')
    void restoreAdminSession().then(user => {
      if (active) setWorkspaceAccess(user?.role === 'ADMIN' ? 'allowed' : 'denied')
    }).catch(() => { if (active) setWorkspaceAccess('denied') })
    return () => { active = false }
  }, [page, workspaceRetry])

  useEffect(() => {
    const handleNav = () => {
      const p = resolvePageFromUrl()
      if (p !== 'dashboard') setPage(p)
    }
    window.addEventListener('hashchange', handleNav)
    return () => window.removeEventListener('hashchange', handleNav)
  }, [])
  const [volunteers, setVolunteers] = useState<Volunteer[]>(initialVolunteers)
  const [teams, setTeams] = useState<VolunteerTeam[]>(initialTeams)
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('aaharaconnect_vehicles')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) return parsed
        } catch {}
      }
    }
    return initialVehicles
  })
  const [maintenanceRecords, setMaintenanceRecords] = useState<VehicleMaintenanceRecord[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('aaharaconnect_maintenance_records')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) return parsed
        } catch {}
      }
    }
    return initialMaintenanceRecords
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('aaharaconnect_vehicles', JSON.stringify(vehicles))
    }
  }, [vehicles])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('aaharaconnect_maintenance_records', JSON.stringify(maintenanceRecords))
    }
  }, [maintenanceRecords])
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [initialVolunteerId, setInitialVolunteerId] = useState<string | undefined>()
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null)
  const [showSuccessNotifications, setShowSuccessNotifications] = useState(true)
  const notify = useCallback((message: string, kind: 'success' | 'error' = 'success') => { if (kind === 'error' || showSuccessNotifications) setToast({ message, kind }) }, [showSuccessNotifications])
  const openAssignment = (volunteerId?: string) => { if (volunteerId) { const volunteer = volunteers.find(v => v.volunteerId === volunteerId); if (volunteer?.status !== 'AVAILABLE') { notify('Cannot assign this volunteer. They are not currently available.', 'error'); return } } setInitialVolunteerId(volunteerId); setAssignmentOpen(true) }
  const assignTeam = (volunteerId: string, teamId: string) => {
    setVolunteers(current => current.map(v => v.volunteerId === volunteerId ? { ...v, teamId:teamId || undefined } : v))
    setTeams(current => current.map(team => { const memberIds = team.memberIds.filter(id => id !== volunteerId); if (team.teamId === teamId) memberIds.push(volunteerId); return { ...team, memberIds, leaderId:team.leaderId === volunteerId && team.teamId !== teamId ? memberIds[0] ?? '' : team.leaderId } }))
  }
  const createAssignment = (assignment: Assignment) => { setAssignments(current => [assignment, ...current]); setAssignmentOpen(false); setPage('pickups'); notify('Assignment Created Successfully · Pending') }
  const changeLanguage = (next: Language) => { setLanguage(next); window.localStorage.setItem('aaharaconnect-language', next) }
  const requiresAdmin = page !== 'dashboard' && page !== 'settings'
  return <Layout page={page} onPage={setPage} language={language} onLanguageChange={changeLanguage}>
    {requiresAdmin && workspaceAccess !== 'allowed' ? <section className="panel" role="status" style={{ padding: 22 }}>
      {workspaceAccess === 'checking' ? <><h2>Verifying administrator access…</h2><p>Live module data is shown only after the API confirms an Admin account.</p></>
        : <><h2>Administrator sign-in required</h2><p>Sample records are not shown in this workspace. Sign in under Settings to load live data.</p><div className="flex gap-2"><button className="button button-primary" onClick={() => setPage('settings')}>Open Settings</button><button className="button button-secondary" onClick={() => setWorkspaceRetry(value => value + 1)}>Retry</button></div></>}
    </section> : <>
    {page === 'dashboard' && <LiveDashboard onSettings={() => setPage('settings')} onPickups={() => setPage('pickups')}/>}
    {page === 'volunteers' && <Volunteers volunteers={volunteers} teams={teams} assignments={assignments} setVolunteers={setVolunteers} onAssignTeam={assignTeam} onCreateAssignment={openAssignment} notify={notify}/>}
    {page === 'teams' && <Teams volunteers={volunteers} teams={teams} setTeams={setTeams} onAssignTeam={assignTeam} notify={notify}/>}
    {page === 'food' && <FoodDonor vehicles={vehicles} setVehicles={setVehicles} notify={notify}/>}
    {page === 'pickups' && <PickupsLogistics assignments={assignments} setAssignments={setAssignments} volunteers={volunteers} teams={teams} onCreateAssignment={() => openAssignment()} notify={notify}/>}
    {page === 'tracking' && <VehicleTracking />}
    {page === 'vehicles' && <Vehicles vehicles={vehicles} setVehicles={setVehicles} maintenanceRecords={maintenanceRecords} setMaintenanceRecords={setMaintenanceRecords} drivers={initialDrivers} assignments={assignments} events={events} notify={notify}/>}
    {page === 'drivers' && <AssignDriver notify={notify} onOpenVehicles={() => setPage('vehicles')}/>}
    {page === 'vessels' && <Vessels vehicles={vehicles} notify={notify} />}
    {page === 'distribution' && <DistributionCenters notify={notify} />}
    {page === 'settings' && <Settings notifications={showSuccessNotifications} onNotificationsChange={setShowSuccessNotifications} onAdminSignIn={() => setPage('dashboard')}/>}
    {assignmentOpen && <CreateAssignmentDialog volunteers={volunteers} teams={teams} assignments={assignments} initialVolunteerId={initialVolunteerId} onClose={() => setAssignmentOpen(false)} onCreate={createAssignment} notify={notify}/>}
    </>}
    {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)}/>}
  </Layout>
}
