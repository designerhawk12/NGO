import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminWebsiteUrl, notificationDestination } from './notificationDestination';
import type { PushNotification } from './push';
const id='123e4567-e89b-42d3-a456-426614174000';
const item=(kind:string):PushNotification=>({id,kind,entityId:id,title:'Safe title',body:'Safe body',readAt:null,createdAt:'2026-11-11T00:00:00Z'});
afterEach(()=>vi.unstubAllEnvs());
describe('authorized notification destinations',()=>{
  it('maps each role to its existing screen or Admin website section',()=>{
    expect(notificationDestination(item('FOOD_REQUEST'),'admin')).toBe(`#/workspace/food?requestId=${id}`);
    expect(notificationDestination(item('VOLUNTEER_APPLICATION'),'admin')).toBe(`#/workspace/volunteers?volunteerId=${id}`);
    expect(notificationDestination(item('CREW_DECLINED'),'admin')).toBe(`#/workspace/pickups?assignmentId=${id}`);
    expect(notificationDestination(item('PICKUP_SCHEDULED'),'donor')).toBe(`/donor/request/${id}`);
    expect(notificationDestination(item('VOLUNTEER_ASSIGNED'),'volunteer')).toBe(`/volunteer/assignment/${id}`);
    expect(notificationDestination(item('DRIVER_ASSIGNED'),'driver')).toBe(`/driver/job/${id}`);
  });
  it('rejects cross-role or malformed destinations',()=>{
    expect(notificationDestination(item('VOLUNTEER_APPLICATION'),'donor')).toBeNull();
    expect(notificationDestination({...item('DRIVER_ASSIGNED'),entityId:'../../settings'},'driver')).toBeNull();
    vi.stubEnv('EXPO_PUBLIC_WEB_BASE_URL','https://ngo-eight-umber.vercel.app');
    expect(adminWebsiteUrl(`#/workspace/food?requestId=${id}`)).toBe(`https://ngo-eight-umber.vercel.app/#/workspace/food?requestId=${id}`);
    expect(adminWebsiteUrl('#/workspace/food?requestId=javascript:bad')).toBeNull();
  });
});
