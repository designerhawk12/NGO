import { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Button, Card, Header, Screen, T } from '../components/common/UI';
import { C } from '../constants/theme';
import { useApp } from '../context/AppContext';
import { enableNotifications, listNotifications, markNotificationRead, notificationPermission, type PushNotification } from '../api/push';
import { adminWebsiteUrl, notificationDestination } from '../api/notificationDestination';
import { ApiClientError } from '../api/client';

export default function NotificationInbox(){
  const app=useApp();const {role,mode}=app;const {selected}=useLocalSearchParams<{selected?:string}>();
  const [items,setItems]=useState<PushNotification[]>([]);const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');const [permission,setPermission]=useState('unknown');
  const [opened,setOpened]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    if(!role||mode!=='live')return;
    setLoading(true);setError('');
    try{const [result,status]=await Promise.all([listNotifications(),notificationPermission()]);setItems(result.items);setPermission(status);}
    catch(cause){if(cause instanceof ApiClientError && cause.status===401){app.logout();router.replace('/');return;}
      setError('Could not load notifications. Check your connection and retry.');}
    finally{setLoading(false);}
  },[role,mode]);
  useFocusEffect(useCallback(()=>{void refresh();},[refresh]));
  const chosen=items.find(item=>item.id===(opened??selected));
  const open=async(item:PushNotification)=>{
    await markNotificationRead(item.id);setOpened(item.id);setItems(current=>current.map(row=>row.id===item.id?{...row,readAt:new Date().toISOString()}:row));
  };
  const destination=chosen&&role?notificationDestination(chosen,role):null;
  const visit=async()=>{
    if(!destination||!role)return;
    if(role==='admin'){
      const url=adminWebsiteUrl(destination);if(!url){setError('Admin website is not configured.');return;}
      try{await Linking.openURL(url);}catch{setError('Could not open the Admin website.');}
    }else router.push(destination as Href);
  };
  return <Screen><Header title="Notifications" subtitle="Requests and assignments" back />
    {!role||mode!=='live'?<Card><T>Sign in to view your notifications.</T><Button title="Go to sign in" onPress={()=>router.replace('/')} /></Card>:<>
      <Card style={{marginBottom:12}}><T color={C.muted} translate={false}>Permission: {permission}</T>
        <Button title={permission==='granted'?'Refresh notification token':'Enable notifications'} variant="outline" onPress={()=>void enableNotifications().then(setPermission).catch(cause=>setError(cause instanceof Error?cause.message:'Notifications could not be enabled.'))} style={{marginTop:8}} />
        <Button title="Notification settings" variant="quiet" onPress={()=>void Linking.openSettings()} /></Card>
      <Button title="Refresh" variant="outline" onPress={()=>void refresh()} style={{marginBottom:12}} />
      {error?<T color={C.red}>{error}</T>:null}{loading?<T>Loading notifications...</T>:items.length===0?<T color={C.muted}>No notifications yet.</T>:null}
      {chosen?<Card style={{marginBottom:12,borderColor:C.green}}><T weight="700" translate={false}>{chosen.title}</T><T translate={false}>{chosen.body}</T><T color={C.muted} translate={false}>Reference: {chosen.entityId}</T>
        {destination?<Button title={role==='admin'?'Open Admin Dashboard':'Open linked request or assignment'} onPress={()=>void visit()} style={{marginTop:8}} />:<T color={C.muted}>This update has no available destination.</T>}
      </Card>:null}
      {items.map(item=><Card key={item.id} style={{marginBottom:8,opacity:item.readAt?0.8:1}}><View><T weight={item.readAt?'400':'700'} translate={false}>{item.title}{item.readAt?'':' •'}</T><T translate={false}>{item.body}</T><T color={C.muted} translate={false}>{new Date(item.createdAt).toLocaleString('en-IN')}</T></View>
        <Button title="View details" variant="quiet" onPress={()=>void open(item)} style={{marginTop:8}} /></Card>)}
    </>}
  </Screen>;
}
