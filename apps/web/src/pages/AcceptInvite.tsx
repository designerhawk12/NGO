import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, Leaf, LockKeyhole } from 'lucide-react'
import { createInviteAuth, type InviteAuth } from '../api/invite'
import { useRenderedLanguage, type Language } from '../lib/i18n'
import './accept-invite.css'

type Phase = 'loading' | 'ready' | 'submitting' | 'success' | 'invalid'
const INVALID_MESSAGE = 'This invitation is invalid or has expired.'

function clearInviteUrl(): void {
  window.history.replaceState(window.history.state, '', '/accept-invite')
}

function invitationParameters(): { type: string | null; tokenHash: string | null; hasError: boolean } {
  const query = new URLSearchParams(window.location.search)
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return {
    type: query.get('type') ?? fragment.get('type'),
    tokenHash: query.get('token_hash'),
    hasError: query.has('error') || query.has('error_code') || fragment.has('error') || fragment.has('error_code'),
  }
}

export default function AcceptInvite({ auth: suppliedAuth }: { auth?: InviteAuth }) {
  const [language, setLanguage] = useState<Language>(() => window.localStorage.getItem('aaharaconnect-language') === 'kn' ? 'kn' : 'en')
  useRenderedLanguage(language)
  const [phase, setPhase] = useState<Phase>('loading')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [formError, setFormError] = useState('')
  const [signedOut, setSignedOut] = useState(true)
  const authRef = useRef<InviteAuth | null>(null)
  const userIdRef = useRef<string | null>(null)
  const started = useRef(false)
  const changeLanguage = (next: Language) => { setLanguage(next); window.localStorage.setItem('aaharaconnect-language', next) }

  useEffect(() => {
    if (started.current) return
    started.current = true
    const restore = async () => {
      const params = invitationParameters()
      if (params.hasError || params.type !== 'invite') {
        clearInviteUrl()
        setPhase('invalid')
        return
      }
      const auth = suppliedAuth ?? createInviteAuth()
      if (!auth) {
        clearInviteUrl()
        setPhase('invalid')
        return
      }
      authRef.current = auth
      try {
        if (params.tokenHash) {
          // The hash is an OTP secret: remove it before making any network request.
          clearInviteUrl()
          const verified = await auth.verifyOtp({ token_hash: params.tokenHash, type: 'invite' })
          if (verified.error || !verified.data.session) throw new Error('Invalid invitation')
        }
        // With a normal invite link the SDK consumes the implicit callback here.
        // Its getSession result is followed by a server-verified getUser call.
        const session = await auth.getSession()
        clearInviteUrl()
        if (session.error || !session.data.session) throw new Error('Invalid invitation')
        const verifiedUser = await auth.getUser()
        if (verifiedUser.error || !verifiedUser.data.user || verifiedUser.data.user.id !== session.data.session.user.id) {
          throw new Error('Invalid invitation')
        }
        userIdRef.current = verifiedUser.data.user.id
        setEmail(verifiedUser.data.user.email ?? '')
        setPhase('ready')
      } catch {
        clearInviteUrl()
        setPhase('invalid')
      }
    }
    void restore()
  }, [suppliedAuth])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (phase !== 'ready' || !authRef.current || !userIdRef.current) return
    setFormError('')
    if (!password) { setFormError('Enter a password.'); return }
    if (password.length < 8 || password.length > 128) { setFormError('Use a password between 8 and 128 characters.'); return }
    if (password !== confirmation) { setFormError('Passwords do not match.'); return }
    setPhase('submitting')
    const auth = authRef.current
    try {
      const verified = await auth.getUser()
      if (verified.error || verified.data.user?.id !== userIdRef.current) {
        setPhase('invalid')
        return
      }
      const updated = await auth.updateUser({ password })
      if (updated.error || !updated.data.user || updated.data.user.id !== userIdRef.current) {
        setFormError('Could not set your password. Please try again.')
        setPhase('ready')
        return
      }
      setPassword('')
      setConfirmation('')
      setPhase('success')
      try {
        const result = await auth.signOut({ scope: 'local' })
        if (result.error) setSignedOut(false)
      } catch { setSignedOut(false) }
    } catch {
      setFormError('Could not set your password. Please try again.')
      setPhase('ready')
    }
  }

  return <main className="invite-page"><section className="invite-card" aria-live="polite">
    <div className="invite-header"><div className="invite-brand"><span><Leaf size={23}/></span><strong>AaharaConnect</strong></div><div className="language-switch" role="group" aria-label="Language"><button type="button" aria-pressed={language === 'en'} onClick={() => changeLanguage('en')}>English</button><span aria-hidden="true">|</span><button type="button" aria-pressed={language === 'kn'} onClick={() => changeLanguage('kn')}>ಕನ್ನಡ</button></div></div>
    {phase === 'loading' && <div role="status"><div className="invite-icon"><LockKeyhole size={25}/></div><h1>Validating your invitation…</h1><p>Please wait while we verify your secure link.</p></div>}
    {phase === 'invalid' && <div role="alert"><div className="invite-icon"><LockKeyhole size={25}/></div><h1>{INVALID_MESSAGE}</h1><p>Ask an administrator for a new invitation.</p></div>}
    {(phase === 'ready' || phase === 'submitting') && <>
      <div className="invite-icon"><LockKeyhole size={25}/></div><h1>Set your password</h1>
      <p>Finish setting up your AaharaConnect account. You will use this password in the AaharaConnect mobile app (Login as Volunteer / Driver).</p>
      {email && <p className="invite-email">Invitation for <strong>{email}</strong></p>}
      <form className="invite-form" onSubmit={event => { void submit(event) }} noValidate>
        <label htmlFor="invite-password">New password</label>
        <input id="invite-password" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} disabled={phase === 'submitting'} maxLength={128}/>
        <span className="invite-hint">8–128 characters</span>
        <label htmlFor="invite-confirmation">Confirm password</label>
        <input id="invite-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={phase === 'submitting'} maxLength={128}/>
        {formError && <p className="invite-error" role="alert">{formError}</p>}
        <button className="invite-submit" type="submit" disabled={phase === 'submitting'}>{phase === 'submitting' ? 'Setting password…' : 'Set password'}</button>
      </form>
    </>}
    {phase === 'success' && <div role="status"><div className="invite-icon success"><CheckCircle2 size={28}/></div><h1>Your AaharaConnect account is ready.</h1><p>You can now sign in to the AaharaConnect mobile app with your email and new password.</p>{!signedOut && <p className="invite-hint">Close this page when you are finished.</p>}</div>}
  </section></main>
}
