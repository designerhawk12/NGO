import { useEffect, useState } from 'react'
import { apiRequest } from '../../api/client'
type Release = { available: boolean }
export default function AndroidDownload() {
  const [release, setRelease] = useState<Release>({ available: false })
  useEffect(() => { let active = true; void apiRequest<Release>('releases/android').then(result => { if (active) setRelease(result) }).catch(() => undefined); return () => { active = false } }, [])
  return <section className="landing-card" id="install-app">
    <h2>Install the Mobile App</h2>
    <p>The AaharaConnect mobile app supports Donors, Volunteers and NGO Drivers.</p>
    {release.available ? <>
      <a className="landing-cta large" href="https://github.com/designerhawk12/NGO/releases/download/v1.0.0-15/AahaaraConnect-Production.apk">Download Android App</a>
      <p>Download the APK, open it and allow installation from this browser when Android asks. Choose Update if AaharaConnect is already installed.</p>
    </> : <><button className="landing-secondary" disabled>Download Android App</button><p>Awaiting the verified Android release.</p></>}
  </section>
}
