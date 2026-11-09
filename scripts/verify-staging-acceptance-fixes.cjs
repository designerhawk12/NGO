// Explicitly authorized synthetic profile replacement and donation regression; never creates accounts.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),sharp=require('sharp');
const {createClient}=require('@supabase/supabase-js');
const web='https://aaharaconnect-ngo-staging.vercel.app',api='https://aaharaconnect-ngo-staging-api.vercel.app',auth='https://tughgqggsndtraaymtvf.supabase.co';
async function main(){
  if(process.env.AAHARA_STAGING_TEST_WRITE_APPROVED!=='true')throw Error('Explicit staging test gate required');
  const base=path.join(process.env.LOCALAPPDATA,'AahaaraConnect-Staging');
  const fixture=JSON.parse(fs.readFileSync(path.join(base,'hosted-pilot-fixture.json')));
  const html=await(await fetch(web)).text();const asset=html.match(/src="([^"]+\.js)"/)[1];
  const code=await(await fetch(new URL(asset,web))).text();const key=code.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
  if(!key||!code.includes(auth)||!code.includes(api))throw Error('Staging target not verified');
  const checks=[],clients=[];const accounts={};
  const evidence=path.join(base,'acceptance-fixes-hosted-'+Date.now()+'.json');
  const check=(name,passed)=>{checks.push({name,passed});fs.writeFileSync(evidence,JSON.stringify({at:new Date().toISOString(),project:'tughgqggsndtraaymtvf',checks},null,2));console.log(JSON.stringify({name,passed}));if(!passed)throw Error('Hosted assertion failed');};
  async function request(method,route,label,body,expected=200){
    const r=await fetch(api+'/api/v1'+route,{method,redirect:'error',headers:{...(label?{Authorization:'Bearer '+accounts[label].token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const j=await r.json();check(method+' '+route+' '+(label||'anonymous')+' HTTP '+r.status,Array.isArray(expected)?expected.includes(r.status):r.status===expected);return j.data;
  }
  try{
    for(const label of ['admin','donor','volunteer','driver0']){
      const a=fixture.accounts[label];if(!a?.email?.startsWith('aahara-')||!a.email.endsWith('@example.test'))throw Error('Not a synthetic account');
      const client=createClient(auth,key,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(client);
      const login=await client.auth.signInWithPassword({email:a.email,password:a.password});check(label+' Auth login',!!login.data.session&&!login.error);
      accounts[label]={...a,token:login.data.session.access_token};const me=await request('GET','/me',label);
      check(label+' server role and Auth identity',me.role===a.role&&me.authUserId===a.authId);
    }
    if(!process.argv.includes('--donation-only')) {
    await request('GET','/vehicles/tracking','admin');await request('GET','/vehicles/tracking','donor',undefined,403);
    await request('GET','/assignments/driver','driver0');await request('GET','/assignments/me','volunteer');
    await request('GET','/volunteers/'+accounts.volunteer.volunteerId+'/identity','donor',undefined,403);
    const identity=await request('GET','/volunteers/'+accounts.volunteer.volunteerId+'/identity','admin');check('approved synthetic identity remains verified',identity.status==='VERIFIED');
    await request('POST','/volunteers/register',null,{},process.argv.includes('--registration-enabled')?400:403);
    await request('GET','/profile-photos/me',null,undefined,401);
    if(!process.argv.includes('--checks-only')) {
    const image=await sharp({create:{width:320,height:240,channels:3,background:'#468864'}}).jpeg({quality:85}).toBuffer();
    for(const label of ['donor','volunteer','driver0']){
      // Reproduce the old picker bug: JPEG bytes accompanied by the original PNG MIME.
      await request('PUT','/profile-photos/me',label,{contentType:'image/png',dataBase64:image.toString('base64')},415);
      let firstPath;
      for(let replacement=0;replacement<2;replacement++){
        const photo=await request('PUT','/profile-photos/me',label,{contentType:'image/jpeg',dataBase64:image.toString('base64')});
        check(label+' signed preview renders '+replacement,!!photo.photoUrl&&(await fetch(photo.photoUrl)).ok);
        const saved=await request('GET','/profile-photos/me',label);const pathname=new URL(saved.photoUrl).pathname;
        check(label+' photo persists on independent read '+replacement,pathname===new URL(photo.photoUrl).pathname);
        if(replacement)check(label+' replacement uses new private object',pathname!==firstPath);else firstPath=pathname;
        const publicPath=pathname.replace('/object/sign/','/object/public/');check(label+' anonymous direct object denied '+replacement,!(await fetch(auth+publicPath)).ok);
      }
    }
    } else for(const label of ['donor','volunteer','driver0']){
      const saved=await request('GET','/profile-photos/me',label);check(label+' saved photo still renders after rollout',!!saved.photoUrl&&(await fetch(saved.photoUrl)).ok);
    }
    }
    if(!process.argv.includes('--checks-only')) {
    const now=Date.now(),submissionId=crypto.randomUUID();
    const donation={submissionId,sourceName:'Synthetic acceptance regression '+submissionId.slice(0,8),sourceType:'Event',pickupAddress:'Synthetic staging pickup address, Bengaluru',preparedAt:new Date(now-60000).toISOString(),readyAt:new Date(now).toISOString(),pickupDeadline:new Date(now+3600000).toISOString(),contactName:'Synthetic acceptance donor',contactPhoneE164:'+15555550123',donorSafetyDeclaration:true,items:[{foodType:'Synthetic test rice',quantity:1,unit:'KG'}]};
    donation.handlingRequirements='Synthetic record only';donation.estimatedWeightKg=1;donation.items[0].handlingRequirements='Synthetic record only';
    const created=await request('POST','/food-requests','donor',donation,201);const replay=await request('POST','/food-requests','donor',donation,[200,201]);check('donation replay preserved request identity',created.id===replay.id);
    fs.writeFileSync(path.join(base,'acceptance-fixes-hosted-results.json'),JSON.stringify({at:new Date().toISOString(),project:'tughgqggsndtraaymtvf',checks},null,2));
    }
  }finally{for(const client of clients)await client.auth.signOut({scope:'local'});}
}
main().catch(()=>{console.error('Synthetic staging regression failed; credentials and private URLs suppressed.');process.exitCode=1;});
