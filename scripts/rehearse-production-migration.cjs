// Synthetic local rehearsal only. No Production credentials or data are consumed.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'docs/release/production-readonly-baseline.json')));
const url=process.env.TEST_DATABASE_URL;
let target;try{target=new URL(url);}catch{throw Error('Dedicated local TEST_DATABASE_URL required');}
if(target.hostname!=='127.0.0.1'||!target.pathname.endsWith('_test')||process.env.ALLOW_TEST_DATABASE_MUTATION!=='true')throw Error('Local synthetic test gate rejected');
Object.assign(process.env,{DATABASE_URL:url,DATABASE_SSL:'false',NODE_ENV:'test'});
const {getPool,closePool,withTransaction}=require(path.join(root,'server/dist/db/pool'));
const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,sorted(v)])):x;
const same=(a,b)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
const q=async(sql,args=[]) => (await getPool().query(sql,args)).rows;
const results={productionDataCopied:false,realBackupRestoreTest:false,checks:[]};
function check(name,ok,details){results.checks.push({name,passed:!!ok,...details});if(!ok)throw Error(name);}
const catalogSql=`SELECT jsonb_build_object(
 'columns',(select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type,'udt',udt_name,'nullable',is_nullable,'default',column_default) order by table_name,ordinal_position) from information_schema.columns where table_schema='app'),
 'constraints',(select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'kind',c.contype,'validated',c.convalidated,'deferred',c.condeferrable,'definition',pg_get_constraintdef(c.oid,true)) order by c.conrelid::regclass::text,c.conname) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='app'),
 'indexes',(select jsonb_agg(to_jsonb(i) order by indexname) from pg_indexes i where schemaname='app'),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'security_definer',p.prosecdef,'configuration',p.proconfig,'owner',pg_get_userbyid(p.proowner),'definition',pg_get_functiondef(p.oid)) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app' and p.prokind='f'),
 'triggers',(select jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true)) order by t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and not t.tgisinternal)) as metadata`;
