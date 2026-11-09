import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

// Run after a staging-configured web build. No network or real credentials.
const html = fs.readFileSync(new URL('../dist/donor/index.html', import.meta.url), 'utf8')
const authUrl = 'https://tughgqggsndtraaymtvf.supabase.co/auth/v1'
assert.ok(html.includes(authUrl), 'Donor HTML must receive the same staging environment as the main entry')
assert.ok(!html.includes('oneiwcfdnqzcyfvxufhc'), 'No obsolete Auth project')
assert.ok(!html.includes('admin_test@gmail.com'), 'No nonexistent suggested Admin')
assert.ok(!html.includes('%VITE_'), 'No unresolved build configuration')
const source = html.slice(html.indexOf('/* ===== Mode & API Configuration ===== */'), html.indexOf('/* ===== Model classes'))
const token = (iss, exp = Math.floor(Date.now()/1000)+3600) => 'header.'+Buffer.from(JSON.stringify({iss,exp})).toString('base64url')+'.signature'
for (const scenario of ['donor','admin','volunteer','bad-password','api-error']) {
  const dom = new JSDOM(html, {url:'https://aaharaconnect-ngo-staging.vercel.app/donor/',runScripts:'outside-only'})
  const w = dom.window
  const calls = []
  w.toast = () => {}
  w.fetch = async (url, options) => {
    calls.push({url,options})
    return url.includes('/token?')
      ? {ok:scenario!=='bad-password',json:async()=> scenario==='bad-password'?{msg:'Invalid login credentials'}:{access_token:token(authUrl),user:{email:'synthetic@example.test'}}}
      : {ok:scenario!=='api-error',json:async()=>({data:{role:scenario==='volunteer'?'VOLUNTEER':scenario==='admin'?'ADMIN':'DONOR'}})}
  }
  w.eval(source)
  w.document.getElementById('sbEmail').value = 'synthetic@example.test'
  w.document.getElementById('sbPass').value = 'synthetic-test-only'
  await w.document.getElementById('btnSbLogin').onclick()
  assert.equal(calls[0].url,authUrl+'/token?grant_type=password')
  assert.ok(calls[0].options.headers.apikey.startsWith('sb_publishable_'))
  const success = scenario==='donor'||scenario==='admin'
  assert.equal(!!w.localStorage.getItem('aaharaconnect-donor-token:'+authUrl),success)
  if(scenario!=='bad-password') assert.equal(calls[1].url,'https://aaharaconnect-ngo-staging-api.vercel.app/api/v1/me')
  if(success) {
    assert.equal(w.eval('getStoredToken()'),token(authUrl))
    w.document.getElementById('tokenInput').value=token('https://other.invalid/auth/v1')
    assert.equal(w.eval('getStoredToken()'),null,'Reject foreign environment tokens')
    w.document.getElementById('tokenInput').value=token(authUrl,1)
    assert.equal(w.eval('getStoredToken()'),null,'Reject expired tokens')
  }
  dom.window.close()
}
const listeners={}
const self={location:{origin:'https://staging.invalid'},registration:{scope:'https://staging.invalid/donor/'},addEventListener:(name,fn)=>listeners[name]=fn}
vm.runInNewContext(fs.readFileSync(new URL('../public/donor/sw.js',import.meta.url),'utf8'),{self,URL,fetch:async()=>({ok:false})})
for(const [url,method,expected] of [
  ['https://staging.invalid/api/v1/me','GET',false],
  [authUrl+'/token','POST',false],
  ['https://staging.invalid/donor/index.html','POST',false],
  ['https://staging.invalid/donor/index.html','GET',true],
]) {
  let intercepted=false
  listeners.fetch({request:{url,method},respondWith:()=>{intercepted=true}})
  assert.equal(intercepted,expected,'Service worker must cache only public shell GETs')
}
console.log('PASS: built Donor configuration; five login outcomes; foreign/expired token rejection; four service-worker isolation cases')
