import { useEffect, useState } from 'react'
import App from './App'
import Landing from './pages/Landing'
import AcceptInvite from './pages/AcceptInvite'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import type { InviteAuth } from './api/invite'

const WORKSPACE_HASH = '#/workspace'

export default function Root({ inviteAuth }: { inviteAuth?: InviteAuth } = {}) {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onHash = () => { setHash(window.location.hash); window.scrollTo({ top:0 }) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const isWorkspace =
    hash.startsWith(WORKSPACE_HASH) ||
    hash.includes('pickups') ||
    (typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).get('page') === 'pickups' ||
        window.location.hash.includes('page=pickups')))
  if (window.location.pathname.replace(/\/$/, '') === '/accept-invite') return <AcceptInvite auth={inviteAuth} />
  if (window.location.pathname.replace(/\/$/, '') === '/forgot-password') return <ForgotPassword />
  if (window.location.pathname.replace(/\/$/, '') === '/reset-password') return <ResetPassword />
  return isWorkspace ? <App /> : <Landing />
}

