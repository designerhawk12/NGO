import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
const {verify,findUser,query,profile}=vi.hoisted(()=>({verify:vi.fn(),findUser:vi.fn(),query:vi.fn(),profile:vi.fn()}));
vi.mock('../auth/supabase',()=>({verifySupabaseToken:verify}));
vi.mock('../auth/appUsers',()=>({findOrCreateAppUser:findUser}));
vi.mock('../db/pool',()=>({getPool:()=>({query}),withTransaction:async(run:(tx:unknown)=>Promise<unknown>)=>run({query})}));
vi.mock('../modules/vehicles/service',()=>({getOwnDriverProfile:profile}));
import {app} from '../app';
import {validateReadingTime} from '../modules/tracking/service';
const pickupId='76b128ea-58d8-4d81-a031-74018056dcf5';
const vehicleId='3c597e69-6be5-4d29-97fc-a946fa8a5300';
let sessionStartedAt = new Date(Date.now()-60000).toISOString();
const driver={id:'b0000000-0000-4000-8000-000000000002',authUserId:'a0000000-0000-4000-8000-000000000002',role:'DRIVER',displayName:'Driver'};
const reading=()=>({pickupId,latitude:12.97,longitude:77.59,recordedAt:new Date().toISOString(),accuracyMeters:12,sessionStartedAt});
const post=()=>request(app).post(`/api/v1/vehicles/${vehicleId}/locations`).set('Authorization','Bearer signed-token');
beforeEach(()=>{
  sessionStartedAt = new Date(Date.now()-60000).toISOString();
  vi.clearAllMocks();query.mockReset();verify.mockResolvedValue({authUserId:driver.authUserId,email:'driver@example.test'});findUser.mockResolvedValue(driver);
  profile.mockResolvedValue({driverId:'fixed-driver',status:'ACTIVE',vehicle:{id:vehicleId,registrationNumber:'KA01AB1234'}});
});
describe('employee Driver location authorization and terminal duties',()=>{
  it('rejects new consent once the assignment or pickup is terminal',async()=>{
    query.mockResolvedValueOnce({rows:[],rowCount:0});
    const response=await request(app).post(`/api/v1/pickups/${pickupId}/tracking-consent`).set('Authorization','Bearer signed-token').send({pickupId,consent:true});
    expect(response.status).toBe(403);expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("a.status NOT IN ('REJECTED', 'CANCELLED', 'FAILED', 'DELIVERED')");
    expect(query.mock.calls[0][0]).toContain("p.status NOT IN ('CANCELLED', 'FAILED', 'DELIVERED')");
    expect(query.mock.calls[0][1]).toEqual([pickupId,'fixed-driver',vehicleId]);
  });
  it('rejects a point after delivery without reading consent or inserting a point',async()=>{
    query.mockResolvedValueOnce({rows:[],rowCount:0});
    expect((await post().send(reading())).status).toBe(403);expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE OF a');
  });
  it.each(['VOLUNTEER','DONOR'])('rejects %s before looking up duty or storing location',async role=>{
    findUser.mockResolvedValue({...driver,role});expect((await post().send(reading())).status).toBe(403);expect(profile).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated uploads and fleet reads',async()=>{
    expect((await request(app).post(`/api/v1/vehicles/${vehicleId}/locations`).send(reading())).status).toBe(401);
    expect((await request(app).get('/api/v1/vehicles/tracking')).status).toBe(401);
  });
  it('rejects another fixed vehicle and inactive drivers',async()=>{
    profile.mockResolvedValueOnce({driverId:'other',status:'ACTIVE',vehicle:{id:'other-vehicle'}});
    expect((await post().send(reading())).status).toBe(403);
    profile.mockResolvedValueOnce({driverId:'fixed-driver',status:'INACTIVE',vehicle:{id:vehicleId}});
    expect((await post().send(reading())).status).toBe(403);expect(query).not.toHaveBeenCalled();
  });
  it('requires live consent for the current assignment',async()=>{
    query.mockResolvedValueOnce({rows:[{id:'assignment',created_at:new Date(Date.now()-3600000)}]}).mockResolvedValueOnce({rows:[]});
    const response=await post().send(reading());expect(response.status).toBe(403);expect(response.body.error.code).toBe('TRACKING_CONSENT_REQUIRED');
    expect(query.mock.calls[1][0]).toContain('withdrawn_at IS NULL');expect(query.mock.calls[1][0]).toContain("interval '12 hours'");
  });
  it('accepts an assigned employee Driver point and bounds retained data',async()=>{
    query.mockResolvedValue({rows:[]}).mockResolvedValueOnce({rows:[{id:'assignment',created_at:new Date(Date.now()-3600000)}]}).mockResolvedValueOnce({rows:[{id:'consent',granted_at:new Date(sessionStartedAt)}]});
    const response=await post().send(reading());expect(response.status).toBe(200);expect(response.body.data.accepted).toBe(true);
    expect(query.mock.calls[3][0]).toContain('INSERT INTO app.vehicle_locations');expect(query.mock.calls[4][0]).toContain('DELETE FROM app.vehicle_locations');
  });
  it('rejects old, future, malformed and out-of-order readings',async()=>{
    for(const time of [new Date(Date.now()-180000).toISOString(),new Date(Date.now()+60000).toISOString(),'bad'])expect(()=>validateReadingTime(time)).toThrow();
    const point=reading();query.mockResolvedValueOnce({rows:[{id:'assignment',created_at:new Date(Date.now()-3600000)}]}).mockResolvedValueOnce({rows:[{id:'consent',granted_at:new Date(sessionStartedAt)}]}).mockResolvedValueOnce({rows:[{recorded_at:new Date(point.recordedAt)}]});
    const response=await post().send(point);expect(response.status).toBe(409);expect(response.body.error.code).toBe('STALE_LOCATION');expect(query).toHaveBeenCalledTimes(3);
  });
  it('validates coordinates and accuracy before database access',async()=>{
    expect((await post().send({...reading(),latitude:91})).status).toBe(400);
    expect((await post().send({...reading(),accuracyMeters:201})).status).toBe(400);expect(query).not.toHaveBeenCalled();
  });
  it('keeps fleet data Admin-only',async()=>{
    expect((await request(app).get('/api/v1/vehicles/tracking').set('Authorization','Bearer token')).status).toBe(403);
    findUser.mockResolvedValue({...driver,role:'ADMIN'});query.mockResolvedValueOnce({rows:[{id:vehicleId}]});
    const response=await request(app).get('/api/v1/vehicles/tracking').set('Authorization','Bearer token');expect(response.status).toBe(200);expect(response.body.data.items).toEqual([{id:vehicleId}]);expect(response.headers['cache-control']).toBe('no-store');
  });
});
