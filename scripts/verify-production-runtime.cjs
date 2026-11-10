// Read-only checker. Resolve protected object IDs as admin, test privileges as runtime.
const fs=require('node:fs');const {Client}=require('pg');const {config}=require('./production-recovery.cjs');
async function verify(){
 const cfg=config(),options={ssl:{rejectUnauthorized:true,ca:fs.readFileSync(cfg.ca,'utf8')},connectionTimeoutMillis:10000};
 const admin=new Client({...options,connectionString:cfg.raw});let runtime;
 try{
  await admin.connect();
  const ids=(await admin.query("SELECT 'app.schema_migrations'::regclass::oid ledger,'auth.users'::regclass::oid authusers,'app.identity_review_events'::regclass::oid audit")).rows[0];
  const attributes=(await admin.query("SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname='aaharaconnect_runtime'")).rows[0];
  const raw=fs.readFileSync('C:/Users/desig/AppData/Local/AahaaraConnect-Production/production-runtime.env','utf8').trim().slice('DATABASE_URL='.length);
  const url=new URL(raw);if(url.username!=='aaharaconnect_runtime.pyzyxgpcfwpcqyqrihuo'||url.hostname!==cfg.u.hostname)throw Error('Runtime target gate');
  runtime=new Client({...options,connectionString:raw});await runtime.connect();
  const p=(await runtime.query("SELECT current_user,session_user,has_schema_privilege(current_user,'app','USAGE') app_usage,has_schema_privilege(current_user,'app','CREATE') app_create,has_schema_privilege(current_user,'auth','USAGE') auth_usage,has_table_privilege(current_user,$1::oid,'SELECT') ledger_read,has_table_privilege(current_user,$2::oid,'SELECT') auth_read,has_table_privilege(current_user,$3::oid,'UPDATE') audit_rewrite",[ids.ledger,ids.authusers,ids.audit])).rows[0];
  if(!attributes?.rolcanlogin||['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls'].some(k=>attributes[k])||p.current_user!=='aaharaconnect_runtime'||!p.app_usage||['app_create','auth_usage','ledger_read','auth_read','audit_rewrite'].some(k=>p[k]))throw Error('Runtime privilege gate');
  await runtime.query('SELECT id FROM app.app_users LIMIT 0');await runtime.query('SELECT volunteer_id FROM app.volunteer_identity_documents LIMIT 0');
  return {passed:true,actualTlsRuntimeConnection:true,attributes,privileges:p};
 }finally{if(runtime)await runtime.end();await admin.end();}
}
if(require.main===module)verify().then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(JSON.stringify({passed:false,code:e.code||null}));process.exitCode=1;});
module.exports={verify};
