import type { PushNotification } from './push';
export type NotificationRole='admin'|'donor'|'volunteer'|'driver';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function notificationDestination(item:PushNotification,role:NotificationRole):string|null {
  if(!uuid.test(item.entityId))return null;
  if(role==='admin'){
    if(item.kind==='VOLUNTEER_APPLICATION')return `#/workspace/volunteers?volunteerId=${item.entityId}`;
    if(item.kind==='FOOD_REQUEST')return `#/workspace/food?requestId=${item.entityId}`;
    if(item.kind==='CREW_DECLINED')return `#/workspace/pickups?assignmentId=${item.entityId}`;
    return null;
  }
  if(role==='donor' && ['PICKUP_SCHEDULED','PICKUP_CANCELLED','PICKUP_RESCHEDULED','PICKUP_STATUS'].includes(item.kind))
    return `/donor/request/${item.entityId}`;
  if(role==='volunteer' && ['VOLUNTEER_ASSIGNED','ASSIGNMENT_CLOSED'].includes(item.kind))
    return `/volunteer/assignment/${item.entityId}`;
  if(role==='driver' && ['DRIVER_ASSIGNED','ASSIGNMENT_CLOSED'].includes(item.kind))
    return `/driver/job/${item.entityId}`;
  return null;
}
export function adminWebsiteUrl(destination:string):string|null {
  if(!/^#\/workspace(?:\/(?:volunteers|food|pickups)(?:\?(?:volunteerId|requestId|assignmentId)=[0-9a-f-]{36})?)?$/.test(destination))return null;
  const raw=process.env.EXPO_PUBLIC_WEB_BASE_URL;
  if(!raw)return null;
  try{const parsed=new URL(raw);if(parsed.protocol!=='https:'||parsed.origin!==raw)return null;
    return `${raw}/${destination}`;
  }catch{return null;}
}
