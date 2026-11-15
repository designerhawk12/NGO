import { useEffect, useMemo, useState } from 'react'
import type { ProfilePhotoUrls } from '@aaharaconnect/shared'
import { apiRequest } from '../../api/client'
import { getAuthHeaders, isLiveAdmin } from '../pickups/adapters'

export type PhotoKind = 'DONOR' | 'VOLUNTEER' | 'DRIVER'

/**
 * Loads short-lived signed photo URLs for donor / volunteer / driver record ids. Any failure
 * (no photo, storage error, mock mode) simply yields no URL, so the initials avatar is shown.
 */
export function useProfilePhotos(kind: PhotoKind, ids: string[]): ProfilePhotoUrls {
  const [urls, setUrls] = useState<ProfilePhotoUrls>({})
  const key = useMemo(() => [...new Set(ids.filter(id => /^[0-9a-f-]{36}$/i.test(id)))].sort().slice(0, 200).join(','), [ids])
  useEffect(() => {
    if (!key || !isLiveAdmin()) { setUrls({}); return }
    let active = true
    void (async () => {
      try {
        const result = await apiRequest<ProfilePhotoUrls>('profile-photos/lookup', {
          method: 'POST', headers: await getAuthHeaders(), body: { kind, ids: key.split(',') },
        })
        if (active) setUrls(result)
      } catch { if (active) setUrls({}) }
    })()
    return () => { active = false }
  }, [kind, key])
  return urls
}
