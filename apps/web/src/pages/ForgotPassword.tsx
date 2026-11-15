import { useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, Leaf, LockKeyhole } from 'lucide-react'
import { createRecoveryAuth, requestPasswordRecovery, type RecoveryAuth } from '../api/recovery'
import { useRenderedLanguage, type Language } from '../lib/i18n'
import './accept-invite.css'

export default function ForgotPassword({ auth: suppliedAuth }: { auth?: RecoveryAuth } = {}) {
  const [language, setLanguage] = useState<Language>(() => window.localStorage.getItem('aaharaconnect-language') === 'kn' ? 'kn' : 'en')
  useRenderedLanguage(language)
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<'form' | 'submitting' | 'accepted'>('form')
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const changeLanguage = (next: Language) => { setLanguage(next); window.localStorage.setItem('aaharaconnect-language', next) }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setPhase('submitting'); setError('')
    const auth = suppliedAuth ?? createRecoveryAuth()
    const result = auth ? await requestPasswordRecovery(auth, email, window.location.origin) : 'unavailable'
    submitting.current = false
    if (result === 'accepted') { setEmail(''); setPhase('accepted') }
    else {
      setPhase('form')
      setError(result === 'invalid-email' ? 'Enter a valid email address.' : 'Could not request password recovery. Please try again later.')
    }
  }

  return <main className="invite-page"><section className="invite-card" aria-live="polite">
    <div className="invite-header"><div className="invite-brand"><span><Leaf size={23}/></span><strong>AaharaConnect</strong></div><div className="language-switch" role="group" aria-label="Language"><button type="button" aria-pressed={language === 'en'} onClick={() => changeLanguage('en')}>English</button><span aria-hidden="true">|</span><button type="button" aria-pressed={language === 'kn'} onClick={() => changeLanguage('kn')}>ಕನ್ನಡ</button></div></div>
    {phase === 'accepted' ? <div role="status"><div className="invite-icon success"><CheckCircle2 size={28}/></div><h1>Check your email</h1><p>If an account uses that address and email delivery is available, follow the password recovery instructions sent there.</p><a href="/">Back to AaharaConnect</a></div> : <>
      <div className="invite-icon"><LockKeyhole size={25}/></div><h1>Forgot password?</h1><p>Enter the email address for your Volunteer account to request a recovery link.</p>
      <form className="invite-form" onSubmit={event => { void submit(event) }} noValidate>
        <label htmlFor="recovery-email">Email address</label>
        <input id="recovery-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} disabled={phase === 'submitting'} maxLength={254} required/>
        {error && <p className="invite-error" role="alert">{error}</p>}
        <button className="invite-submit" type="submit" disabled={phase === 'submitting'}>{phase === 'submitting' ? 'Requesting link…' : 'Send recovery link'}</button>
      </form><a href="/">Back to AaharaConnect</a>
    </>}
  </section></main>
}
