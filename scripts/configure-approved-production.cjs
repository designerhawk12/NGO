// Exact Production-only rollout configuration. Secrets stay in memory/private source files.
const fs=require('node:fs'),cp=require('node:child_process');
const progressFile='C:/Users/desig/AppData/Local/AahaaraConnect-Production/production-release-env-progress.json';
const cli='C:/Users/desig/AppData/Roaming/npm/node_modules/vercel/dist/index.js';
const project='prj_6BuwhBiISjTlzgGtqG2arEXqOXGl',team='team_lRAI0kP7NNOxCUPBitJQ3d95';
function api(endpoint,method='GET',body){
 const args=[cli,'api',endpoint,'--scope','equinox10','--method',method];if(body)args.push('--input','-');
 const r=cp.spawnSync(process.execPath,args,{input:body?JSON.stringify(body):undefined,encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024});
 if(r.status!==0)throw Error('Vercel API operation failed; do not blindly retry');
 const result=JSON.parse(r.stdout);if(result.error)throw Error('Vercel API response error; stop');return result;
}
async function main(){
 const endpoint='/v10/projects/'+project+'/env?teamId='+team;
 const before=api(endpoint+'&decrypt=true');
 const entries=before.envs;if(!Array.isArray(entries))throw Error('Missing environment inventory');
 const get=k=>entries.find(e=>e.key===k&&e.target?.includes('production'));
 const clientEntry=get('VITE_SUPABASE_PUBLISHABLE_KEY');
 if(!clientEntry)throw Error('Production public-key entry absent');
 const pub=api('/v1/projects/'+project+'/env/'+clientEntry.id+'?teamId='+team).value;
 if(!pub||!(pub.startsWith('sb_publishable_')||pub.startsWith('eyJ')))throw Error('Production public-key gate');
 if(pub.startsWith('eyJ')){const p=JSON.parse(Buffer.from(pub.split('.')[1],'base64url'));if(p.ref!=='pyzyxgpcfwpcqyqrihuo'||p.role!=='anon')throw Error('Public JWT project/role mismatch');}
 const supabase='https://pyzyxgpcfwpcqyqrihuo.supabase.co';
 const keyCheck=await fetch(supabase+'/auth/v1/settings',{headers:{apikey:pub},signal:AbortSignal.timeout(15000)});if(!keyCheck.ok)throw Error('Public key verification failed');
 const base='C:/Users/desig/AppData/Local/AahaaraConnect-Production/';
 const raw=fs.readFileSync(base+'production-runtime.env','utf8').trim().slice('DATABASE_URL='.length);
 if(new URL(raw).username!=='aaharaconnect_runtime.pyzyxgpcfwpcqyqrihuo')throw Error('Restricted runtime identity gate');
 let secret=fs.readFileSync(base+'production-admin.env','utf8').split(/\r?\n/).find(x=>/^SUPABASE_SECRET_KEY\s*=/.test(x));secret=secret.slice(secret.indexOf('=')+1).trim().replace(/^["']|["']$/g,'');
 const values={DATABASE_URL:raw,DATABASE_SSL:'true',DATABASE_SSL_CA:fs.readFileSync(base+'prod-ca.crt','utf8'),SUPABASE_URL:supabase,SUPABASE_PUBLISHABLE_KEY:pub,SUPABASE_SECRET_KEY:secret,VITE_SUPABASE_URL:supabase,VITE_SUPABASE_PUBLISHABLE_KEY:pub,VITE_API_BASE_URL:'/api/v1',CORS_ORIGIN:'https://ngo-eight-umber.vercel.app',PUBLIC_APP_ORIGIN:'https://ngo-eight-umber.vercel.app',VOLUNTEER_INVITE_REDIRECT_URL:'https://ngo-eight-umber.vercel.app/accept-invite',PUBLIC_VOLUNTEER_REGISTRATION_ENABLED:'false',VOLUNTEER_IDENTITY_REQUIRED:'true',FOOD_REQUEST_IDEMPOTENCY_ENABLED:'true',DRIVER_TRACKING_REQUIRED:'false',NOTIFICATION_OUTBOX_ENABLED:'false',WHATSAPP_SENDING_ENABLED:'false',TRACKING_GEOCODING_ENABLED:'false',IDENTITY_DELETION_APPROVED:'false',ANDROID_RELEASE_APPROVED:'false'};
 const sensitive=new Set(['DATABASE_URL','DATABASE_SSL_CA','SUPABASE_SECRET_KEY']);
 const body=Object.entries(values).map(([key,value])=>{
  const old=get(key);if(old&&(old.target.length!==1||old.target[0]!=='production'))throw Error('Unexpected environment scope');
  return {key,value,type:old?.type||(sensitive.has(key)?'sensitive':'plain'),target:['production']};
 });
 if(process.argv[2]!=='--apply'){console.log(JSON.stringify({prepared:true,project,productionOnly:true,keys:Object.keys(values),publicKeyVerified:true,restrictedRuntime:true}));return;}
 const accepted=fs.existsSync(progressFile)?JSON.parse(fs.readFileSync(progressFile,'utf8')):[];
 for(const entry of body){
  if(accepted.includes(entry.key)){console.log(JSON.stringify({configuredKey:entry.key,previousAcceptedUpdate:true}));continue;}
  const old=get(entry.key);
  if(entry.key==='SUPABASE_SECRET_KEY'&&old?.configurationId&&old.configurationId===get('SUPABASE_URL')?.configurationId){console.log(JSON.stringify({configuredKey:entry.key,verifiedProductionManagedBindingPreserved:true}));continue;}
  if(old&&old.type!=='sensitive'){const current=api('/v1/projects/'+project+'/env/'+old.id+'?teamId='+team);if(current.value===entry.value){console.log(JSON.stringify({configuredKey:entry.key,existingValueVerified:true}));continue;}}
  const response=api(endpoint+'&upsert=true','POST',entry);
  if(response.failed?.length)throw Error('Environment write failure; stop');
  accepted.push(entry.key);fs.writeFileSync(progressFile,JSON.stringify(accepted));
  console.log(JSON.stringify({configuredKey:entry.key,productionOnly:true}));
 }
 const after=api(endpoint);const verified=body.every(x=>after.envs?.some(e=>e.key===x.key&&e.type===x.type&&e.target?.length===1&&e.target[0]==='production'));
 if(!verified)throw Error('Environment read-back mismatch');
 console.log(JSON.stringify({applied:true,project,variables:body.length,productionOnly:true,metadataReadBack:true,credentialValuesPrinted:false,unrelatedVariablesPreserved:true}));
}
main().catch(()=>{console.error('Production configuration validation/write failed; dependent work stopped; no secret output');process.exitCode=1;});
