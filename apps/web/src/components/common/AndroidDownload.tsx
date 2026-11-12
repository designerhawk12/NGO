import { useEffect, useState } from 'react'
import { apiRequest } from '../../api/client'
type Release = { available: boolean; version?: string; buildId?: string; sha256?: string }
export default function AndroidDownload() {
  const [release, setRelease] = useState<Release>({ available: false })
  useEffect(() => { let active = true; void apiRequest<Release>('releases/android').then(result => { if (active) setRelease(result) }).catch(() => undefined); return () => { active = false } }, [])
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '')
  return <section className="landing-card" id="install-app">
    <h2>Install the Mobile App</h2>
    <p>The AaharaConnect mobile app supports Donors, Volunteers and NGO Drivers.</p>
    {release.available ? <>
      <a className="landing-cta large" href={`${base}/releases/android/download`}>Download Android App</a>
      <p>Version {release.version} · Build {release.buildId}</p>
      <p style={{ overflowWrap: 'anywhere' }}>SHA-256: {release.sha256}</p>
      <p>Download the APK, open it and allow installation from this browser when Android asks. Choose Update if AaharaConnect is already installed.</p>
    </> : <><button className="landing-secondary" disabled>Download Android App</button><p>Awaiting the verified Android release.</p></>}
  </section>
}
