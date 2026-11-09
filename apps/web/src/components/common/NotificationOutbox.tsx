import { useState } from 'react'
import { getAdminAccessToken } from '../../api/auth'
import { apiRequest } from '../../api/client'
type Row = { id:string;template_key:string;status:string;attempts:number;last_error:string|null }
export default function NotificationOutbox() {
  const [rows,setRows]=useState<Row[]>([]);const [error,setError]=useState('')
  const load=async()=>{try{const token=await getAdminAccessToken();if(!token)throw new Error('Sign in as Admin first.');const page=await apiRequest<{items:Row[]}>('notifications/outbox',{headers:{Authorization:`Bearer ${token}`}});setRows(page.items);setError('')}catch(cause){setError(cause instanceof Error?cause.message:'Notifications unavailable.')}}
  return <section className="panel" style={{padding:20,marginTop:20}}><h2>WhatsApp delivery status</h2><p>UNKNOWN sends need reconciliation before retrying; the provider may already have accepted them.</p><button className="button button-secondary" onClick={()=>void load()}>Load notification status</button>{error&&<p role="alert">{error}</p>}{rows.map(row=><p key={row.id}>{row.template_key} · {row.status} · Attempts {row.attempts} {row.last_error??''}</p>)}</section>
}
