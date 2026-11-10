// Synthetic localhost-only integration test. Never consumes Production credentials.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const {protectedTables,fingerprints}=require('./maintenance-projection.cjs');
const {Client}=require('pg');const root=path.resolve(__dirname,'..');
const database='aahara_orchestration_'+Date.now()+'_test';
const url='postgresql://postgres@127.0.0.1:55439/'+database;
Object.assign(process.env,{DATABASE_URL:url,DATABASE_SSL:'false',NODE_ENV:'test'});
let runMigrations;
const {getPool,closePool}=require('../server/dist/db/pool');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aahara-orchestration-source-'));
const check=(ok,label)=>{if(!ok)throw Error(label);console.log('PASS '+label);};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 const admin=new Client({connectionString:url.replace(database,'postgres')});await admin.connect();
 await admin.query('CREATE DATABASE '+database);await admin.end();
 const probe=new Client({connectionString:url}),bridge=new Client({connectionString:url});await probe.connect();await bridge.connect();
 try{
  for(const name of ['anon','authenticated','service_role'])if(!(await probe.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[name])).rowCount)await probe.query('CREATE ROLE '+name+' NOLOGIN');
  fs.mkdirSync(path.join(temp,'db/migrations'),{recursive:true});
  for(const n of fs.readdirSync(path.join(root,'server/db/migrations')).filter(n=>/^0(0[1-9]|1[0-4])_.*\.sql$/.test(n)))fs.copyFileSync(path.join(root,'server/db/migrations',n),path.join(temp,'db/migrations',n));
  process.chdir(temp);({runMigrations}=require(path.join(root,'server/dist/db/migrationRunner')));await runMigrations('up');
  await probe.query('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, marker text); INSERT INTO auth.users VALUES(gen_random_uuid(),\'synthetic\')');
  const sql=fs.readFileSync(path.join(root,'server/db/migrations/015_final_pilot.sql'));
  check(hash(sql)==='28d70f15fc4e45e18f85130fbb76abdbc0a2a1d881a8aeb2fca9f1c8ab0788e1','approved015 checksum');
  fs.writeFileSync(path.join(temp,'db/migrations/015_final_pilot.sql'),sql);
  async function denied(client,statement){await client.query('BEGIN');let code;try{await client.query(statement);}catch(e){code=e.code;}finally{await client.query('ROLLBACK');}check(code==='55P03','independent writer blocked');}
  const expectedPending={'015_final_pilot.sql':hash(sql)};
  let beforePid, originalTables, originalRows;
  const before=async tx=>{
   originalTables=await protectedTables(tx);
   check(originalTables.every(t=>Array.isArray(t.columns)),'catalog columns have portable text-array type');
   originalRows=await fingerprints(tx,originalTables);
   beforePid=(await tx.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   await tx.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s'");
   const names=(await tx.query("SELECT quote_ident(n.nspname)||'.'||quote_ident(c.relname) name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','auth') AND c.relkind='r' ORDER BY 1")).rows.map(x=>x.name);
   await tx.query('LOCK TABLE '+names.join(',')+' IN SHARE MODE NOWAIT');
   await denied(probe,'LOCK app.app_users IN ROW EXCLUSIVE MODE NOWAIT');
   const snap=(await tx.query('SELECT pg_export_snapshot() snap')).rows[0].snap;
   const dump=cp.spawnSync('docker',['exec','aahara-orchestration-synthetic-20261110','pg_dump','-h','/tmp','-U','postgres','-d',database,'-Fc','--snapshot='+snap],{maxBuffer:16*1024*1024});
   check(dump.status===0&&dump.stdout.subarray(0,5).toString()==='PGDMP','pg_dump snapshot succeeds under held locks');
   dump.stdout.fill(0);
  };
  try{await runMigrations('up',{expectedPending,before,after:async()=>{throw Error('synthetic failure before commit');}});throw Error('Expected rollback');}
  catch(e){check(e.message==='synthetic failure before commit','verification failure propagates');}
  check((await probe.query("SELECT to_regclass('app.notification_outbox') relation")).rows[0].relation===null,'015 transactional DDL rolls back completely');
  check((await probe.query('SELECT count(*)::int n FROM app.schema_migrations')).rows[0].n===14,'rollback preserves ledger14');
  await runMigrations('up',{expectedPending,before,after:async tx=>{
   check((await tx.query('SELECT pg_backend_pid() pid')).rows[0].pid===beforePid,'same migration-owning session');
   const after=await fingerprints(tx,originalTables);
   check(originalRows.every((r,i)=>r.name==='schema_migrations'||JSON.stringify(r)===JSON.stringify(after[i])),'original-column preservation comparison survives015');
   await bridge.query("BEGIN; SET LOCAL lock_timeout='3s'");
   await bridge.query('LOCK auth.users IN SHARE MODE NOWAIT');
   await denied(probe,'LOCK auth.users IN ROW EXCLUSIVE MODE NOWAIT');
  }});
  check((await probe.query('SELECT count(*)::int n FROM app.schema_migrations')).rows[0].n===15,'015 commits ledger15');
  await denied(probe,'LOCK auth.users IN ROW EXCLUSIVE MODE NOWAIT');
  check((await bridge.query('SELECT marker FROM auth.users')).rows[0].marker==='synthetic','Auth bridge and data survive migration commit');
  await bridge.query('ROLLBACK');
  await probe.query('BEGIN; LOCK auth.users IN ROW EXCLUSIVE MODE NOWAIT; ROLLBACK');
  check(true,'explicit bridge release restores writer access');
 }finally{await bridge.query('ROLLBACK').catch(()=>{});await probe.end();await bridge.end();await closePool();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>{
 process.chdir(root);if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('aahara-orchestration-source-'))throw Error('Temporary cleanup path rejected');fs.rmSync(temp,{recursive:true,force:true});
});
