// Explicit, staging-only synthetic hosted verification. Never uses old checkout credentials.
// Run from repository root with AAHARA_STAGING_TEST_WRITE_APPROVED=true.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const dotenv = require('dotenv');
const sharp = require('sharp');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const origin = 'https://aaharaconnect-ngo-staging-api.vercel.app';
const authOrigin = 'https://tughgqggsndtraaymtvf.supabase.co';
const base = path.join(process.env.LOCALAPPDATA, 'AahaaraConnect-Staging');
const credentials = dotenv.parse(fs.readFileSync(path.join(base, 'staging.env')));
const target = new URL(credentials.DATABASE_URL);
if (process.env.AAHARA_STAGING_TEST_WRITE_APPROVED !== 'true'
  || target.username !== 'postgres.tughgqggsndtraaymtvf'
  || target.hostname !== 'aws-0-eu-west-1.pooler.supabase.com') throw Error('Staging write gate not satisfied');
const db = new Pool({ connectionString:credentials.DATABASE_URL, ssl:{rejectUnauthorized:true,ca:fs.readFileSync(credentials.DATABASE_SSL_CA_PATH,'utf8')},max:1 });
const adminAuth = createClient(authOrigin,credentials.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const privateFile = path.join(base,'hosted-pilot-fixture.json');
const state = fs.existsSync(privateFile) ? JSON.parse(fs.readFileSync(privateFile))
  : {tag:crypto.randomBytes(4).toString('hex'),accounts:{},checks:[],objects:{}};
function save() { fs.writeFileSync(privateFile,JSON.stringify(state,null,2)); }
function check(name,ok,details={}) {
  const row={name,passed:!!ok,...details};state.checks.push(row);save();console.log(JSON.stringify(row));
  if(!ok)throw Error('Hosted assertion failed: '+name);
}
async function api(method,route,actor,body,expected=200,extra={}) {
  const headers={...extra};if(actor)headers.Authorization='Bearer '+actor.token;
  if(body!==undefined)headers['Content-Type']='application/json';
  const started=Date.now();const response=await fetch(origin+'/api/v1'+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:'error'});
  const raw=await response.text();let payload;try{payload=JSON.parse(raw);}catch{payload={};}
  const ok=(Array.isArray(expected)?expected:[expected]).includes(response.status);
  check(method+' '+route,ok,{http:response.status,error:payload.error?.code,ms:Date.now()-started});
  return {data:payload.data,payload,response};
}
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const future=minutes=>new Date(Date.now()+minutes*60000).toISOString();
const phone=()=>'+1555'+String(crypto.randomInt(1000000,9999999));
let publicKey;
function loadPublicKey(){
  const result=cp.spawnSync('eas.cmd',['env:list','preview','--format','short','--include-sensitive'],{cwd:path.join(process.cwd(),'apps/mobile'),encoding:'utf8',shell:true});
  if(result.status!==0)throw Error('Preview configuration unavailable');
  publicKey=result.stdout.match(/^\s*EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY\s*=\s*(.*)$/m)?.[1];
  if(!publicKey?.startsWith('sb_publishable_'))throw Error('Public key not verified');
}
async function account(label,role) {
  let a=state.accounts[label];
  if(!a){
    const email=`aahara-${state.tag}-${label}@example.test`,password=crypto.randomBytes(24).toString('base64url');
    const made=await adminAuth.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`Staging ${state.tag} ${label}`}});
    if(made.error||!made.data.user)throw Error('Synthetic Auth account creation failed (no invitation requested)');
    a=state.accounts[label]={authId:made.data.user.id,email,password,role};save();
  }
  const existing=await q('SELECT id,role FROM app.app_users WHERE auth_user_id=$1',[a.authId]);
  if(existing.length){if(existing[0].role!==role)throw Error('Synthetic fixture role mismatch');a.userId=existing[0].id;}
  else a.userId=(await q('INSERT INTO app.app_users(auth_user_id,role,display_name) VALUES($1,$2,$3) RETURNING id',[a.authId,role,`Staging ${state.tag} ${label}`]))[0].id;
  const client=createClient(authOrigin,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=await client.auth.signInWithPassword({email:a.email,password:a.password});
  if(signed.error||!signed.data.session)throw Error('Synthetic Auth login failed');a.token=signed.data.session.access_token;a.client=undefined;save();
  // Volunteer/Driver identities require their canonical profile before /me.
  if(role==='ADMIN'||role==='DONOR'){
    const me=await api('GET','/me',a);check(label+' server-owned role',me.data.role===role);
  }
  return a;
}
async function volunteer(label) {
  const a=await account(label,'VOLUNTEER');
  if(!a.volunteerId){const person=(await q('INSERT INTO app.people(app_user_id,name,phone_e164) VALUES($1,$2,$3) RETURNING id',[a.userId,`Synthetic ${state.tag} ${label}`,phone()]))[0];
    a.volunteerId=(await q("INSERT INTO app.volunteers(person_id,registration_code,skills) VALUES($1,$2,ARRAY['Packing']) RETURNING id",[person.id,'STAGE-'+crypto.randomUUID()]))[0].id;
    await q("INSERT INTO app.volunteer_applications(volunteer_id,status) VALUES($1,'PENDING')",[a.volunteerId]);save();}
  const me=await api('GET','/me',a);check(label+' server-owned role',me.data.role==='VOLUNTEER');return a;
}
async function version(id){return (await q('SELECT version FROM app.assignments WHERE id=$1',[id]))[0].version;}
async function transition(actor,id,action){return api('PATCH','/assignments/'+id+'/status',actor,{action,expectedVersion:await version(id)});}
async function donation(donor,admin,suffix){
  const submissionId=crypto.randomUUID();const body={submissionId,sourceName:`Synthetic staging ${state.tag} ${suffix}`,sourceType:'Test kitchen',pickupAddress:'Synthetic staging pickup address, Bengaluru',preparedAt:future(-5),pickupDeadline:future(600),contactName:'Synthetic test donor',contactPhoneE164:phone(),handlingRequirements:'Synthetic record only',donorSafetyDeclaration:true,estimatedWeightKg:10,items:[{foodType:'Synthetic test rice',quantity:10,unit:'KG',handlingRequirements:'Synthetic record only',estimatedMeals:20,estimatedWeightKg:10}]};
  const first=await api('POST','/food-requests',donor,body,201);const replay=await api('POST','/food-requests',donor,body,[200,201]);check('donation retry reuses id',first.data.id===replay.data.id);
  await api('POST','/food-requests/'+first.data.id+'/safety-review',admin,{review:'APPROVED'});return first.data.id;
}
async function main(){
  const attemptStart=state.checks.length;
  const ledger=await q("SELECT checksum FROM app.schema_migrations WHERE name='015_final_pilot.sql'");check('approved migration015 checksum',ledger[0]?.checksum==='28d70f15fc4e45e18f85130fbb76abdbc0a2a1d881a8aeb2fca9f1c8ab0788e1');
  loadPublicKey();
  await api('GET','/health/ready');await api('GET','/me',null,undefined,401);
  const admin=await account('admin','ADMIN'),donor=await account('donor','DONOR'),other=await account('other','DONOR');
  for(const route of ['/vehicles','/pickups','/volunteers','/distribution-centers','/food-requests'])await api('GET',route,admin);
  await api('GET','/notifications/outbox',donor,undefined,403);await api('GET','/vehicles/tracking',donor,undefined,403);
  await api('POST','/volunteers/register',null,{},403);
  const image=await sharp({create:{width:32,height:32,channels:3,background:'#ffffff'}}).png().toBuffer();
  const proof={documentType:'PAN',contentType:'image/png',dataBase64:image.toString('base64'),consent:true,maskedAadhaarConfirmed:false};
  const applicant=await volunteer('volunteer');
  if(!state.objects.identityApproved){
    await api('GET','/assignments/me',applicant,undefined,403);
    await api('PUT','/volunteers/me/identity',applicant,proof);
    await api('GET','/volunteers/'+applicant.volunteerId+'/identity',other,undefined,403);
    await api('PATCH','/volunteers/'+applicant.volunteerId+'/approval',admin,{status:'APPROVED'},409);
    const preview=await api('GET','/volunteers/'+applicant.volunteerId+'/identity',admin);check('identity preview private and no-store',!!preview.data.previewUrl&&preview.response.headers.get('cache-control')==='no-store');
    state.objects.identityPreview=preview.data.previewUrl;save();
    const direct=(await q('SELECT object_path FROM app.volunteer_identity_documents WHERE volunteer_id=$1',[applicant.volunteerId]))[0].object_path;
    const denied=await fetch(authOrigin+'/storage/v1/object/public/volunteer-identity-private/'+direct);check('anonymous identity object denied',!denied.ok,{http:denied.status});
    const client=createClient(authOrigin,publicKey,{global:{headers:{Authorization:'Bearer '+other.token}},auth:{persistSession:false}});
    const cross=await client.storage.from('volunteer-identity-private').download(direct);check('cross-user direct Storage identity denied',!!cross.error);
    await api('POST','/volunteers/'+applicant.volunteerId+'/identity/review',admin,{status:'REJECTED',reason:'Synthetic replacement test'});
    await api('PUT','/volunteers/me/identity',applicant,proof);
    await api('POST','/volunteers/'+applicant.volunteerId+'/identity/review',admin,{status:'VERIFIED',reason:'Synthetic document fixture only'});
    await api('PATCH','/volunteers/'+applicant.volunteerId+'/approval',admin,{status:'APPROVED'});state.objects.identityApproved=true;save();
  }
  await api('GET','/assignments/me',applicant);
  await api('POST','/volunteers/me/availability',applicant,{startsAt:future(-10),endsAt:future(1440),state:'AVAILABLE'},[200,201]);
  await api('PUT','/profile-photos/me',donor,{contentType:'image/png',dataBase64:image.toString('base64')});
  const photo=await api('GET','/profile-photos/me',donor);check('owner private photo preview issued',!!photo.data.photoUrl);
  const photoPath=(await q('SELECT photo_path FROM app.app_users WHERE id=$1',[donor.userId]))[0].photo_path;
  const publicPhoto=await fetch(authOrigin+'/storage/v1/object/public/profile-photos/'+photoPath);check('anonymous photo denied',!publicPhoto.ok,{http:publicPhoto.status});
  const centre=state.objects.centre||(await api('POST','/distribution-centers',admin,{name:'Synthetic '+state.tag,address:'Synthetic staging destination, Bengaluru'},201)).data.id;state.objects.centre=centre;save();
  for(const a of [donor,applicant])await api('PUT','/notifications/preferences',a,{phoneE164:phone(),optedIn:true});
  state.fleet=state.fleet||[];
  for(let i=state.fleet.length;i<5;i++){
    const actor=await account('driver'+i,'DRIVER');
    const vehicle=(await api('POST','/vehicles',admin,{registrationNumber:'KA'+state.tag.toUpperCase()+i,kind:'Mini truck',capacityKg:800,indicativeMaxVessels:4},201)).data.id;
    await db.query('BEGIN');let driver;
    try{const person=(await q('INSERT INTO app.people(name,phone_e164) VALUES($1,$2) RETURNING id',[`Synthetic Driver ${state.tag} ${i}`,phone()]))[0].id;
      driver=(await q("INSERT INTO app.drivers(person_id,driver_type,employee_code,licence_number,licence_expires_on,created_by) VALUES($1,'EMPLOYEE',$2,$3,'2099-12-31',$4) RETURNING id",[person,'STAGE-'+state.tag+'-'+i,'STAGE-LIC-'+state.tag+'-'+i,admin.userId]))[0].id;
      await q('UPDATE app.vehicles SET assigned_driver_id=$1 WHERE id=$2',[driver,vehicle]);await q('UPDATE app.people SET app_user_id=$1 WHERE id=$2',[actor.userId,person]);await q('UPDATE app.drivers SET login_email=$1 WHERE id=$2',[actor.email,driver]);await db.query('COMMIT');
    }catch(e){await db.query('ROLLBACK');throw e;}
    const driverMe=await api('GET','/me',actor);check('Driver profile resolves server-owned role',driverMe.data.role==='DRIVER');
    await api('PUT','/notifications/preferences',actor,{phoneE164:phone(),optedIn:true});
    const food=await donation(donor,admin,'fleet'+i);await api('GET','/food-requests/'+food,other,undefined,[403,404]);
    const pickup=(await api('POST','/pickups',admin,{foodRequestId:food,windowStartsAt:future(2),windowEndsAt:future(100),distributionCenterId:centre},201)).data;
    const vessel=(await q("INSERT INTO app.vessels(vessel_code,name,vessel_type,material,capacity_value,capacity_unit,temperature_suitability) VALUES($1,'Synthetic crate','CRATE','FOOD_GRADE_PLASTIC',50,'KG','AMBIENT') RETURNING id",['STAGE-'+crypto.randomUUID()]))[0].id;
    const assignment=(await api('POST','/pickups/'+pickup.id+'/assignments',admin,{teamId:null,volunteerIds:i===4?[applicant.volunteerId]:[],driverId:driver,vesselIds:[vessel],role:'Pickup crew',windowStartsAt:pickup.windowStartsAt,windowEndsAt:pickup.windowEndsAt,containers:[{containerType:'Synthetic crate',count:1,estimatedLoadKg:10}]},201,{'Idempotency-Key':'stage-'+crypto.randomUUID()})).data;
    if(i===4)await transition(applicant,assignment.id,'ACCEPT');
    await transition(actor,assignment.id,'ACCEPT');
    const consent=(await api('POST','/pickups/'+pickup.id+'/tracking-consent',actor,{pickupId:pickup.id,consent:true})).data;
    await api('POST','/vehicles/'+vehicle+'/locations',actor,{pickupId:pickup.id,latitude:12.97+i*.001,longitude:77.59+i*.001,recordedAt:new Date().toISOString(),accuracyMeters:8,speedMps:1,sessionStartedAt:consent.startedAt});
    state.fleet.push({actorLabel:'driver'+i,vehicle,driver,pickup:pickup.id,assignment:assignment.id,food});save();
  }
  const fleet=(await api('GET','/vehicles/tracking',admin)).data.items;
  check('five distinct authorized vehicle locations',state.fleet.every(f=>fleet.some(x=>x.id===f.vehicle&&x.latitude!==null&&x.recordedAt)));
  for(const i of [0,4]){const f=state.fleet[i];for(const action of ['START','ARRIVE','COLLECT','DELIVER'])await transition(state.accounts[f.actorLabel],f.assignment,action);}
  const f=state.fleet[1],wrong=state.accounts.driver2;
  await api('POST','/vehicles/'+f.vehicle+'/locations',wrong,{pickupId:f.pickup,latitude:13,longitude:77,recordedAt:new Date().toISOString()},403);
  await api('DELETE','/pickups/'+f.pickup+'/tracking-consent',state.accounts[f.actorLabel],undefined,204);
  await api('POST','/vehicles/'+f.vehicle+'/locations',state.accounts[f.actorLabel],{pickupId:f.pickup,latitude:13,longitude:77,recordedAt:new Date().toISOString()},403);
  const outbox=(await api('GET','/notifications/outbox',admin)).data.items;check('hosted donor and assignment events queued',outbox.some(x=>x.template_key==='donation_received')&&outbox.some(x=>x.template_key==='driver_assignment')&&outbox.some(x=>x.template_key==='volunteer_assignment'));
  await api('POST','/notifications/dispatch',null,undefined,401);
  await api('GET','/releases/android');await api('GET','/releases/android/download',null,undefined,503);
  const cors=await fetch(origin+'/api/v1/me',{method:'OPTIONS',headers:{Origin:'https://untrusted.example.test','Access-Control-Request-Method':'GET'}});check('untrusted CORS origin not granted',!cors.headers.get('access-control-allow-origin'));
  state.completedAt=new Date().toISOString();state.limitations=['SMTP/invitations/public registration disabled: not delivered/tested','Browser UI and physical GPS not verified by these API tests','Admin new-application event hosted registration path not exercised'];save();
  const current=state.checks.slice(attemptStart);
  console.log(JSON.stringify({hosted_run_complete:true,checks:current.length,passed:current.filter(x=>x.passed).length,historical_failed_checks:state.checks.filter(x=>!x.passed).length,private_evidence_file:privateFile}));
}
async function supplement(){
  if(!state.completedAt||state.fleet?.length!==5)throw Error('Complete primary run before supplement');
  loadPublicKey();const admin=state.accounts.admin,donor=state.accounts.donor;
  const denied=await volunteer('denied');
  if(!state.objects.deniedReviewed){await api('PATCH','/volunteers/'+denied.volunteerId+'/approval',admin,{status:'DENIED',reason:'Synthetic denial test only'});state.objects.deniedReviewed=true;save();}
  await api('GET','/assignments/me',denied,undefined,403);
  await api('PUT','/volunteers/me/identity',denied,{documentType:'PAN',contentType:'image/png',dataBase64:'AAAAAAAAAAAAAAAA',consent:true,maskedAadhaarConfirmed:false},403);
  state.activeFleet=state.activeFleet||state.fleet.map(x=>({...x}));
  for(const i of [0,4]){
    if(state.activeFleet[i].replacement)continue;
    const f=state.activeFleet[i],actor=state.accounts[f.actorLabel],food=await donation(donor,admin,'concurrency'+i);
    const pickup=(await api('POST','/pickups',admin,{foodRequestId:food,windowStartsAt:future(2),windowEndsAt:future(100),distributionCenterId:state.objects.centre},201)).data;
    const vessel=(await q("INSERT INTO app.vessels(vessel_code,name,vessel_type,material,capacity_value,capacity_unit,temperature_suitability) VALUES($1,'Synthetic concurrency crate','CRATE','FOOD_GRADE_PLASTIC',50,'KG','AMBIENT') RETURNING id",['STAGE-'+crypto.randomUUID()]))[0].id;
    const a=(await api('POST','/pickups/'+pickup.id+'/assignments',admin,{teamId:null,volunteerIds:[],driverId:f.driver,vesselIds:[vessel],role:'Pickup crew',windowStartsAt:pickup.windowStartsAt,windowEndsAt:pickup.windowEndsAt,containers:[{containerType:'Synthetic concurrency crate',count:1,estimatedLoadKg:10}]},201,{'Idempotency-Key':'stage-'+crypto.randomUUID()})).data;
    await transition(actor,a.id,'ACCEPT');state.activeFleet[i]={...f,pickup:pickup.id,assignment:a.id,food,replacement:true};save();
  }
  await Promise.all(state.activeFleet.map(async f=>{const c=(await api('POST','/pickups/'+f.pickup+'/tracking-consent',state.accounts[f.actorLabel],{pickupId:f.pickup,consent:true})).data;f.startedAt=c.startedAt;}));save();
  const times=await Promise.all(state.activeFleet.map(async(f,i)=>{const t=Date.now();const point=(await api('POST','/vehicles/'+f.vehicle+'/locations',state.accounts[f.actorLabel],{pickupId:f.pickup,latitude:12.98+i*.001,longitude:77.6+i*.001,recordedAt:new Date().toISOString(),sessionStartedAt:f.startedAt,accuracyMeters:6})).data;check('concurrent vehicle '+i+' reading accepted',point.accepted===true);return Date.now()-t;}));
  times.sort((a,b)=>a-b);state.concurrentMetrics={requests:5,vehicles:5,p50Ms:times[2],p95Ms:times[4],maxMs:times[4]};console.log(JSON.stringify({hosted_concurrency:state.concurrentMetrics}));save();
  const list=(await api('GET','/vehicles/tracking',admin)).data.items;check('five concurrent sharing vehicles visible to Admin',state.activeFleet.every(f=>list.some(r=>r.id===f.vehicle&&r.sharing&&r.recordedAt)));
  await api('GET','/vehicles/tracking',state.accounts.driver2,undefined,403);
  const f=state.activeFleet[2],actor=state.accounts[f.actorLabel];
  for(const timestamp of [future(-3),future(2)])await api('POST','/vehicles/'+f.vehicle+'/locations',actor,{pickupId:f.pickup,latitude:13,longitude:77,recordedAt:timestamp,sessionStartedAt:f.startedAt},409);
  const probe=JSON.parse(fs.readFileSync(path.join(base,'security-preview-probe.json')));
  if(Date.now()<probe.expiresAt+2000)throw Error('Preview expiry probe not yet due; no expiry success claimed');
  const expired=await fetch(probe.url);const expiredBody=await expired.text();check('real identity preview expires',!expired.ok&&/jwt|expir|exp\"/i.test(expiredBody),{http:expired.status});
  const outbox=await q('SELECT count(*)::int AS count FROM app.notification_outbox WHERE recipient_user_id=ANY($1::uuid[]) AND attempts>0',[Object.values(state.accounts).map(a=>a.userId)]);check('synthetic outbox has no send attempts',outbox[0].count===0);
  state.securitySupplementCompletedAt=new Date().toISOString();save();console.log(JSON.stringify({hosted_security_supplement_complete:true}));
}
(process.argv.includes('--security-supplement')?supplement():main()).catch(e=>{state.lastFailure={at:new Date().toISOString(),code:e.code||'HOSTED_CHECK_FAILED',message:/^Hosted assertion failed:/.test(e.message)?e.message:'Synthetic staging operation failed; inspect sanitized evidence'};save();console.log(JSON.stringify(state.lastFailure));process.exitCode=1;}).finally(()=>db.end());
