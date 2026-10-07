import { Bell, Car, ChevronDown, ClipboardList, LayoutDashboard, Leaf, Menu, PackageCheck, PackageOpen, Settings, Truck, Users, UsersRound, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Page } from '../../types'
import { Avatar } from '../common/UI'
import type { Language } from '../../lib/i18n'

const nav: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id:'dashboard', label:'Dashboard', icon:LayoutDashboard },
  { id:'volunteers', label:'Volunteers', icon:Users },
  { id:'teams', label:'Teams', icon:UsersRound },
  { id:'food', label:'Food & Donors', icon:PackageOpen },
  { id:'assignments', label:'Assignments', icon:ClipboardList },
  { id:'pickups', label:'Pickup & Logistics', icon:PackageCheck },
  { id:'tracking', label:'Vehicle Tracking', icon:Car },
  { id:'vehicles', label:'Vehicle Details', icon:Truck },
]
const titles: Record<Page,string> = { dashboard:'Volunteer Management', volunteers:'Volunteers', teams:'Volunteer Teams', food:'Food & Donors', assignments:'Assignments', pickups:'Pickup & Logistics', tracking:'Vehicle Tracking', vehicles:'Vehicle Details & Fleet', settings:'Settings' }

export function Layout({ page, onPage, language, onLanguageChange, children }: { page: Page; onPage: (page: Page) => void; language: Language; onLanguageChange: (language: Language) => void; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const go = (next: Page) => { onPage(next); setMobileOpen(false); setUserOpen(false); setNotificationOpen(false); window.scrollTo({ top:0, behavior:'smooth' }) }
  return <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Leaf size={21} strokeWidth={2.4}/></div><div className="brand-text"><strong>AaharaConnect</strong><small>Food Rescue Network</small></div><button className="sidebar-close icon-button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18}/></button></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">{nav.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => go(item.id)} title={item.label}><item.icon size={19} strokeWidth={1.9}/><span>{item.label}</span>{page === item.id && <i/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><div className="sidebar-help-icon"><Leaf size={19}/></div><strong>Every meal matters.</strong><p>People and purpose, working together for a better Bengaluru.</p></div><button className={`nav-item settings-item ${page === 'settings' ? 'active' : ''}`} onClick={() => go('settings')} title="Settings"><Settings size={19}/><span>Settings</span></button><button className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><Menu size={18}/><span>{collapsed ? 'Expand' : 'Collapse'} sidebar</span></button></div>
    </aside>
    {mobileOpen && <button className="mobile-shade" onClick={() => setMobileOpen(false)} aria-label="Close navigation"/>}
    <div className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={21}/></button><div className="breadcrumbs"><span>Workspace</span><span className="breadcrumb-separator">/</span><strong>{titles[page]}</strong></div></div><div className="topbar-right"><div className="language-switch" role="group" aria-label="Language"><button type="button" className={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} onClick={() => onLanguageChange('en')}>English</button><span aria-hidden="true">|</span><button type="button" className={language === 'kn' ? 'active' : ''} aria-pressed={language === 'kn'} onClick={() => onLanguageChange('kn')}>ಕನ್ನಡ</button></div><div className="notification-wrap"><button className="icon-button notification-button" title="Notifications" aria-label="Notifications" aria-expanded={notificationOpen} onClick={() => { setNotificationOpen(!notificationOpen); setUserOpen(false) }}><Bell size={20}/><i/></button>{notificationOpen && <div className="notification-popover"><strong>Notifications</strong><p>You’re all caught up. Assignment updates will appear here during your session.</p></div>}</div><div className="profile-menu-wrap"><button className="profile-button" onClick={() => { setUserOpen(!userOpen); setNotificationOpen(false) }} aria-expanded={userOpen}><Avatar name="Anjali Mehta" size="sm"/><span className="profile-name"><strong>Anjali Mehta</strong><small>NGO Coordinator</small></span><ChevronDown size={15}/></button>{userOpen && <div className="profile-dropdown"><div className="dropdown-user"><strong>Anjali Mehta</strong><span>NGO Coordinator</span></div><button onClick={() => go('settings')}><Settings size={16}/> Workspace settings</button></div>}</div></div></header><main className="content">{children}</main></div>
  </div>
}
