import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getCurrentAccessToken, setSignOutCleanup } from './auth';
import { apiRequest } from './client';

export type PushNotification = {id:string;kind:string;entityId:string;title:string;body:string;readAt:string|null;createdAt:string};
const DEVICE_KEY='aaharaconnect-push-device-id-v1';
const CHANNEL_ID='operations-v2';
let registrationError: string | null = null;
export function pushRegistrationError(){return registrationError;}
async function headers(){return {Authorization:`Bearer ${await getCurrentAccessToken()}`};}
async function deviceId(){let id=await AsyncStorage.getItem(DEVICE_KEY);if(!id){id=Crypto.randomUUID();await AsyncStorage.setItem(DEVICE_KEY,id);}return id;}
export async function notificationPermission(){return (await Notifications.getPermissionsAsync()).status;}
export async function enableNotifications(){
  if(Platform.OS==='web')throw new Error('Push notifications require the Android app.');
  registrationError=null;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID,{name:'Pickup and request alerts',importance:Notifications.AndroidImportance.HIGH,sound:'default',enableVibrate:true,vibrationPattern:[0,250,200,250]});
  const existing=await Notifications.getPermissionsAsync();
  const permission=existing.granted?existing:await Notifications.requestPermissionsAsync();
  if(!permission.granted)throw new Error('Notification permission was not granted. Open device Settings to change it.');
  const projectId=Constants.expoConfig?.extra?.eas?.projectId??Constants.easConfig?.projectId;
  if(!projectId)throw new Error('Expo project ID is unavailable.');
  let token:string;
  try { token=(await Notifications.getExpoPushTokenAsync({projectId})).data; }
  catch { registrationError='Android push is unavailable. Install the latest app and retry in Notification settings.'; throw new Error(registrationError); }
  try { await apiRequest('push/devices',{method:'PUT',headers:await headers(),body:{deviceId:await deviceId(),token,platform:Platform.OS}}); }
  catch { registrationError='Could not register this device for alerts. Check your connection and retry.'; throw new Error(registrationError); }
  return permission.status;
}
export async function syncGrantedNotifications(){
  if(Platform.OS==='web')return;
  if((await Notifications.getPermissionsAsync()).granted)await enableNotifications();
}
export async function unregisterNotifications(){
  const id=await AsyncStorage.getItem(DEVICE_KEY);
  if(id)await apiRequest(`push/devices/${id}`,{method:'DELETE',headers:await headers()});
}
setSignOutCleanup(unregisterNotifications);
export async function listNotifications(){return apiRequest<{items:PushNotification[]}>('push/inbox',{headers:await headers()});}
export async function getUnreadCount(){return apiRequest<{count:number}>('push/unread-count',{headers:await headers()});}
export async function markNotificationRead(id:string){return apiRequest<{updated:boolean}>(`push/inbox/${encodeURIComponent(id)}/read`,{method:'POST',headers:await headers()});}
