import request from 'supertest';
import sharp from 'sharp';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const {query,bucket,store,verify}=vi.hoisted(()=>({query:vi.fn(),bucket:vi.fn(),store:{upload:vi.fn(),remove:vi.fn()},verify:vi.fn()}));
vi.mock('../db/pool',()=>({getPool:()=>({query}),withTransaction:async(run:(tx:unknown)=>Promise<unknown>)=>run({query})}));
vi.mock('../auth/supabase',()=>({getSupabaseAdminClient:()=>({storage:{getBucket:bucket,from:()=>store}}),verifySupabaseToken:verify}));
import {replaceOwnIdentity} from '../modules/volunteers/identity';
import {requireSharingForStart} from '../modules/tracking/service';
import {dispatchOne} from '../modules/notifications/service';
import {app} from '../app';
let objects:Map<string,Buffer>;
let committedPath:string;
let failSave=false;
beforeEach(()=>{
  vi.clearAllMocks();query.mockReset();store.remove.mockReset();store.upload.mockReset();failSave=false;committedPath='old.jpg';objects=new Map([['old.jpg',Buffer.from('old')]]);
  bucket.mockResolvedValue({data:{public:false},error:null});
  store.upload.mockImplementation(async(path:string,bytes:Buffer)=>{objects.set(path,bytes);return{error:null};});
  store.remove.mockImplementation(async(paths:string[])=>{paths.forEach(path=>objects.delete(path));return{error:null};});
  query.mockImplementation(async(sql:string,values:unknown[]=[])=>{
    if(sql.includes('SELECT a.volunteer_id'))return{rows:values[0]==='owner'?[{volunteer_id:'volunteer'}]:[]};
    if(sql.includes('RETURNING object_path'))return{rows:[{object_path:values[0]}]};
    if(sql.includes('count(*)'))return{rows:[{count:0}]};
    if(sql.startsWith('SELECT object_path'))return{rows:[{object_path:'old.jpg'}]};
    if(sql.includes('INSERT INTO app.volunteer_identity_documents')){if(failSave)throw new Error('save failed');committedPath=String(values[2]);}
    return{rows:[]};
  });
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const proof=async()=>({documentType:'PAN' as const,contentType:'image/png' as const,dataBase64:(await sharp({create:{width:8,height:8,channels:3,background:'#fff'}}).png().toBuffer()).toString('base64'),consent:true as const,maskedAadhaarConfirmed:false});
describe('final review regression guards',()=>{
  it('retains the committed replacement if superseded-object cleanup throws',async()=>{
    vi.stubEnv('VOLUNTEER_IDENTITY_REQUIRED','true');store.remove.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(replaceOwnIdentity('owner',await proof())).resolves.toEqual({status:'SUBMITTED'});
    expect(committedPath).not.toBe('old.jpg');expect(objects.has(committedPath)).toBe(true);expect(store.remove).toHaveBeenCalledExactlyOnceWith(['old.jpg']);
  });
  it('removes only the uncommitted upload when saving fails',async()=>{
    vi.stubEnv('VOLUNTEER_IDENTITY_REQUIRED','true');failSave=true;
    await expect(replaceOwnIdentity('owner',await proof())).rejects.toThrow('save failed');
    expect(committedPath).toBe('old.jpg');expect([...objects.keys()]).toEqual(['old.jpg']);
  });
  it('rejects a non-owner and an accidentally public identity bucket before uploading',async()=>{
    vi.stubEnv('VOLUNTEER_IDENTITY_REQUIRED','true');const input=await proof();
    await expect(replaceOwnIdentity('other-app-user',input)).rejects.toMatchObject({status:403});expect(store.upload).not.toHaveBeenCalled();
    bucket.mockResolvedValueOnce({data:{public:true},error:null});await expect(replaceOwnIdentity('owner',input)).rejects.toMatchObject({code:'IDENTITY_STORAGE_UNAVAILABLE'});expect(store.upload).not.toHaveBeenCalled();
  });
  it('binds the START gate to the exact assignment and permits the same 30-second clock tolerance as upload',async()=>{
    vi.stubEnv('DRIVER_TRACKING_REQUIRED','true');query.mockImplementation(async(_sql:string,values:unknown[])=>({rows:values[2]==='current-assignment'?[{id:'fresh-point'}]:[]}));
    await expect(requireSharingForStart('pickup','vehicle','current-assignment',{query} as never)).resolves.toBeUndefined();
    const sql=query.mock.calls[0][0];expect(sql).toContain('a.id = $3');expect(sql).toContain("c.granted_at - interval '30 seconds'");
    await expect(requireSharingForStart('pickup','vehicle','other-assignment',{query} as never)).rejects.toMatchObject({code:'GPS_SHARING_REQUIRED'});
  });
  it('never sends with sending disabled or required provider credentials absent',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);vi.stubEnv('NOTIFICATION_OUTBOX_ENABLED','true');vi.stubEnv('WHATSAPP_SENDING_ENABLED','false');
    expect(await dispatchOne()).toMatchObject({disabled:true});
    vi.stubEnv('WHATSAPP_SENDING_ENABLED','true');vi.stubEnv('WHATSAPP_ACCESS_TOKEN','');expect(await dispatchOne()).toMatchObject({configurationRequired:true});expect(fetch).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
  });
  it('serves the approved APK redirect without authentication and rejects URL credentials',async()=>{
    vi.stubEnv('ANDROID_RELEASE_APPROVED','true');vi.stubEnv('ANDROID_RELEASE_VERSION','1.0.1');vi.stubEnv('ANDROID_RELEASE_BUILD_ID','build');vi.stubEnv('ANDROID_RELEASE_SHA256','a'.repeat(64));vi.stubEnv('SUPABASE_URL','https://example.supabase.co');
    const url='https://example.supabase.co/storage/v1/object/public/mobile-releases/release.apk';vi.stubEnv('ANDROID_RELEASE_URL',url);
    const response=await request(app).get('/api/v1/releases/android/download');expect(response.status).toBe(302);expect(response.headers.location).toBe(url);expect(verify).not.toHaveBeenCalled();
    vi.stubEnv('ANDROID_RELEASE_URL',url.replace('https://','https://:password@'));expect((await request(app).get('/api/v1/releases/android/download')).status).toBe(503);
  });
});
