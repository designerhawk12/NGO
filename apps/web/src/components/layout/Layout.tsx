import { Bell, Boxes, Building2, Car, ChevronDown, IdCard, LayoutDashboard, Leaf, Menu, PackageCheck, PackageOpen, Settings, Truck, Users, UsersRound, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Page } from '../../types'
import { Avatar } from '../common/UI'
import type { Language } from '../../lib/i18n'
import { fetchAllDonorRequests } from '../../features/vehicles/donorTripService'
import { isLiveAdmin } from '../../features/pickups/adapters'

const nav: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id:'dashboard', label:'Dashboard', icon:LayoutDashboard },
  { id:'volunteers', label:'Volunteers', icon:Users },
  { id:'teams', label:'Teams', icon:UsersRound },
  { id:'food', label:'Food & Donors', icon:PackageOpen },
  { id:'pickups', label:'Pickup & Logistics', icon:PackageCheck },
  { id:'tracking', label:'Vehicle Tracking', icon:Car },
  { id:'vehicles', label:'Vehicle Details', icon:Truck },
  { id:'drivers', label:'Assign Driver', icon:IdCard },
  { id:'vessels', label:'Vessels', icon:Boxes },
  { id:'distribution', label:'Distribution Center', icon:Building2 },
]
function updateTitle(status: string, assignmentStatus?: string | null): string {
  const state = assignmentStatus ?? status
  const titles: Record<string, string> = {
    PENDING: 'New pickup assignment', ACCEPTED: 'Pickup assignment accepted',
    EN_ROUTE: 'Pickup crew en route', ARRIVED_AT_DONOR: 'Crew checked in at pickup',
    FOOD_COLLECTED: 'Food collected', DELIVERED: 'Food delivered',
    REJECTED: 'Pickup assignment declined', CANCELLED: 'Food request cancelled',
    FAILED: 'Pickup could not be completed', SUBMITTED: 'New food request',
  }
  return titles[state] ?? `Pickup status: ${state.replaceAll('_', ' ').toLowerCase()}`
}

const titles: Record<Page,string> = { dashboard:'Volunteer Management', volunteers:'Volunteers', teams:'Volunteer Teams', food:'Food & Donors', assignments:'Assignments', pickups:'Pickup & Logistics', tracking:'Vehicle Tracking', vehicles:'Vehicle Details & Fleet', drivers:'Assign Driver', vessels:'Vessels & Food Containers', distribution:'Distribution Center', settings:'Settings' }

export function Layout({ page, onPage, language, onLanguageChange, children }: { page: Page; onPage: (page: Page) => void; language: Language; onLanguageChange: (language: Language) => void; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [pickupUpdates, setPickupUpdates] = useState<Awaited<ReturnType<typeof fetchAllDonorRequests>>>([])
  const [updatesLoading, setUpdatesLoading] = useState(false)
  const [updatesError, setUpdatesError] = useState(false)
  const loadPickupUpdates = async () => {
    setUpdatesLoading(true)
    setUpdatesError(false)
    try {
      if (!isLiveAdmin()) throw new Error('Admin session required')
      setPickupUpdates([...new Map((await fetchAllDonorRequests(true)).map(item => [item.id, item])).values()].sort((a, b) => Date.parse(b.pickup?.windowStartsAt ?? b.readyAt) - Date.parse(a.pickup?.windowStartsAt ?? a.readyAt)))
    } catch {
      setPickupUpdates([])
      setUpdatesError(true)
    } finally { setUpdatesLoading(false) }
  }
  const go = (next: Page) => { onPage(next); setMobileOpen(false); setUserOpen(false); setNotificationOpen(false); window.scrollTo({ top:0, behavior:'smooth' }) }
  return <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Leaf size={21} strokeWidth={2.4}/></div><div className="brand-text"><strong>AaharaConnect</strong><small>Food Rescue Network</small></div><button className="sidebar-close icon-button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18}/></button></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">{nav.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => go(item.id)} title={item.label}><item.icon size={19} strokeWidth={1.9}/><span>{item.label}</span>{page === item.id && <i/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><div className="sidebar-help-icon"><Leaf size={19}/></div><strong>Every meal matters.</strong><p>People and purpose, working together for a better Bengaluru.</p></div><button className={`nav-item settings-item ${page === 'settings' ? 'active' : ''}`} onClick={() => go('settings')} title="Settings"><Settings size={19}/><span>Settings</span></button><button className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><Menu size={18}/><span>{collapsed ? 'Expand' : 'Collapse'} sidebar</span></button></div>
    </aside>
    {mobileOpen && <button className="mobile-shade" onClick={() => setMobileOpen(false)} aria-label="Close navigation"/>}
    <div className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={21}/></button><div className="breadcrumbs"><span>Workspace</span><span className="breadcrumb-separator">/</span><strong>{titles[page]}</strong></div></div><div className="topbar-right"><div className="language-switch" role="group" aria-label="Language"><button type="button" className={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} onClick={() => onLanguageChange('en')}>English</button><span aria-hidden="true">|</span><button type="button" className={language === 'kn' ? 'active' : ''} aria-pressed={language === 'kn'} onClick={() => onLanguageChange('kn')}>ಕನ್ನಡ</button></div><div className="notification-wrap"><button className="icon-button notification-button" title="Notifications" aria-label="Notifications" aria-expanded={notificationOpen} onClick={() => { const opening = !notificationOpen; setNotificationOpen(opening); setUserOpen(false); if (opening) void loadPickupUpdates() }}><Bell size={20}/><i/></button>{notificationOpen && <div className="notification-popover"><strong>Live pickup updates</strong><p>Current status from the authorized food and pickup APIs. This is not a separate event-history feed.</p>{updatesLoading ? <p role="status">Refreshing live updates…</p> : updatesError ? <p role="alert">Could not load live updates. Check your Admin session and retry.</p> : pickupUpdates.length ? <ul>{pickupUpdates.slice(0, 8).map(item => <li key={item.id}><button type="button" onClick={() => go(item.pickup ? 'pickups' : 'food')}><strong><PackageCheck size={15} aria-hidden="true"/> {updateTitle(item.status, item.pickup?.assignmentStatus)}</strong><span>Request {item.id.slice(0, 8)} · {item.pickup ? 'Pickup scheduled' : 'Awaiting pickup'}</span><small>{item.pickup ? `${new Date(item.pickup.windowStartsAt).toLocaleString('en-IN')} to ${new Date(item.pickup.windowEndsAt).toLocaleString('en-IN')}` : `Ready ${new Date(item.readyAt).toLocaleString('en-IN')}`}</small></button></li>)}</ul> : <p>No current food or pickup updates.</p>}<button type="button" className="text-link" onClick={() => void loadPickupUpdates()} disabled={updatesLoading}>Refresh updates</button></div>}</div><div className="profile-menu-wrap"><button className="profile-button" onClick={() => { setUserOpen(!userOpen); setNotificationOpen(false) }} aria-expanded={userOpen}><Avatar name="Admin" size="sm"/><span className="profile-name"><strong>Admin</strong><small>NGO Coordinator</small></span><ChevronDown size={15}/></button>{userOpen && <div className="profile-dropdown"><div className="dropdown-user"><strong>Admin</strong><span>NGO Coordinator</span></div><button onClick={() => go('settings')}><Settings size={16}/> Workspace settings</button></div>}</div></div></header><main className="content">{children}</main></div>
  </div>
}
