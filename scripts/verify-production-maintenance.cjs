// Explicitly authorized maintenance verification only: locks/SELECT, never row writes.
const fs=require('node:fs');
const {Client}=require('pg');
const {config}=require('./production-recovery.cjs');
const quote=s=>'"'+s.replaceAll('"','""')+'"';
async function main(){
 const cfg=config();const options={connectionString:cfg.raw,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(cfg.ca,'utf8')},connectionTimeoutMillis:10000};
 const holder=new Client(options),probe=new Client(options);let tables=[];
 try{
  await holder.connect();await probe.connect();
  await holder.query('BEGIN');
  await holder.query("SET LOCAL lock_timeout='3s'");
  await holder.query("SET LOCAL statement_timeout='30s'");
  await holder.query("SET LOCAL idle_in_transaction_session_timeout='60s'");
  await holder.query('SELECT pg_advisory_xact_lock(29017,1)');
  tables=(await holder.query("SELECT c.oid,n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='app' OR (n.nspname='auth' AND c.relname<>'schema_migrations')) AND c.relkind IN ('r','p') ORDER BY 2,3")).rows;
  if(!tables.some(t=>t.schema==='auth'&&t.name==='users')||!tables.some(t=>t.schema==='app'&&t.name==='schema_migrations'))throw Error('Required inventory absent');
  await holder.query('LOCK TABLE '+tables.map(t=>quote(t.schema)+'.'+quote(t.name)).join(',')+' IN SHARE MODE NOWAIT');
  const locks=(await holder.query("SELECT count(DISTINCT relation)::int AS n FROM pg_locks WHERE pid=pg_backend_pid() AND mode='ShareLock' AND granted AND relation=ANY($1::oid[])",[tables.map(t=>t.oid)])).rows[0].n;
  if(locks!==tables.length)throw Error('Incomplete table lock coverage');
  const fingerprint=async()=>{
   const result=[];
   for(const t of tables){const r=await holder.query("SELECT count(*)::int AS n,md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY md5(to_jsonb(x)::text)),'')) AS digest FROM "+quote(t.schema)+'.'+quote(t.name)+' x');result.push(r.rows[0]);}
   return JSON.stringify(result);
  };
  const before=await fingerprint();let blocked=0;
  // ROW EXCLUSIVE is the lock required by INSERT/UPDATE/DELETE. No DML is issued.
  for(const t of tables){
   await probe.query('BEGIN');let expected=false;
   try{await probe.query('LOCK TABLE '+quote(t.schema)+'.'+quote(t.name)+' IN ROW EXCLUSIVE MODE NOWAIT');}
   catch(e){if(e.code!=='55P03')throw e;expected=true;}
   finally{await probe.query('ROLLBACK');}
   if(!expected)throw Error('Writer lock unexpectedly admitted');blocked++;
  }
  if(before!==await fingerprint())throw Error('Protected data changed');
  console.log(JSON.stringify({passed:true,applicationTables:tables.filter(t=>t.schema==='app').length,authTables:tables.filter(t=>t.schema==='auth').length,grantedLocks:locks,writerLocksDenied:blocked,protectedRowsUnchanged:true,rowWritesAttempted:0,excluded:['auth.schema_migrations','storage.*'],release:'ROLLBACK in finally; no locks retained'}));
 }finally{
  await holder.query('ROLLBACK').catch(()=>{});await probe.query('ROLLBACK').catch(()=>{});
  await holder.end().catch(()=>{});await probe.end().catch(()=>{});
 }
}
main().catch(e=>{console.error(JSON.stringify({passed:false,code:e.code||null,reason:/Required|Incomplete|unexpectedly|changed/.test(e.message)?e.message:'Bounded lock/check failed; no row writes issued'}));process.exitCode=1;});
