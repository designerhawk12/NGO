// Exact approved operation; uses existing runner, never a second migration ledger.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),readline=require('node:readline');
const {Client}=require('pg');const recovery=require('./production-recovery.cjs');
const root=path.resolve(__dirname,'..'),checksum='28d70f15fc4e45e18f85130fbb76abdbc0a2a1d881a8aeb2fca9f1c8ab0788e1';
const {protectedTables,fingerprints,quote}=require('./maintenance-projection.cjs');
if(process.argv[2]!=='--execute-approved-015')throw Error('Explicit approved operation required');
if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'server/db/migrations/015_final_pilot.sql'))).digest('hex')!==checksum)throw Error('015 checksum gate');
const cfg=recovery.config();
Object.assign(process.env,{DATABASE_URL:cfg.raw,DATABASE_SSL:'true',DATABASE_SSL_CA:fs.readFileSync(cfg.ca,'utf8'),NODE_ENV:'production'});
process.chdir(path.join(root,'server'));
const {runMigrations}=require('../server/dist/db/migrationRunner'),{closePool}=require('../server/dist/db/pool');
const bridge=new Client({connectionString:cfg.raw,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(cfg.ca,'utf8')},connectionTimeoutMillis:10000});
let bridgeFailed=false,committed=false,commitAttempted=false,baseline=[],roleBaseline,backup;
bridge.on('error',()=>{bridgeFailed=true;});
async function main(){
 await bridge.connect();
 try{
 await runMigrations('up',{expectedPending:{'015_final_pilot.sql':checksum},before:async tx=>{
  await tx.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'; SET LOCAL idle_in_transaction_session_timeout='600s'");
  const tables=await protectedTables(tx);
  if(tables.filter(t=>t.schema==='app').length!==32||tables.filter(t=>t.schema==='auth').length!==26)throw Error('Protected inventory drift');
  await tx.query('LOCK TABLE '+tables.map(t=>quote(t.schema)+'.'+quote(t.name)).join(',')+' IN SHARE MODE NOWAIT');
  await bridge.query("BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='1800s'");
  await bridge.query('LOCK TABLE '+tables.filter(t=>t.schema==='auth').map(t=>quote(t.schema)+'.'+quote(t.name)).join(',')+' IN SHARE MODE NOWAIT');
  const active=(await tx.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid NOT IN (pg_backend_pid(),$1) AND backend_type='client backend' AND usename='postgres' AND xact_start IS NOT NULL",[(await bridge.query('SELECT pg_backend_pid() pid')).rows[0].pid])).rows[0].n;
  if(active!==0)throw Error('Unexpected direct admin transaction');
  roleBaseline=(await tx.query('SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls FROM pg_roles ORDER BY rolname')).rows;
  baseline=await fingerprints(tx,tables);baseline.tables=tables;
  console.log(JSON.stringify({phase:'protected-baseline',appTables:32,authTables:26,unexpectedAdminTransactions:active}));
  backup=await recovery.backup();
  if(bridgeFailed)throw Error('Auth bridge lost');
  await bridge.query('SELECT 1');await tx.query('SELECT 1');
  if(JSON.stringify(baseline)!==JSON.stringify(await fingerprints(tx,tables)))throw Error('Protected baseline drift after backup');
 },after:async tx=>{
  if(bridgeFailed)throw Error('Auth bridge lost');await bridge.query('SELECT 1');
  const after=await fingerprints(tx,baseline.tables);
  const differences=baseline.filter((x,i)=>x.name!=='schema_migrations'&&JSON.stringify(x)!==JSON.stringify(after[i]));
  if(differences.length)throw Error('Original record preservation failed');
  const roles=(await tx.query('SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls FROM pg_roles ORDER BY rolname')).rows;
  if(roleBaseline.some(r=>JSON.stringify(r)!==JSON.stringify(roles.find(x=>x.rolname===r.rolname))))throw Error('Existing role attributes changed');
  const ledger=(await tx.query('SELECT name,checksum FROM app.schema_migrations ORDER BY name')).rows;
  if(ledger.length!==15||ledger.find(x=>x.name==='015_final_pilot.sql')?.checksum!==checksum)throw Error('Migration ledger verification failed');
  commitAttempted=true;
  console.log(JSON.stringify({phase:'precommit-preservation-pass',originalTablesCompared:baseline.length-1,originalRolesPreserved:roleBaseline.length,ledger:15}));
 }});
 committed=true;console.log(JSON.stringify({phase:'015-committed',backupDirectory:backup.directory,backupSha256:backup.manifest.sha256,authBridgeHeld:true,firewallMustRemainEnabled:true}));
 // Operator explicitly releases this bridge only after infrastructure/acceptance handover.
 const lines=readline.createInterface({input:process.stdin});
 const deadline=setTimeout(()=>{bridgeFailed=true;console.error('Auth bridge time limit reached; firewall must remain enabled');lines.close();},1500000);
 const heartbeat=setInterval(()=>bridge.query('SELECT 1').catch(()=>{bridgeFailed=true;lines.close();}),15000);
 let explicitlyReleased=false;
 for await(const line of lines){if(line.trim()==='release-auth-bridge'){explicitlyReleased=true;console.log('Explicit Auth bridge release requested');break;}}
 clearTimeout(deadline);clearInterval(heartbeat);
 if(!explicitlyReleased||bridgeFailed)throw Error('Auth bridge lost or command channel ended; retain firewall');
 }finally{await bridge.query('ROLLBACK').catch(()=>{});await bridge.end().catch(()=>{});await closePool();}
}
main().catch(e=>{console.error(JSON.stringify({failed:true,committed,commitAttempted,code:e.code||null,reason:/inventory|Unexpected|preservation|baseline|bridge|ledger|attributes/.test(e.message)?e.message:'Approved operation failed; sensitive error details suppressed',keepFirewall:committed||commitAttempted}));process.exitCode=1;});
