import { useEffect, useState } from 'react'
import App from './App'
import Landing from './pages/Landing'

const WORKSPACE_HASH = '#/workspace'

export default function Root() {
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
  return isWorkspace ? <App /> : <Landing />
}

