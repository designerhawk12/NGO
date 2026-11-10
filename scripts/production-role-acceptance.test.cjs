const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {JSDOM}=require('jsdom');
const id='00000000-0000-4000-8000-000000000001';
function harness({approved=true,role='ADMIN',returnedId=id}={}){
 const dom=new JSDOM('',{url:'https://ngo-i0tqqrcp8-equinox10.vercel.app/donor/index.html',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.SUPABASE_ANON_KEY='synthetic-public-key';
 w.fetch=async(url,options={})=>{
  calls.push({url:String(url),method:options.method||'GET'});let status=200,body;
  if(String(url).endsWith('/auth/v1/user'))body={id};
  else if(String(url).includes('/token?'))body={access_token:'synthetic-session-token'};
  else if(String(url).includes('/logout?'))body={};
  else if(String(url)==='/api/v1/me')body={data:{role,authUserId:returnedId}};
  else {status=String(url).includes('/assignments/')?403:200;body={data:[]};}
  return {ok:status<400,status,json:async()=>body};
 };
 w.localStorage.setItem('sb-pyzyxgpcfwpcqyqrihuo-auth-token',JSON.stringify({access_token:'synthetic-session-token'}));
 const map={ADMIN:approved?[crypto.createHash('sha256').update(id).digest('hex')]:[],DONOR:[],VOLUNTEER:[],DRIVER:[]};
 const source=fs.readFileSync(require.resolve('./production-role-acceptance.browser.js'),'utf8').replace('const approvedRoleHashes = null;','const approvedRoleHashes = '+JSON.stringify(map)+';');
 vm.runInContext(source,dom.getInternalVMContext());return {dom,w,calls,result:()=>JSON.parse(w.document.querySelector('#result').textContent)};
}
test('unmapped identity is rejected before any application provisioning request',async()=>{
 const h=harness({approved:false});try{await h.w.document.querySelector('#reuse').onclick();assert.equal(h.result().result,'STOP');assert(!h.calls.some(x=>x.url.startsWith('/api/')));}finally{h.dom.window.close();}
});
test('mapped role verifies authorized reads and other-role denial without exposing tokens',async()=>{
 const h=harness();try{await h.w.document.querySelector('#reuse').onclick();const r=h.result();assert.equal(r.current.result,'PASS');assert.equal(r.current.checks.length,5);assert(!JSON.stringify(r).includes('synthetic-session-token'));assert(h.calls.filter(x=>x.url.startsWith('/api/')).every(x=>x.method==='GET'));}finally{h.dom.window.close();}
});
test('wrong server role or identity stops immediately after me',async()=>{
 for(const config of [{role:'DONOR'},{returnedId:'different-identity'}]){const h=harness(config);try{await h.w.document.querySelector('#reuse').onclick();assert.equal(h.result().result,'STOP');assert.deepEqual(h.calls.filter(x=>x.url.startsWith('/api/')).map(x=>x.url),['/api/v1/me']);}finally{h.dom.window.close();}}
});
test('private sign-in clears password and closes only its temporary session',async()=>{
 const h=harness();try{const f=h.w.document.querySelector('form');f.elements.email.value='synthetic@example.invalid';f.elements.password.value='synthetic-password';await f.onsubmit({preventDefault(){}});assert.equal(h.result().current.result,'PASS');assert.equal(f.elements.password.value,'');assert(h.calls.some(x=>x.url.includes('/logout?scope=local')));assert(h.calls.filter(x=>x.url.startsWith('/api/')).every(x=>x.method==='GET'));assert.equal(h.w.localStorage.getItem('sb-pyzyxgpcfwpcqyqrihuo-auth-token'),JSON.stringify({access_token:'synthetic-session-token'}));}finally{h.dom.window.close();}
});
