import { ArrowRight, Menu, Users, X } from 'lucide-react'
import { useState } from 'react'
import { useRenderedLanguage, type Language } from '../lib/i18n'
import './landing.css'
import AndroidDownload from '../components/common/AndroidDownload'

const logoUrl = `${import.meta.env.BASE_URL}donor/icon-192.png`
const workspaceUrl = '#/workspace'

export default function Landing() {
  const [language, setLanguage] = useState<Language>(() => window.localStorage.getItem('aaharaconnect-language') === 'kn' ? 'kn' : 'en')
  useRenderedLanguage(language)
  const [menuOpen, setMenuOpen] = useState(false)
  const changeLanguage = (next: Language) => { setLanguage(next); window.localStorage.setItem('aaharaconnect-language', next) }
  return <div className="landing">
    <header className="landing-bar">
      <a className="landing-brand" href="#"><img src={logoUrl} alt="" width={40} height={40}/><span><strong>Akshaya Ahar</strong><small>Share surplus food, feed more people</small></span></a>
      <button className="landing-menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Main menu" aria-expanded={menuOpen}>{menuOpen ? <X size={22}/> : <Menu size={22}/>}</button>
      <nav className={`landing-menu ${menuOpen ? 'open' : ''}`} aria-label="Main menu">
        <a href="#" onClick={() => setMenuOpen(false)}>Home</a>
        <a href={workspaceUrl}>NGO admin</a>
        <div className="language-switch" role="group" aria-label="Language"><button type="button" className={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} onClick={() => changeLanguage('en')}>English</button><span aria-hidden="true">|</span><button type="button" className={language === 'kn' ? 'active' : ''} aria-pressed={language === 'kn'} onClick={() => changeLanguage('kn')}>ಕನ್ನಡ</button></div>
        <a className="landing-cta" href={workspaceUrl}>Open Admin Dashboard</a>
      </nav>
    </header>
    <main>
      <section className="landing-hero">
        <h1>Good food from your event can feed someone tonight.</h1>
        <p>Akshaya Ahar connects function halls and event hosts with volunteers who collect surplus food and deliver it to people in need.</p>
        <div className="landing-actions"><a className="landing-cta large" href={workspaceUrl}>Open Admin Dashboard <ArrowRight size={18}/></a><a className="landing-link" href="#install-app">Install the Mobile App</a></div>
      </section>
      <section className="landing-cards">
        <AndroidDownload />
        <article className="landing-card"><div className="landing-card-icon"><Users size={24}/></div><h2>NGO administration</h2><p>Manage volunteers, teams and pickup assignments for the NGO.</p><a className="landing-secondary" href={workspaceUrl}>Open admin dashboard</a></article>
      </section>
    </main>
  </div>
}
