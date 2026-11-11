import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { syncGrantedNotifications } from '../../api/push';

const PENDING_NOTIFICATION='aaharaconnect-pending-notification-v1';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
export default function PushLifecycle(){
  const {role,mode}=useApp();
  const handled=useRef<string|null>(null);
  useEffect(()=>{
    if(Platform.OS==='web')return;
    let active=true;
    const onResponse=async(response:Notifications.NotificationResponse)=>{
      const id=response.notification.request.content.data?.notificationId;
      if(typeof id!=='string'||!uuid.test(id))return;
      if(handled.current===id)return;
      handled.current=id;
      if(active && role && mode==='live'){
        await AsyncStorage.removeItem(PENDING_NOTIFICATION);
        router.push({pathname:'/notifications',params:{selected:id}});
      }else await AsyncStorage.setItem(PENDING_NOTIFICATION,id);
    };
    const listener=Notifications.addNotificationResponseReceivedListener(response=>{void onResponse(response);});
    void Notifications.getLastNotificationResponseAsync().then(response=>{if(response)void onResponse(response);});
    return ()=>{active=false;listener.remove();};
  },[role,mode]);
  useEffect(()=>{
    if(!role||mode!=='live')return;
    void syncGrantedNotifications().catch(()=>{});
    const listener=AppState.addEventListener('change',state=>{if(state==='active')void syncGrantedNotifications().catch(()=>{});});
    void AsyncStorage.getItem(PENDING_NOTIFICATION).then(id=>{
      if(id&&uuid.test(id)){
        void AsyncStorage.removeItem(PENDING_NOTIFICATION);
        router.push({pathname:'/notifications',params:{selected:id}});
      }
    });
    return ()=>listener.remove();
  },[role,mode]);
  return null;
}
