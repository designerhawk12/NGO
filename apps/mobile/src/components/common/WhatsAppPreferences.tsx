import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';
import { getCurrentAccessToken } from '../../api/auth';
import { Button, Card, Field, T } from './UI';
import { C } from '../../constants/theme';
export default function WhatsAppPreferences() {
  const [phone,setPhone]=useState(''); const [optedIn,setOptedIn]=useState(false); const [message,setMessage]=useState(''); const [available,setAvailable]=useState(false);
  useEffect(()=>{let active=true;void getCurrentAccessToken().then(token=>apiRequest<{phoneE164:string;optedIn:boolean}>('notifications/preferences',{headers:{Authorization:`Bearer ${token}`}})).then(pref=>{if(active){setPhone(pref.phoneE164);setOptedIn(pref.optedIn);setAvailable(true);}}).catch(()=>undefined);return()=>{active=false;};},[]);
  const save=async(next:boolean)=>{try{await apiRequest('notifications/preferences',{method:'PUT',headers:{Authorization:`Bearer ${await getCurrentAccessToken()}`},body:{phoneE164:phone,optedIn:next}});setOptedIn(next);setMessage(next?'WhatsApp alerts enabled.':'WhatsApp alerts disabled.');}catch{setMessage('Could not save your preference. Use +91 followed by your mobile number and retry.');}};
  return <Card style={{marginVertical:12}}><T weight="700">WhatsApp notifications</T>
    <T size={13} color={C.muted}>Optional NGO donation and assignment alerts. By enabling, you confirm this is your WhatsApp number and consent to these messages. You can disable here or reply STOP. App and email access continue without WhatsApp.</T>
    {available?<><Field label="Your WhatsApp number (E.164)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+919876543210"/><Button title={optedIn?'Disable WhatsApp alerts':'I consent — enable WhatsApp alerts'} variant="outline" onPress={()=>void save(!optedIn)}/></>:<T size={13}>WhatsApp sending is awaiting NGO setup.</T>}
    {!!message&&<T>{message}</T>}
  </Card>;
}
