// Local-only isolated rehearsal of the approved encrypted backup. Never migrates.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {decrypt,encrypt,protectedKey,sha,image,base}=require('./production-recovery.cjs');
const dir=path.resolve(process.argv[2]||'');
if(path.dirname(dir)!==path.resolve(base)||!path.basename(dir).startsWith('pre-015-'))throw Error('Private archive path gate');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
if(manifest.project!=='pyzyxgpcfwpcqyqrihuo')throw Error('Project gate');
const name='aahara-production-restore-'+path.basename(dir).slice(8).toLowerCase();
const key=protectedKey(manifest.keyFile);
let started=false,phase='archive-authentication';
const report={project:manifest.project,backupSha256:manifest.sha256,startedUtc:new Date().toISOString(),migration015Applied:false,checks:[],limitations:['Local postgres remains bootstrap superuser; managed role login passwords are not exported.','No Auth/SMTP/Storage HTTP services are started; cryptographic record integrity is checked, not live login.']};
function check(label,ok,extra={}){report.checks.push({name:label,passed:!!ok,...extra});if(!ok)throw Error('Verification check failed');}
function docker(args,input){const r=cp.spawnSync('docker',args,{input,maxBuffer:64*1024*1024,timeout:120000});if(r.status!==0){fs.writeFileSync(path.join(dir,'restore-diagnostic.gcm'),encrypt(Buffer.concat([r.stderr||Buffer.alloc(0),Buffer.from(r.error?.code||'')]),key));throw Error('Local tool failed');}return r.stdout;}
function sql(query){return docker(['exec','-i',name,'psql','-X','-v','ON_ERROR_STOP=1','-h','/tmp','-U','postgres','-d','postgres','-At'],Buffer.from(query));}
const quote=x=>'"'+x.replace(/"/g,'""')+'"';
const literal=x=>"'"+String(x).replace(/'/g,"''")+"'";
async function main(){
  const ciphertext=fs.readFileSync(path.join(dir,manifest.archive));check('encrypted archive SHA256',sha(ciphertext)===manifest.sha256);
  const archive=decrypt(ciphertext,key);check('AES-GCM authenticates and plaintext checksum matches',sha(archive)===manifest.plaintextArchiveSha256);
  const encryptedMetadata=fs.readFileSync(path.join(dir,'snapshot-metadata.json.gcm'));check('encrypted metadata SHA256',sha(encryptedMetadata)===manifest.metadataSha256);
  const metadata=JSON.parse(decrypt(encryptedMetadata,key));
  if(manifest.restoreImageId)check('local restore image identity',docker(['image','inspect',image,'--format','{{.Id}}']).toString().trim()===manifest.restoreImageId);
  phase='isolated-local-start';
  docker(['run','-d','--name',name,'--network','none','--log-driver','none','--read-only','--user','postgres','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','1g','--memory-swap','1g','--pids-limit','128','--tmpfs','/tmp:rw,nosuid,nodev,size=768m,mode=1777','--entrypoint','sh',image,'-c','initdb -D /tmp/pgdata -U postgres -A trust --no-locale >/tmp/init.log 2>&1 && exec postgres -D /tmp/pgdata -c listen_addresses= -c unix_socket_directories=/tmp -c max_connections=20']);started=true;
  for(let i=0;i<30;i++){const r=cp.spawnSync('docker',['exec',name,'pg_isready','-h','/tmp','-U','postgres'],{stdio:'ignore'});if(r.status===0)break;if(i===29)throw Error('Local readiness timeout');await new Promise(r=>setTimeout(r,500));}
  const config=JSON.parse(docker(['inspect',name]))[0];check('network disabled, no published ports, RAM-only data and no swap allocation',config.HostConfig.NetworkMode==='none'&&Object.keys(config.HostConfig.PortBindings||{}).length===0&&config.HostConfig.MemorySwap===config.HostConfig.Memory&&config.HostConfig.Tmpfs['/tmp'].includes('768m')&&config.HostConfig.ReadonlyRootfs);
  phase='archive-inspection';
  docker(['exec','-i',name,'sh','-c','umask 077; cat > /tmp/database.dump'],archive);archive.fill(0);
  const toc=docker(['exec',name,'pg_restore','--list','/tmp/database.dump']);fs.writeFileSync(path.join(dir,'archive-toc.gcm'),encrypt(toc,key));
  const tocText=toc.toString();check('archive contains app, Auth data, Storage data and ledger',/TABLE DATA app app_users/.test(tocText)&&/TABLE DATA auth users/.test(tocText)&&/TABLE DATA storage objects/.test(tocText)&&/TABLE DATA app schema_migrations/.test(tocText));
  const existing=sql('SELECT rolname FROM pg_roles;').toString().trim().split('\n');
  const roles=metadata.roles.filter(r=>!existing.includes(r.rolname));
  sql(roles.map(r=>`CREATE ROLE ${quote(r.rolname)} ${r.rolsuper?'SUPERUSER':'NOSUPERUSER'} ${r.rolinherit?'INHERIT':'NOINHERIT'} ${r.rolcreaterole?'CREATEROLE':'NOCREATEROLE'} ${r.rolcreatedb?'CREATEDB':'NOCREATEDB'} ${r.rolcanlogin?'LOGIN':'NOLOGIN'} ${r.rolreplication?'REPLICATION':'NOREPLICATION'} ${r.rolbypassrls?'BYPASSRLS':'NOBYPASSRLS'} CONNECTION LIMIT ${r.rolconnlimit};`).join('\n'));
  // Reconstruct membership for object-owner/ACL restoration; no role passwords.
  sql(metadata.memberships.map(m=>`GRANT ${quote(m.role)} TO ${quote(m.member)} WITH ADMIN ${m.admin_option?'TRUE':'FALSE'}, INHERIT ${m.inherit_option?'TRUE':'FALSE'}, SET ${m.set_option?'TRUE':'FALSE'};`).join('\n'));
  // set_config preserves list-valued GUC syntax (not a single quoted list element).
  sql('BEGIN READ WRITE;\n'+metadata.roles.flatMap(r=>(r.rolconfig||[]).map(setting=>{const i=setting.indexOf('=');const parameter=setting.slice(0,i);return `SELECT pg_catalog.set_config(${literal(parameter)},${literal(setting.slice(i+1))},true); ALTER ROLE ${quote(r.rolname)} SET ${quote(parameter)} FROM CURRENT;`;})).join('\n')+'\nCOMMIT;');
  if(manifest.clusterSettingsSha256){
    const bytes=fs.readFileSync(path.join(dir,'cluster-settings.json.gcm'));check('encrypted cluster settings SHA256',sha(bytes)===manifest.clusterSettingsSha256);
    const cluster=JSON.parse(decrypt(bytes,key));
    sql('BEGIN READ WRITE;\n'+cluster.settings.filter(x=>x.database==='postgres'||!x.database).flatMap(r=>(r.setconfig||[]).map(setting=>{const i=setting.indexOf('=');const name=setting.slice(0,i),parameter=quote(name);const prepare=`SELECT pg_catalog.set_config(${literal(name)},${literal(setting.slice(i+1))},true); `;return prepare+(r.role?`ALTER ROLE ${quote(r.role)}${r.database?' IN DATABASE postgres':''} SET ${parameter} FROM CURRENT;`:`ALTER DATABASE postgres SET ${parameter} FROM CURRENT;`);})).join('\n')+'\nCOMMIT;');
  }
  phase='restore';
  docker(['exec',name,'pg_restore','--exit-on-error','--host=/tmp','--username=postgres','--dbname=postgres','/tmp/database.dump']);
  console.log(JSON.stringify({phase:'restore-complete',network:'none'}));
  phase='preservation-verification';
  const local=[];
  for(const t of metadata.tables){const ident=quote(t.schema)+'.'+quote(t.name);const r=JSON.parse(sql(`SELECT json_build_object('count',count(*)::int,'digest',md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY md5(to_jsonb(x)::text)),''))) FROM ${ident} x;`).toString());local.push({...t,...r});}
  const diff=metadata.tables.filter((t,i)=>t.count!==local[i].count||t.digest!==local[i].digest).map(t=>t.schema+'.'+t.name);
  check('every source table count and full-row digest preserved',diff.length===0,{tables:local.length,differingTables:diff});
  const ledger=JSON.parse(sql("SELECT json_agg(x ORDER BY name) FROM (SELECT name,checksum FROM app.schema_migrations) x;").toString());check('all 14 migration names/checksums preserved; 015 absent',ledger.length===14&&JSON.stringify(ledger)===JSON.stringify(metadata.ledger));
  const constraints=JSON.parse(sql(`SELECT json_agg(x ORDER BY schema,relation,conname) FROM (SELECT n.nspname AS schema,c.conrelid::regclass::text AS relation,c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema') x;`).toString());
  check('constraint definitions and validation states preserved',JSON.stringify(constraints)===JSON.stringify(metadata.constraints),{constraints:constraints.length});
  const links=JSON.parse(sql('SELECT json_build_object(\'missing\',count(*)::int) FROM app.app_users a LEFT JOIN auth.users u ON u.id=a.auth_user_id WHERE u.id IS NULL;').toString());check('application Auth relationships preserved',links.missing===metadata.links.missing&&links.missing===0);
  const restoredRoles=JSON.parse(sql('SELECT json_agg(x ORDER BY rolname) FROM (SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls,rolconfig FROM pg_roles) x;').toString());
  const attributes=['rolname','rolsuper','rolinherit','rolcreaterole','rolcreatedb','rolcanlogin','rolreplication','rolconnlimit','rolbypassrls'];
  const roleDifferences=metadata.roles.filter(r=>r.rolname!=='postgres').map(r=>{const a=restoredRoles.find(x=>x.rolname===r.rolname);return {role:r.rolname,fields:attributes.filter(k=>JSON.stringify(a?.[k])!==JSON.stringify(r[k]))};}).filter(x=>x.fields.length);
  check('source role attributes/configuration preserved except isolated bootstrap postgres',roleDifferences.length===0,{sourceRoles:metadata.roles.length,roleDifferences});
  const pairs=[];
  for(const r of metadata.roles){const a=restoredRoles.find(x=>x.rolname===r.rolname);const settings=values=>Object.fromEntries((values||[]).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));const left=settings(r.rolconfig),right=settings(a?.rolconfig);check('role setting keys preserved: '+r.rolname,JSON.stringify(Object.keys(left).sort())===JSON.stringify(Object.keys(right).sort()));for(const parameter of Object.keys(left))pairs.push([parameter,left[parameter],right[parameter]]);}
  // PostgreSQL canonicalizes time units/list formatting in FROM CURRENT. Compare
  // normalized GUC values, not spelling (e.g. 60000 and 1min).
  const normalized=JSON.parse(sql(`SELECT json_agg(pg_catalog.set_config(k,a,true)=pg_catalog.set_config(k,b,true)) FROM (VALUES ${pairs.map(row=>'('+row.map(literal).join(',')+')').join(',')}) v(k,a,b);`).toString());
  check('all role setting values semantically preserved',normalized.every(Boolean),{settings:pairs.length});
  const memberships=JSON.parse(sql('SELECT json_agg(x ORDER BY role,member) FROM (SELECT r.rolname AS role,m.rolname AS member,a.admin_option,a.inherit_option,a.set_option FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member) x;').toString());
  check('source membership privileges preserved',JSON.stringify(memberships)===JSON.stringify(metadata.memberships.map(({grantor,...rest})=>rest)),{memberships:metadata.memberships.length});
  const counts={};for(const n of ['auth.users','auth.identities','app.app_users','app.volunteers','app.volunteer_applications','app.donors','app.drivers','app.vehicles','app.food_requests','app.pickups','app.assignments','storage.buckets','storage.objects'])counts[n]=local.find(t=>t.schema+'.'+t.name===n)?.count;
  report.counts=counts;report.appRoles=metadata.appRoles;
  check('Auth users and application role counts match previous read-only baseline',counts['auth.users']===14&&counts['app.app_users']===11&&JSON.stringify(metadata.appRoles)===JSON.stringify([{role:'ADMIN',count:1},{role:'DONOR',count:5},{role:'DRIVER',count:1},{role:'VOLUNTEER',count:4}]));
  check('all Auth fields including password hashes preserved',local.find(t=>t.schema==='auth'&&t.name==='users').digest===metadata.tables.find(t=>t.schema==='auth'&&t.name==='users').digest);
  report.restorationSucceeded=true;report.completedUtc=new Date().toISOString();
}
main().catch(e=>{report.restorationSucceeded=false;report.failedPhase=phase;console.error(JSON.stringify({restoreFailed:true,phase,error:e.message}));process.exitCode=1;}).finally(()=>{
  if(started){try{docker(['rm','-f','-v',name]);report.disposableContainerRemoved=true;report.disposableData='PostgreSQL data/WAL/archive were only on container tmpfs; removed with container. Physical host-memory erasure is not independently attestable.';}catch{report.disposableContainerRemoved=false;process.exitCode=1;}}
  fs.writeFileSync(path.join(dir,'restore-report.json'),JSON.stringify(report,null,2));
  manifest.restoreVerified=report.restorationSucceeded===true&&report.disposableContainerRemoved===true;fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
  key.fill(0);console.log(JSON.stringify(report));
});
