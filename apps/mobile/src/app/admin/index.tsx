import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Button, Card, Header, Screen, T } from '../../components/common/UI';
import { C } from '../../constants/theme';
import NotificationBell from '../../components/common/NotificationBell';
import { useApp } from '../../context/AppContext';
import { getCurrentAccessToken, getCurrentAppUser } from '../../api/auth';
import { adminWebsiteUrl } from '../../api/notificationDestination';
import { enableNotifications, listNotifications, notificationPermission, type PushNotification } from '../../api/push';
export default function AdminHome(){
  const app=useApp();const [identity,setIdentity]=useState('Administrator');
  const [permission,setPermission]=useState('unknown');const [recent,setRecent]=useState<PushNotification[]>([]);
  useEffect(()=>{if(app.role==='admin')void getCurrentAccessToken().then(getCurrentAppUser).then(user=>setIdentity(user.displayName??'Administrator')).catch(()=>{});},[app.role]);
  useEffect(()=>{if(app.role==='admin'){
    void notificationPermission().then(setPermission).catch(()=>{});
    void listNotifications().then(result=>setRecent(result.items.slice(0,5))).catch(()=>{});
  }},[app.role]);
  if(app.role!=='admin'||app.mode!=='live')return <Redirect href="/admin/login" />;
  return <Screen><Header title="AahaaraConnect" subtitle="Administrator" /><T color={C.muted} translate={false}>Signed in: {identity}</T>
    <NotificationBell />
    <Card style={{marginBottom:12}}><T color={C.muted} translate={false}>Notification permission: {permission}</T>
      <Button title="Enable Notifications" variant="outline" onPress={()=>void enableNotifications().then(setPermission).catch(()=>app.notify('Notifications could not be enabled.'))} style={{marginTop:8}} />
      <Button title="Notification Settings" variant="quiet" onPress={()=>void Linking.openSettings()} /></Card>
    <Card style={{marginTop:12,marginBottom:12}}><T weight="700">Admin notifications</T><T color={C.muted}>Review requests and crew changes from this phone.</T>
      {recent.length?recent.map(item=><T key={item.id} translate={false}>{item.readAt?'':'• '}{item.title}</T>):<T color={C.muted}>No recent notifications.</T>}
      <Button title="Recent notifications" onPress={()=>router.push('/notifications')} style={{marginTop:10}} /></Card>
    <Button title="Open Admin Dashboard" onPress={()=>{const url=adminWebsiteUrl('#/workspace');if(url)void Linking.openURL(url);else app.notify('Admin website is not configured.');}} />
    <Button title="Log out" variant="quiet" onPress={()=>{app.logout();router.replace('/');}} style={{marginTop:16}} />
  </Screen>;
}
