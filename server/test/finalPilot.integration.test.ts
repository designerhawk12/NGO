import 'dotenv/config';
import {randomUUID,createHmac} from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
const {storage,objects,invite}=vi.hoisted(()=>({storage:{getBucket:vi.fn(),from:vi.fn()},objects:new Map<string,Buffer>(),invite:vi.fn()}));
vi.mock('../src/auth/supabase',()=>({verifySupabaseToken:async(token:string)=>({authUserId:token,email:'test@example.test'}),inviteSupabaseUserByEmail:invite,getSupabaseAdminClient:()=>({storage}),getSupabaseUserEmail:async()=> 'applicant@example.test'}));
vi.mock('../src/config/env',async original=>{const actual=await original<typeof import('../src/config/env')>();return{...actual,env:{...actual.env,supabaseSecretKey:'local-identity-rate-limit-test-only'}};});
import {app} from '../src/app';
import {closePool,getPool,withTransaction} from '../src/db/pool';
import {enqueue,dispatchOne} from '../src/modules/notifications/service';
import {maintainIdentityStorage} from '../src/modules/volunteers/identityMaintenance';

const url=process.env.TEST_DATABASE_URL;
let enabled=false;try{enabled=process.env.FINAL_PILOT_SCHEMA_TEST==='true'&&!!url&&new URL(url).hostname==='127.0.0.1'&&new URL(url).pathname.endsWith('_test')&&process.env.DATABASE_URL===url&&process.env.ALLOW_TEST_DATABASE_MUTATION==='true';}catch{/* Never mutate an unverified database. */}
const suite=enabled?describe:describe.skip;
const query=(sql:string,values:unknown[]=[])=>getPool().query(sql,values);
const adminAuth=randomUUID(),donorAuth=randomUUID(),driverAuth=randomUUID();
let adminId='',volunteerId='',volunteerAuth='',donorId='';
let registration:Record<string,unknown>;
let signedSeconds=0;
const auth=(token:string)=>({Authorization:`Bearer ${token}`});
beforeAll(async()=>{
  if(!enabled)return;
  const shape=await query("SELECT to_regclass('app.volunteer_identity_documents') AS name");
  if(!shape.rows[0].name)throw new Error('Final pilot proposal must be applied to this dedicated local test database.');
  vi.stubEnv('PUBLIC_VOLUNTEER_REGISTRATION_ENABLED','true');vi.stubEnv('VOLUNTEER_IDENTITY_REQUIRED','true');vi.stubEnv('NOTIFICATION_OUTBOX_ENABLED','true');vi.stubEnv('WHATSAPP_SENDING_ENABLED','false');
  for(const [id,role] of [[adminAuth,'ADMIN'],[donorAuth,'DONOR'],[driverAuth,'DRIVER']]){
    const row=await query('INSERT INTO app.app_users(auth_user_id,role,display_name) VALUES($1,$2,$3) RETURNING id',[id,role,`Final test ${role}`]);if(role==='ADMIN')adminId=row.rows[0].id;if(role==='DONOR')donorId=row.rows[0].id;
  }
  const bucket={upload:vi.fn(async(path:string,bytes:Buffer)=>{objects.set(path,bytes);return{error:null};}),remove:vi.fn(async(paths:string[])=>{paths.forEach(path=>objects.delete(path));return{error:null};}),createSignedUrl:vi.fn(async(path:string,seconds:number)=>{signedSeconds=seconds;return{data:{signedUrl:`https://private-storage.example.test/${path}`},error:null};})};
  storage.getBucket.mockResolvedValue({data:{public:false},error:null});storage.from.mockReturnValue(bucket);
  invite.mockImplementation(async()=>{volunteerAuth=randomUUID();return{authUserId:volunteerAuth};});
  const image=await sharp({create:{width:24,height:24,channels:3,background:'#fff'}}).png().toBuffer();
  registration={name:'Final proof applicant',email:`final-${randomUUID()}@example.test`,phoneE164:'+919'+String(Math.floor(Math.random()*1e9)).padStart(9,'0'),skills:['Packing'],submissionId:randomUUID(),identityProof:{documentType:'PAN',contentType:'image/png',dataBase64:image.toString('base64'),consent:true,maskedAadhaarConfirmed:false}};
});
afterAll(async()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();if(enabled)await closePool();});
suite('final pilot private proof and durable notification integration',()=>{
  it('protects private proof and GPS tables from direct anonymous/authenticated database roles',async()=>{
    const roles=await query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')");
    if(roles.rows.length!==2)throw new Error('Create local NOLOGIN anon/authenticated roles before applying the proposed schema for this privacy test.');
    for(const table of ['volunteer_identity_documents','identity_review_events','identity_registration_attempts','identity_storage_objects','vehicle_locations','vehicle_tracking_consents']){
      const policy=await query('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',[`app.${table}`]);expect(policy.rows[0].relrowsecurity).toBe(true);
      for(const role of ['anon','authenticated'])expect((await query("SELECT has_table_privilege($1,$2,'SELECT') AS allowed",[role,`app.${table}`])).rows[0].allowed).toBe(false);
    }
  });
  it('stores proof and application atomically and replays the same submission without another invitation',async()=>{
    const response=await request(app).post('/api/v1/volunteers/register').send(registration);expect(response.status).toBe(201);
    const row=await query("SELECT d.volunteer_id,d.status,a.identity_required FROM app.volunteer_identity_documents d JOIN app.volunteer_applications a ON a.volunteer_id=d.volunteer_id WHERE object_path=$1",[`registration/${registration.submissionId}.jpg`]);
    volunteerId=row.rows[0].volunteer_id;expect(row.rows[0]).toMatchObject({status:'SUBMITTED',identity_required:true});expect(objects.size).toBe(1);
    expect((await request(app).post('/api/v1/volunteers/register').send(registration)).status).toBe(201);expect(invite).toHaveBeenCalledTimes(1);
    const outbox=await query("SELECT parameters FROM app.notification_outbox WHERE event_key=$1",[`volunteer_application:${volunteerId}:admin`]);expect(outbox.rows).toHaveLength(1);expect(JSON.stringify(outbox.rows)).not.toContain('private-storage');
  });
  it('rejects missing proof and forged consent without creating records',async()=>{
    expect((await request(app).post('/api/v1/volunteers/register').send({...registration,submissionId:randomUUID(),identityProof:undefined})).body.error.code).toBe('IDENTITY_REQUIRED');
    expect((await request(app).post('/api/v1/volunteers/register').send({...registration,identityProof:{...(registration.identityProof as object),consent:false}})).status).toBe(400);
    expect(invite).toHaveBeenCalledTimes(1);
  });
  it('keeps preview Admin-only and blocks both API and SQL approval before verification',async()=>{
    const path=`/api/v1/volunteers/${volunteerId}/identity`;
    for(const token of [donorAuth,driverAuth,volunteerAuth])expect((await request(app).get(path).set(auth(token))).status).toBe(403);
    expect((await request(app).get(path)).status).toBe(401);
    const preview=await request(app).get(path).set(auth(adminAuth));expect(preview.status).toBe(200);expect(preview.headers['cache-control']).toBe('no-store');expect(signedSeconds).toBe(120);
    expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}/approval`).set(auth(adminAuth)).send({status:'APPROVED'})).body.error.code).toBe('IDENTITY_VERIFICATION_REQUIRED');
    await expect(query("UPDATE app.volunteer_applications SET status='APPROVED' WHERE volunteer_id=$1",[volunteerId])).rejects.toMatchObject({code:'23514'});
  });
  it('permits an authenticated pending applicant to replace rejected proof, then verifies and approves',async()=>{
    expect((await request(app).get('/api/v1/assignments/me').set(auth(volunteerAuth))).status).toBe(403);
    expect((await request(app).post(`/api/v1/volunteers/${volunteerId}/identity/review`).set(auth(adminAuth)).send({status:'REJECTED',reason:'Image is unreadable; upload a clearer masked alternative.'})).status).toBe(200);
    expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}/approval`).set(auth(adminAuth)).send({status:'APPROVED'})).status).toBe(409);
    expect((await request(app).put('/api/v1/volunteers/me/identity').set(auth(donorAuth)).send(registration.identityProof)).status).toBe(403);
    expect((await request(app).put('/api/v1/volunteers/me/identity').set(auth(volunteerAuth)).send(registration.identityProof)).status).toBe(200);
    expect((await query('SELECT status FROM app.volunteer_identity_documents WHERE volunteer_id=$1',[volunteerId])).rows[0].status).toBe('SUBMITTED');
    expect((await request(app).post(`/api/v1/volunteers/${volunteerId}/identity/review`).set(auth(adminAuth)).send({status:'VERIFIED',reason:'Manually reviewed readable proof and applicant details.'})).status).toBe(200);
    expect((await request(app).patch(`/api/v1/volunteers/${volunteerId}/approval`).set(auth(adminAuth)).send({status:'APPROVED'})).status).toBe(200);
    expect((await query('SELECT reviewed_by FROM app.volunteer_identity_documents WHERE volunteer_id=$1',[volunteerId])).rows[0].reviewed_by).toBe(adminId);
  });
  it('cleans expired orphan objects only with explicit deletion approval; dry-run does not delete',async()=>{
    const path=`test-orphan/${randomUUID()}.jpg`;objects.set(path,Buffer.from('test'));await query("INSERT INTO app.identity_storage_objects(object_path,created_at) VALUES($1,now()-interval '2 days')",[path]);
    expect((await maintainIdentityStorage()).candidates).toBeGreaterThanOrEqual(1);expect(objects.has(path)).toBe(true);
    await expect(maintainIdentityStorage(true)).rejects.toThrow();vi.stubEnv('IDENTITY_DELETION_APPROVED','true');expect((await maintainIdentityStorage(true)).deleted).toBeGreaterThanOrEqual(1);expect(objects.has(path)).toBe(false);
  });
  it('commits one opted-in event, deduplicates API replays and rolls back events with failed operations',async()=>{
    await query("INSERT INTO app.whatsapp_preferences(app_user_id,phone_e164,opted_in,consent_version) VALUES($1,'+919876543210',true,'test')",[donorId]);
    const entity=randomUUID();await withTransaction(async tx=>{await enqueue(tx,'donation_received',entity,[donorId]);await enqueue(tx,'donation_received',entity,[donorId]);});
    expect((await query('SELECT id FROM app.notification_outbox WHERE event_key=$1',[`donation_received:${entity}:${donorId}`])).rows).toHaveLength(1);
    const rolledBack=randomUUID();await expect(withTransaction(async tx=>{await enqueue(tx,'donation_received',rolledBack,[donorId]);throw new Error('rollback');})).rejects.toThrow();
    expect((await query('SELECT id FROM app.notification_outbox WHERE event_key=$1',[`donation_received:${rolledBack}:${donorId}`])).rows).toHaveLength(0);
  });
  it('retries donor submission as one request and one notification when idempotency is enabled',async()=>{
    vi.stubEnv('FOOD_REQUEST_IDEMPOTENCY_ENABLED','true');
    const input={submissionId:randomUUID(),sourceName:'Final test event',sourceType:'Event',pickupAddress:'Synthetic staging-only address',preparedAt:new Date(Date.now()-60000).toISOString(),pickupDeadline:new Date(Date.now()+3600000).toISOString(),contactName:'Test donor',contactPhoneE164:'+919876543210',handlingRequirements:'Keep covered',donorSafetyDeclaration:true,estimatedWeightKg:10,items:[{foodType:'Rice',quantity:10,unit:'KG',handlingRequirements:'Keep covered'}]};
    const first=await request(app).post('/api/v1/food-requests').set(auth(donorAuth)).send(input);expect(first.status).toBe(201);
    const replay=await request(app).post('/api/v1/food-requests').set(auth(donorAuth)).send(input);expect(replay.status).toBe(201);expect(replay.body.data.id).toBe(first.body.data.id);
    expect((await query('SELECT id FROM app.notification_outbox WHERE event_key=$1',[`donation_received:${first.body.data.id}:${donorId}`])).rows).toHaveLength(1);
    expect((await request(app).post('/api/v1/food-requests').set(auth(donorAuth)).send({...input,sourceName:'Edited event'})).status).toBe(409);
  });
  it('uses mocked official sending, verifies delivery webhook signatures and prevents replay/state regression',async()=>{
    const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({messages:[{id:`wamid.${randomUUID()}`}]} )});vi.stubGlobal('fetch',fetch);
    vi.stubEnv('WHATSAPP_SENDING_ENABLED','true');vi.stubEnv('WHATSAPP_ACCESS_TOKEN','test-only');vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID','1234');vi.stubEnv('WHATSAPP_GRAPH_VERSION','v26.0');vi.stubEnv('PUBLIC_APP_ORIGIN','https://app.example.test');vi.stubEnv('WHATSAPP_TEMPLATE_DONATION_RECEIVED','test_donation');
    const pending=(await query("SELECT id FROM app.notification_outbox WHERE recipient_user_id=$1 AND status='PENDING' ORDER BY created_at DESC LIMIT 1",[donorId])).rows[0];
    await query("UPDATE app.notification_dispatch_rate SET next_send_at=now()-interval '2 seconds'");await dispatchOne(pending.id);
    expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][0]).toBe('https://graph.facebook.com/v26.0/1234/messages');
    const sent=(await query("SELECT provider_message_id FROM app.notification_outbox WHERE recipient_user_id=$1 AND status='SENT'",[donorId])).rows[0];expect(sent).toBeTruthy();
    vi.stubEnv('WHATSAPP_APP_SECRET','local-test-secret');
    const body=JSON.stringify({entry:[{changes:[{value:{statuses:[{id:sent.provider_message_id,status:'read',timestamp:String(Math.floor(Date.now()/1000))}]}}]}]});const signature='sha256='+createHmac('sha256','local-test-secret').update(body).digest('hex');
    for(let i=0;i<2;i++)expect((await request(app).post('/api/v1/notifications/webhook').set('Content-Type','application/json').set('x-hub-signature-256',signature).send(body)).status).toBe(200);
    expect((await query('SELECT status FROM app.notification_outbox WHERE provider_message_id=$1',[sent.provider_message_id])).rows[0].status).toBe('READ');
    const {createHash}=await import('node:crypto');expect((await query('SELECT count(*)::int AS count FROM app.notification_webhook_events WHERE event_hash=$1',[createHash('sha256').update(body).digest('hex')])).rows[0].count).toBe(1);
    expect((await request(app).post('/api/v1/notifications/webhook').set('Content-Type','application/json').set('x-hub-signature-256','sha256='+'0'.repeat(64)).send(body)).status).toBe(401);
  });
});
