import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
type Props = { value?: string | null; onChange: (photo: string | null) => void; onBusyChange: (busy: boolean) => void; disabled?: boolean; notify: (message: string, kind?: 'success' | 'error') => void }
export default function InventoryPhoto({value, onChange, onBusyChange, disabled, notify}: Props) {
  const photoInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const choosePhoto = async (file?: File) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      notify('Choose a JPG, PNG or WebP photo.', 'error')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      notify('Choose a photo smaller than 10 MB.', 'error')
      return
    }
    setBusy(true); onBusyChange(true)
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      const scale = Math.min(1, 1200 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Photo could not be processed.')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      let result = canvas.toDataURL('image/jpeg', 0.82)
      if (result.length > 700000) result = canvas.toDataURL('image/jpeg', 0.5)
      if (result.length > 700000) throw new Error('Photo is too large. Choose a smaller photo.')
      onChange(result)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to read this photo.', 'error')
    } finally {
      URL.revokeObjectURL(url)
      setBusy(false); onBusyChange(false)
      if (photoInput.current) photoInput.current.value = ''
    }
  }

  return <section className="rounded-2xl border border-emerald-200 bg-emerald-50/25 p-4 space-y-3">
    <h3 className="font-bold text-slate-900 text-xs">Vessel Photo <span className="font-normal text-slate-500">(Optional)</span></h3>
    <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
      {value ? <img src={value} alt="Vessel photo preview" className="h-32 w-44 rounded-xl border border-slate-200 object-contain bg-white" /> : <div className="h-24 w-32 rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50 flex items-center justify-center text-emerald-600"><Camera size={30} /></div>}
      <div className="space-y-2">
        <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose vessel photo" className="sr-only" disabled={busy || disabled} onChange={e=>void choosePhoto(e.target.files?.[0])} />
        <div className="flex gap-2">
          <button type="button" className="button button-primary" disabled={busy || disabled} onClick={()=>photoInput.current?.click()}>{busy ? 'Preparing photo…' : value ? 'Change Photo' : 'Add Photo'}</button>
          {value && <button type="button" className="button" disabled={busy || disabled} onClick={()=>onChange(null)}>Remove Photo</button>}
        </div>
        <p className="text-xs text-slate-500">JPG, PNG or WebP, up to 10 MB.</p>
      </div>
    </div>
  </section>
}
