import { AlertCircle, CheckCircle2, ChevronRight, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

export function initials(name: string) { return name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase() }
export function Avatar({ name, size = 'md', src }: { name: string; size?: 'sm' | 'md' | 'lg'; src?: string | null }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (src && !failed) return <span className={`avatar avatar-${size} avatar-photo`}><img src={src} alt="" onError={() => setFailed(true)} /></span>
  return <span className={`avatar avatar-${size}`} aria-hidden="true">{initials(name)}</span>
}
export function displayStatus(status: string) { return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()) }
export function StatusBadge({ status }: { status: string }) { return <span className={`status-badge status-${status.toLowerCase().replaceAll(/[_ ]/g, '-')}`}><span className="status-dot" />{displayStatus(status)}</span> }
export function formatTime(date: string) { return new Date(date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) }
export function formatDate(date: string) { return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }
export function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="dialog-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>{children}</section></div>
}
export function Drawer({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  return <div className="overlay drawer-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><aside className="drawer" role="dialog" aria-modal="true" aria-label={title}><div className="drawer-header"><span>{title}</span><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={19} /></button></div>{children}</aside></div>
}
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-icon"><AlertCircle size={23}/></div><h3>{title}</h3><p>{description}</p>{action}</div> }
export function Toast({ message, kind, onClose }: { message: string; kind: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onClose, 4000); return () => window.clearTimeout(timer) }, [message, onClose])
  return <div className={`toast toast-${kind}`} role="status">{kind === 'success' ? <CheckCircle2 size={20}/> : <AlertCircle size={20}/>}<span>{message}</span><button onClick={onClose} aria-label="Dismiss notification"><X size={16}/></button></div>
}
export function SectionHeading({ title, aside, onClick }: { title: string; aside?: string; onClick?: () => void }) { return <div className="section-heading"><h2>{title}</h2>{aside && <button className="text-link" onClick={onClick}>{aside}<ChevronRight size={16}/></button>}</div> }
