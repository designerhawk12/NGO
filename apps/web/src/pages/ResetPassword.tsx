import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, Leaf, LockKeyhole } from 'lucide-react'
import { createRecoveryAuth, recoveryCallback, type RecoveryAuth } from '../api/recovery'
import { useRenderedLanguage, type Language } from '../lib/i18n'
import './accept-invite.css'

type Phase = 'loading' | 'ready' | 'submitting' | 'success' | 'invalid'

function clearRecoveryUrl(): void {
  window.history.replaceState(window.history.state, '', '/reset-password')
}

export default function ResetPassword({ auth: suppliedAuth }: { auth?: RecoveryAuth }) {
  const [language, setLanguage] = useState<Language>(() => window.localStorage.getItem('aaharaconnect-language') === 'kn' ? 'kn' : 'en')
  useRenderedLanguage(language)
  const [phase, setPhase] = useState<Phase>('loading')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [signedOut, setSignedOut] = useState(true)
  const authRef = useRef<RecoveryAuth | null>(null)
  const userIdRef = useRef<string | null>(null)
  const started = useRef(false)
  const changeLanguage = (next: Language) => { setLanguage(next); window.localStorage.setItem('aaharaconnect-language', next) }

  useEffect(() => {
    if (started.current) return
    started.current = true
    const restore = async () => {
      const callback = recoveryCallback(window.location)
      if (callback.kind === 'invalid') { clearRecoveryUrl(); setPhase('invalid'); return }
      const auth = suppliedAuth ?? createRecoveryAuth(callback.kind === 'implicit')
      if (!auth) { clearRecoveryUrl(); setPhase('invalid'); return }
      authRef.current = auth
      let stopObserving = () => {}
      try {
        let recoveryEvent: Promise<string | null> | null = null
        if (callback.kind === 'implicit') {
          // getSession alone also accepts ordinary sign-ins. Require the SDK's
          // recovery-specific event for this callback and this user.
          recoveryEvent = new Promise(resolve => {
            const timer = window.setTimeout(() => resolve(null), 5000)
            const { data } = auth.onAuthStateChange((event, session) => {
              if (event === 'PASSWORD_RECOVERY') {
                window.clearTimeout(timer)
                resolve(session?.user.id ?? null)
              } else if (event === 'SIGNED_IN') {
                window.clearTimeout(timer)
                resolve(null)
              }
            })
            stopObserving = () => { window.clearTimeout(timer); data.subscription.unsubscribe() }
          })
        }
        if (callback.kind === 'otp') {
          // A token hash is a secret. Remove it before contacting Supabase.
          clearRecoveryUrl()
          const verified = await auth.verifyOtp({ token_hash: callback.tokenHash, type: 'recovery' })
          if (verified.error || !verified.data.session) throw new Error('Invalid recovery link')
        }
        // The isolated client consumes the implicit callback before URL cleanup.
        const session = await auth.getSession()
        clearRecoveryUrl()
        if (session.error || !session.data.session) throw new Error('Invalid recovery link')
        if (recoveryEvent && await recoveryEvent !== session.data.session.user.id) throw new Error('Wrong callback purpose')
        const user = await auth.getUser()
        if (user.error || !user.data.user || user.data.user.id !== session.data.session.user.id) throw new Error('Invalid recovery link')
        userIdRef.current = user.data.user.id
        setPhase('ready')
      } catch {
        clearRecoveryUrl()
        try { await auth.signOut({ scope: 'local' }) } catch { /* The temporary client is not persisted. */ }
        setPhase('invalid')
      } finally { stopObserving() }
    }
    void restore()
  }, [suppliedAuth])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (phase !== 'ready' || !authRef.current || !userIdRef.current) return
    setError('')
    if (password.length < 8 || password.length > 128) { setError('Use a password between 8 and 128 characters.'); return }
    if (password !== confirmation) { setError('Passwords do not match.'); return }
    setPhase('submitting')
    const auth = authRef.current
    try {
      const user = await auth.getUser()
      if (user.error || user.data.user?.id !== userIdRef.current) {
        setPassword(''); setConfirmation(''); setPhase('invalid')
        try { await auth.signOut({ scope: 'local' }) } catch { /* The temporary client is not persisted. */ }
        return
      }
      const updated = await auth.updateUser({ password })
      if (updated.error || updated.data.user?.id !== userIdRef.current) throw new Error('Password update failed')
      setPassword(''); setConfirmation(''); setPhase('success')
      try {
        const result = await auth.signOut({ scope: 'local' })
        if (result.error) setSignedOut(false)
      } catch { setSignedOut(false) }
    } catch {
      setError('Could not set your password. Please try again.')
      setPhase('ready')
    }
  }

  return <main className="invite-page"><section className="invite-card" aria-live="polite">
    <div className="invite-header"><div className="invite-brand"><span><Leaf size={23}/></span><strong>AaharaConnect</strong></div><div className="language-switch" role="group" aria-label="Language"><button type="button" aria-pressed={language === 'en'} onClick={() => changeLanguage('en')}>English</button><span aria-hidden="true">|</span><button type="button" aria-pressed={language === 'kn'} onClick={() => changeLanguage('kn')}>ಕನ್ನಡ</button></div></div>
    {phase === 'loading' && <div role="status"><div className="invite-icon"><LockKeyhole size={25}/></div><h1>Checking recovery link…</h1><p>Please wait while we verify your secure link.</p></div>}
    {phase === 'invalid' && <div role="alert"><div className="invite-icon"><LockKeyhole size={25}/></div><h1>This recovery link is invalid or has expired.</h1><p>Request a new link to reset your password.</p><a href="/forgot-password">Request a new link</a></div>}
    {(phase === 'ready' || phase === 'submitting') && <><div className="invite-icon"><LockKeyhole size={25}/></div><h1>Choose a new password</h1><p>Use your new password when you return to Volunteer sign in.</p>
      <form className="invite-form" onSubmit={event => { void submit(event) }} noValidate>
        <label htmlFor="reset-password">New password</label><input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} disabled={phase === 'submitting'} maxLength={128}/><span className="invite-hint">8–128 characters</span>
        <label htmlFor="reset-confirmation">Confirm password</label><input id="reset-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={phase === 'submitting'} maxLength={128}/>
        {error && <p className="invite-error" role="alert">{error}</p>}
        <button className="invite-submit" type="submit" disabled={phase === 'submitting'}>{phase === 'submitting' ? 'Setting password…' : 'Set password'}</button>
      </form></>}
    {phase === 'success' && <div role="status"><div className="invite-icon success"><CheckCircle2 size={28}/></div><h1>Password updated</h1><p>Return to the mobile app and sign in with your new password. Volunteer access still depends on your application status.</p>{!signedOut && <p className="invite-hint">Close this page when you are finished.</p>}<a href="/">Back to AaharaConnect</a></div>}
  </section></main>
}
