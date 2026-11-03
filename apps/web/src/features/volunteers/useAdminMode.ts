import { useCallback, useEffect, useState } from 'react'
import { getAdminAccessToken, isLiveAuthConfigured } from '../../api/auth'

type AdminMode = 'checking' | 'live' | 'error'

export function useAdminMode() {
  const [mode, setMode] = useState<AdminMode>('checking')
  const [token, setToken] = useState<string | null>(null)
  const check = useCallback(async () => {
    if (!isLiveAuthConfigured()) { setToken(null); setMode('error'); return }
    setMode('checking')
    try {
      const next = await getAdminAccessToken()
      setToken(next)
      setMode(next ? 'live' : 'error')
    } catch {
      setToken(null)
      setMode('error')
    }
  }, [])
  useEffect(() => { void check() }, [check])
  return { mode, token, retry: check }
}
