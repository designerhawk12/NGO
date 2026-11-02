import { useEffect, useState, type FormEvent } from 'react'
import type { AppUser } from '@aaharaconnect/shared'
import { Bell, Building2, Check, Info, Leaf, ShieldCheck } from 'lucide-react'
import { isLiveAuthConfigured, restoreAdminSession, signInAsAdmin, signOutAdmin } from '../api/auth'
import { ApiClientError } from '../api/client'

function adminSignInError(cause: unknown): string {
  const generic = 'Sign in failed or administrator access is unavailable.'
  if (!import.meta.env.DEV) return generic

  if (cause instanceof ApiClientError) {
    if (cause.code === 'NETWORK_ERROR') return 'API_UNREACHABLE: Check the Express server and VITE_API_BASE_URL.'
    if (cause.code === 'MISSING_API_URL') return 'API_CONFIGURATION: Set VITE_API_BASE_URL in apps/web/.env.'
    if (cause.code === 'DATABASE_UNAVAILABLE') return 'DATABASE_UNAVAILABLE: The API cannot currently access PostgreSQL.'
    if (cause.code === 'SERVICE_UNAVAILABLE') return 'BACKEND_UNAVAILABLE: The API or an authentication dependency is unavailable.'
    if (cause.status === 403 || cause.code === 'FORBIDDEN') return 'ADMIN_ACCESS_DENIED: This account does not have the server-owned ADMIN role.'
    if (cause.status === 401 || cause.code === 'UNAUTHENTICATED') return 'API_AUTH_REJECTED: Supabase sign-in succeeded, but the API rejected the session.'
    if (cause.status >= 500) return `BACKEND_ERROR: The API returned HTTP ${cause.status}. Check the server request log.`
    return `API_ERROR: ${cause.code} (HTTP ${cause.status}).`
  }

  if (cause instanceof Error && cause.name.startsWith('Auth')) {
    const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : ''
    return code === 'invalid_credentials'
      ? 'AUTH_INVALID: Supabase rejected the email or password.'
      : 'SUPABASE_AUTH_FAILED: Supabase could not complete password sign-in.'
  }
  if (cause instanceof Error && cause.message === 'Administrator access is required.') {
    return 'ADMIN_ACCESS_DENIED: This account does not have the server-owned ADMIN role.'
  }
  return 'SIGN_IN_FAILED: Check Supabase Auth configuration and the API response.'
}

function CoordinatorAuth({ onAdminSignIn }: { onAdminSignIn: () => void }) {
  const sessionMarker = 'aaharaconnect-admin-session'
  const configured = isLiveAuthConfigured()
  const [user, setUser] = useState<AppUser | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    if (configured && window.localStorage.getItem(sessionMarker)) restoreAdminSession().then(next => {
      if (active) setUser(next)
      if (!next) window.localStorage.removeItem(sessionMarker)
    }).catch(() => {
      if (active) {
        window.localStorage.removeItem(sessionMarker)
        setMessage('Could not restore the administrator session.')
      }
    })
    return () => { active = false }
  }, [configured])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const next = await signInAsAdmin(email.trim(), password)
      setUser(next)
      window.localStorage.setItem(sessionMarker, '1')
      setPassword('')
      onAdminSignIn()
    } catch (cause) {
      setMessage(adminSignInError(cause))
    } finally { setBusy(false) }
  }

  const leave = async () => {
    setBusy(true)
    try { await signOutAdmin(); setUser(null); window.localStorage.removeItem(sessionMarker); setMessage('Signed out.') }
    catch { setMessage('Could not sign out. Try again.') }
    finally { setBusy(false) }
  }

  return <section className="panel settings-card"><div className="settings-icon"><ShieldCheck size={22}/></div>
    <h2>Administrator account</h2><p>Connect a verified account to the shared API.</p>
    {!configured ? <div className="settings-note"><Info size={17}/><span>Live sign in is not configured on this device.</span></div>
      : user ? <><div className="settings-row"><span>API role</span><strong>{user.role}</strong></div><button type="button" className="button button-secondary" disabled={busy} onClick={() => { void leave() }}>Sign out</button></>
        : <form className="settings-auth-form" onSubmit={event => { void submit(event) }}>
          <label className="field"><span>Email</span><input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required/></label>
          <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required/></label>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>}
    {message && <p className="settings-auth-message" role="status">{message}</p>}
    <div className="settings-note"><Info size={17}/><span>Volunteer and team lists load live after administrator sign-in. Assignment changes remain demo data.</span></div>
  </section>
}

export default function Settings({ notifications, onNotificationsChange, onAdminSignIn }: { notifications: boolean; onNotificationsChange: (enabled: boolean) => void; onAdminSignIn: () => void }) {
  return <><div className="page-heading"><div><span className="eyebrow">WORKSPACE</span><h1>Settings</h1><p>Coordinator preferences for this volunteer management demo.</p></div></div><div className="settings-grid"><section className="panel settings-card"><div className="settings-icon"><Building2 size={22}/></div><h2>Chapter information</h2><p>The operational context shown throughout this prototype.</p><div className="settings-row"><span>Organisation</span><strong>AaharaConnect</strong></div><div className="settings-row"><span>Chapter</span><strong>Bengaluru</strong></div><div className="settings-row"><span>Coordinator</span><strong>Anjali Mehta</strong></div></section><section className="panel settings-card"><div className="settings-icon"><Bell size={22}/></div><h2>Coordinator preferences</h2><p>Adjust how this local demo presents updates.</p><label className="settings-toggle"><span><strong>Show success notifications</strong><small>Confirm when local records are changed</small></span><input type="checkbox" checked={notifications} onChange={e => onNotificationsChange(e.target.checked)}/><i>{notifications && <Check size={14}/>}</i></label><div className="settings-note"><Info size={17}/><span>Volunteer, team and assignment changes are kept in this browser session.</span></div></section><CoordinatorAuth onAdminSignIn={onAdminSignIn}/></div><div className="settings-footer"><Leaf size={18}/> AaharaConnect · Food Rescue Network</div></>
}
