import AndroidDownload from '../components/common/AndroidDownload'
import './landing.css'
export default function AppLinkLanding() {
  const match = /^\/open\/(donation|volunteer|driver)\/([0-9a-f-]{36})\/?$/i.exec(window.location.pathname)
  return <main className="landing" style={{ padding: 32, maxWidth: 760, margin: '0 auto' }}>
    <h1>AaharaConnect</h1>
    {match ? <><p>Open the app and sign in with the account assigned to this record.</p><a className="landing-cta large" href={`aaharaconnect:///open/${match[1]}/${match[2]}`}>Open installed app</a></> : <p>This app link is invalid.</p>}
    <div style={{ marginTop: 24 }}><AndroidDownload /></div>
  </main>
}
