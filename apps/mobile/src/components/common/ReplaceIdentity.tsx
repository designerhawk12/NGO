import React, { useState } from 'react';
import { identityProofSchema } from '@aaharaconnect/shared';
import IdentityProofPicker, { type IdentityProofDraft } from './IdentityProofPicker';
import { apiRequest } from '../../api/client';
import { getCurrentAccessToken } from '../../api/auth';
import { Button, T } from './UI';
export default function ReplaceIdentity() {
  const [proof,setProof]=useState<IdentityProofDraft|null>(null);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const save=async()=>{const parsed=identityProofSchema.safeParse(proof);if(!parsed.success){setMessage('Choose proof and acknowledge consent. Mask Aadhaar before uploading.');return;}setBusy(true);try{await apiRequest('volunteers/me/identity',{method:'PUT',headers:{Authorization:`Bearer ${await getCurrentAccessToken()}`},body:parsed.data});setProof(null);setMessage('Replacement proof submitted for manual review.');}catch(cause){setMessage(cause instanceof Error?cause.message:'Upload failed. Retry when connected.');}finally{setBusy(false);}};
  return <><IdentityProofPicker value={proof} onChange={setProof}/><Button title="Submit replacement identity proof" onPress={()=>void save()} disabled={busy} loading={busy}/>{!!message&&<T>{message}</T>}</>;
}
