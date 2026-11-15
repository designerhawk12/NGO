// Bounded deployment-phase bridge. No user/record writes, no migration.
const fs=require('node:fs'),readline=require('node:readline');const {Client}=require('pg');const {config}=require('./production-recovery.cjs');
if(process.argv[2]!=='--approved-deployment-bridge')throw Error('Explicit deployment authorization required');
const cfg=config();const c=new Client({connectionString:cfg.raw,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(cfg.ca,'utf8')},connectionTimeoutMillis:10000});
let released=false;
(async()=>{await c.connect();try{
 await c.query("BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL idle_in_transaction_session_timeout='960s'");
 const names=(await c.query("SELECT quote_ident(n.nspname)||'.'||quote_ident(t.relname) AS name FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='auth' AND t.relname<>'schema_migrations' AND t.relkind='r' ORDER BY 1")).rows;
 if(names.length!==26)throw Error('Auth inventory drift');await c.query('LOCK TABLE '+names.map(x=>x.name).join(',')+' IN SHARE MODE NOWAIT');
 const pid=(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 console.log(JSON.stringify({authBridgeHeld:true,tables:26,pid,maximumSeconds:900,firewallMustRemainEnabled:true}));
 const lines=readline.createInterface({input:process.stdin});const deadline=setTimeout(()=>lines.close(),900000);const pulse=setInterval(()=>c.query('SELECT 1').catch(()=>lines.close()),15000);
 for await(const line of lines){if(line.trim()==='release-auth-bridge'){released=true;break;}}
 clearTimeout(deadline);clearInterval(pulse);if(!released)throw Error('Auth bridge ended without explicit release; retain firewall');
 }finally{await c.query('ROLLBACK').catch(()=>{});await c.end();}
 console.log('Auth bridge explicitly released');
})().catch(()=>{console.error('Auth bridge stopped; application firewall must remain enabled');process.exitCode=1;});
