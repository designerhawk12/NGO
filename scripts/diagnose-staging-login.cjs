// Existing staging accounts only: no creation, password reset, role or configuration changes.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const web = 'https://aaharaconnect-ngo-staging.vercel.app';
const api = 'https://aaharaconnect-ngo-staging-api.vercel.app';
const supabase = 'https://tughgqggsndtraaymtvf.supabase.co';
async function main() {
  const html = await (await fetch(web)).text();
  const assets = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => new URL(m[1], web));
  let code = '';
  for (const asset of assets) {
    if (asset.origin !== web) throw Error('Unexpected asset origin');
    code += await (await fetch(asset)).text();
  }
  const key = code.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
  if (!key || !code.includes(supabase) || !code.includes(api)) throw Error('Staging browser configuration not verified');
  console.log(JSON.stringify({browserProject:'tughgqggsndtraaymtvf',apiOrigin:api,publicKeyFound:true}));
  const base = path.join(process.env.LOCALAPPDATA,'AahaaraConnect-Staging');
  const fixture = JSON.parse(fs.readFileSync(path.join(base,'hosted-pilot-fixture.json')));
  const rotated = JSON.parse(fs.readFileSync(path.join(base,'legacy-password-rotation.json')));
  const accounts = Object.entries(fixture.accounts).filter(([,a]) => !process.argv.includes('--legacy-only') && ['ADMIN','DONOR','VOLUNTEER'].includes(a.role))
    .map(([label,a]) => ({label,...a}));
  for (const a of rotated.accounts) {
    if (a.status === 'complete') accounts.push({label:a.field,email:a.email,password:a.newPassword});
  }
  for (const account of accounts) {
    const client = createClient(supabase,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const signed = await client.auth.signInWithPassword({email:account.email,password:account.password});
    const result = {label:account.label,auth:signed.error?.code || 'OK'};
    if (signed.data.session) {
      const token = signed.data.session.access_token;
      const claims = JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
      if (claims.iss !== supabase+'/auth/v1') throw Error('Unexpected token issuer');
      result.me = [];
      for (const origin of [web,api]) {
        const response = await fetch(origin+'/api/v1/me',{headers:{Authorization:'Bearer '+token},redirect:'error'});
        const body = await response.json();
        result.me.push({origin,http:response.status,role:body.data?.role,status:body.data?.volunteerApplicationStatus,error:body.error?.code,requestId:response.headers.get('x-request-id')});
      }
      await client.auth.signOut({scope:'local'});
    }
    console.log(JSON.stringify(result));
  }
}
main().catch(()=>{console.error('Staging diagnostic failed; credential details suppressed.');process.exitCode=1;});
