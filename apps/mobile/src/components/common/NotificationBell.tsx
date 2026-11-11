import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Button } from './UI';
import { getUnreadCount } from '../../api/push';
import { useApp } from '../../context/AppContext';
export default function NotificationBell(){
  const {mode}=useApp();const [count,setCount]=useState(0);
  useFocusEffect(useCallback(()=>{let active=true;if(mode==='live')void getUnreadCount().then(result=>{if(active)setCount(result.count);}).catch(()=>{});return()=>{active=false;};},[mode]));
  if(mode!=='live')return null;
  return <Button title={count?`Notifications (${count} unread)`:'Notifications'} variant="outline" onPress={()=>router.push('/notifications')} style={{marginBottom:12}} />;
}