const order=(items,key)=>[...(items||[])].sort((a,b)=>key(a).localeCompare(key(b)));
async function snapshot(){
  const tables=[...new Set(baseline.columns.map(c=>c.table))].filter(t=>t!=='schema_migrations');const out={};
  for(const table of tables){
    const columns=baseline.columns.filter(c=>c.table===table).map(c=>'"'+c.column+'"').join(',');
    const rows=await q(`SELECT coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb) AS rows FROM (SELECT ${columns} FROM app."${table}") x`);
    out[table]=crypto.createHash('sha256').update(JSON.stringify(rows[0].rows)).digest('hex');
  }return out;
}
async function main(){
  check('fresh local database has no app schema',(await q("SELECT to_regnamespace('app') AS schema"))[0].schema===null);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aahara-prodprep-'));fs.mkdirSync(path.join(temp,'db/migrations'),{recursive:true});
  // Feed only verified 001-014 to the existing runner; this is not a second migration system.
  for(const entry of baseline.ledger){const source=fs.readFileSync(path.join(root,'server/db/migrations',entry.name));check('source checksum '+entry.name,crypto.createHash('sha256').update(source).digest('hex')===entry.checksum);fs.writeFileSync(path.join(temp,'db/migrations',entry.name),source);}
  process.chdir(temp);const {runMigrations}=require(path.join(root,'server/dist/db/migrationRunner'));await runMigrations('up');
  const local=await withTransaction(async tx=>{await tx.query('SET LOCAL search_path TO pg_catalog');return(await tx.query(catalogSql)).rows[0].metadata;});
  for(const [label,left,right,key] of [
    ['columns',local.columns,baseline.columns,x=>x.table+':'+x.column],
    ['constraints',local.constraints,baseline.catalog.constraints,x=>x.table+':'+x.name],
    ['indexes',local.indexes,baseline.catalog.indexes,x=>x.indexname],
    ['functions',local.functions,baseline.catalog.functions,x=>x.name+':'+x.arguments],
    ['triggers',local.triggers,baseline.catalog.triggers,x=>x.name],
  ]){
    const a=order(left,key),b=order(right,key);const differences=[...new Set([...a.map(key),...b.map(key)])].filter(k=>!same(a.find(x=>key(x)===k),b.find(x=>key(x)===k)));
    check('Production metadata equals fresh 001-014 '+label,differences.length===0,{count:a.length,differences});
  }
  const user=async(role)=> (await q('INSERT INTO app.app_users(auth_user_id,role,display_name) VALUES($1,$2,$3) RETURNING id',[crypto.randomUUID(),role,'Synthetic release rehearsal']))[0].id;
  const admin=await user('ADMIN'),donor=await user('DONOR');
  await q('INSERT INTO app.donors(app_user_id) VALUES($1),($2)',[admin,donor]);
  for(const [i,status] of ['APPROVED','PENDING','DENIED',null].entries()){
    const id=await user('VOLUNTEER');const p=(await q('INSERT INTO app.people(app_user_id,name,phone_e164) VALUES($1,$2,$3) RETURNING id',[id,'Synthetic volunteer','+1555555010'+i]))[0].id;
    const v=(await q('INSERT INTO app.volunteers(person_id,registration_code) VALUES($1,$2) RETURNING id',[p,'PRODPREP-'+crypto.randomUUID()]))[0].id;
    if(status)await q('INSERT INTO app.volunteer_applications(volunteer_id,status,reviewed_at,reviewed_by) VALUES($1,$2,$3,$4)',[v,status,status==='PENDING'?null:new Date(),status==='PENDING'?null:admin]);
  }
  const driverUser=await user('DRIVER');let driver,vehicle;
  await withTransaction(async tx=>{
    vehicle=(await tx.query("INSERT INTO app.vehicles(registration_number,kind,capacity_kg) VALUES('SYNTHETIC-VEHICLE','Mini truck',1000) RETURNING id")).rows[0].id;
    const p=(await tx.query('INSERT INTO app.people(name,phone_e164) VALUES($1,$2) RETURNING id',['Synthetic employee','+15555550200'])).rows[0].id;
    driver=(await tx.query("INSERT INTO app.drivers(person_id,licence_number,licence_expires_on,driver_type,employee_code,created_by) VALUES($1,'SYNTHETIC-LICENCE','2099-12-31','EMPLOYEE','SYNTHETIC-EMPLOYEE',$2) RETURNING id",[p,admin])).rows[0].id;
    await tx.query('UPDATE app.vehicles SET assigned_driver_id=$1 WHERE id=$2',[driver,vehicle]);
    await tx.query('UPDATE app.people SET app_user_id=$1 WHERE id=$2',[driverUser,p]);
  });
  const donorId=(await q('SELECT id FROM app.donors WHERE app_user_id=$1',[donor]))[0].id;
  for(const [i,status] of ['PENDING','EN_ROUTE','FOOD_COLLECTED'].entries()){
    const food=(await q("INSERT INTO app.food_requests(donor_id,source_name,source_type,pickup_address,prepared_at,ready_at,pickup_deadline,donor_safety_declaration,contact_name,contact_phone_e164) VALUES($1,'Synthetic source','Test','Synthetic address',now()-interval '3 days',now()-interval '3 days',now()-interval '1 day',true,'Synthetic contact','+15555550199') RETURNING id",[donorId]))[0].id;
    const pickup=(await q("INSERT INTO app.pickups(food_request_id,window_starts_at,window_ends_at,delivery_address) VALUES($1,now()-($2*interval '1 hour'),now()-($3*interval '1 hour'),'Synthetic destination') RETURNING id",[food,10+i*2,9+i*2]))[0].id;
    await q('INSERT INTO app.assignments(pickup_id,driver_id,vehicle_id,role,status,driver_acceptance,driver_responded_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[pickup,driver,vehicle,'Pickup crew',status,status==='PENDING'?'PENDING':'ACCEPTED',status==='PENDING'?null:new Date()]);
  }
  const before=await snapshot();const fifteen=fs.readFileSync(path.join(root,'server/db/migrations/015_final_pilot.sql'));check('015 exact reviewed checksum',crypto.createHash('sha256').update(fifteen).digest('hex')===baseline.migrationComparison.pendingProduction[0].checksum);
  fs.writeFileSync(path.join(temp,'db/migrations/015_final_pilot.sql'),fifteen);await runMigrations('up');
  check('all pre-existing synthetic rows unchanged across 015',same(before,await snapshot()),{tables:Object.keys(before).length});
  const states=await q('SELECT status,identity_required FROM app.volunteer_applications ORDER BY status');check('old approval states grandfathered',states.length===3&&states.every(x=>x.identity_required===false));
  const id=await user('VOLUNTEER');const person=(await q("INSERT INTO app.people(app_user_id,name) VALUES($1,'Synthetic new applicant') RETURNING id",[id]))[0].id;
  const volunteer=(await q('INSERT INTO app.volunteers(person_id,registration_code) VALUES($1,$2) RETURNING id',[person,'NEW-'+crypto.randomUUID()]))[0].id;
  const a=(await q('INSERT INTO app.volunteer_applications(volunteer_id) VALUES($1) RETURNING identity_required',[volunteer]))[0];check('new applications require proof',a.identity_required===true);
  let blocked=false;try{await q("UPDATE app.volunteer_applications SET status='APPROVED',reviewed_at=now(),reviewed_by=$2 WHERE volunteer_id=$1",[volunteer,admin]);}catch(e){blocked=e.code==='23514'&&/IDENTITY_VERIFICATION_REQUIRED/.test(e.message);}check('SQL approval protection blocks unverified new proof',blocked);
  const data=(await q("SELECT has_schema_privilege('aaharaconnect_api','app','CREATE') AS ddl,has_table_privilege('aaharaconnect_api','app.schema_migrations','SELECT') AS ledger,has_table_privilege('aaharaconnect_api','app.identity_review_events','UPDATE') AS rewrite_audit"))[0];check('runtime group cannot create/read ledger/rewrite audit',!data.ddl&&!data.ledger&&!data.rewrite_audit);
  const readable=await withTransaction(async tx=>{
    await tx.query('SET LOCAL ROLE aaharaconnect_api');
    const tables=(await tx.query("SELECT tablename FROM pg_tables WHERE schemaname='app' AND tablename<>'schema_migrations' ORDER BY tablename")).rows;
    for(const {tablename} of tables)await tx.query(`SELECT count(*) FROM app."${tablename}"`);
    const applications=(await tx.query('SELECT count(*)::int AS n FROM app.volunteer_applications')).rows[0].n;
    await tx.query('UPDATE app.volunteer_applications SET status=status WHERE false');
    return {tables:tables.length,applications};
  });
  check('non-owner runtime group reads all application tables through RLS',readable.tables===42&&readable.applications===4,readable);
  check('only 015 appended to ledger',(await q('SELECT count(*)::int AS n FROM app.schema_migrations'))[0].n===15);
  process.chdir(root);fs.writeFileSync(path.join(root,'docs/release/synthetic-migration-rehearsal.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({checks:results.checks.length,passed:results.checks.filter(x=>x.passed).length,productionDataCopied:false,realBackupRestoreTest:false}));
}
main().catch(e=>{process.chdir(root);results.failure=e.message;fs.writeFileSync(path.join(root,'docs/release/synthetic-migration-rehearsal.json'),JSON.stringify(results,null,2));console.error(e.message);process.exitCode=1;}).finally(()=>closePool());
