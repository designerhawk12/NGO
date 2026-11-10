// Approved Production backup / LOCAL recovery only. No release or migration actions.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const project = 'pyzyxgpcfwpcqyqrihuo';
const base = path.join(process.env.LOCALAPPDATA || require('node:os').homedir(), 'AahaaraConnect-Production');
const keyRoot = path.join(process.env.LOCALAPPDATA || require('node:os').homedir(), 'AahaaraConnect-RecoveryKeys');
const image = 'public.ecr.aws/supabase/postgres:17.11.0.006';
const magic = Buffer.from('AAH-GCM1');
function ps(script, input) {
  const env = {...process.env}; delete env.PSModulePath;
  const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { input, env, maxBuffer: 1024 * 1024 });
  if (r.status !== 0) throw Error('Windows key/ACL operation failed');
  return r.stdout;
}
function restrict(dir) {
  if (!path.resolve(dir).startsWith(path.resolve(process.env.LOCALAPPDATA) + path.sep)) throw Error('Private path gate');
  fs.mkdirSync(dir, { recursive: true });
  ps(`$ErrorActionPreference='Stop'; $p='${dir.replace(/'/g,"''")}'; $a=New-Object System.Security.AccessControl.DirectorySecurity; $a.SetAccessRuleProtection($true,$false); $s=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $a.SetOwner($s); foreach($i in @($s,(New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')))) { $r=New-Object System.Security.AccessControl.FileSystemAccessRule($i,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $a.AddAccessRule($r) }; Set-Acl -LiteralPath $p -AclObject $a`);
}
function protectedKey(file, raw) {
  const common = `Add-Type -AssemblyName System.Security; $ErrorActionPreference='Stop'; $p='${file.replace(/'/g,"''")}';`;
  if (raw) {
    ps(common + `$m=New-Object System.IO.MemoryStream; [Console]::OpenStandardInput().CopyTo($m); $b=[System.Security.Cryptography.ProtectedData]::Protect($m.ToArray(),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); $f=[IO.File]::Open($p,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None); try { $f.Write($b,0,$b.Length) } finally { $f.Dispose() }`, raw);
  }
  return ps(common + `$b=[System.Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($p),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::OpenStandardOutput().Write($b,0,$b.Length)`);
}
function encrypt(bytes, key) {
  const nonce = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, nonce);
  c.setAAD(magic);
  return Buffer.concat([magic, nonce, c.update(bytes), c.final(), c.getAuthTag()]);
}
function decrypt(bytes, key) {
  if (!bytes.subarray(0, 8).equals(magic)) throw Error('Archive format');
  const d = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(8, 20));
  d.setAAD(magic); d.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([d.update(bytes.subarray(20, -16)), d.final()]);
}
function sha(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function config() {
  const text = fs.readFileSync(path.join(base, 'production-readonly.env'), 'utf8').trim();
  const raw = text.slice(text.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
  const u = new URL(raw);
  if (u.protocol !== 'postgresql:' || u.username !== 'postgres.' + project || u.hostname !== 'aws-0-eu-west-2.pooler.supabase.com' || u.port !== '5432' || u.pathname !== '/postgres' || !u.password) throw Error('Verified Production target gate');
  if (/\r|\n/.test(decodeURIComponent(u.password))) throw Error('Credential transport gate');
  return { raw, u, ca: path.join(base, 'prod-ca.crt') };
}
async function snapshot(client) {
  const tables = (await client.query(`SELECT n.nspname AS schema,c.relname AS name,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','m') ORDER BY 1,2`)).rows;
  const records = [];
  for (const t of tables) {
    const ident = '"' + t.schema.replace(/"/g,'""') + '"."' + t.name.replace(/"/g,'""') + '"';
    // Digests include Auth hashes and every backed-up row without exposing contents.
    const r = (await client.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY md5(to_jsonb(x)::text)),'')) AS digest FROM ${ident} x`)).rows[0];
    records.push({ ...t, ...r });
  }
  return {
    tables: records,
    ledger: (await client.query('SELECT name,checksum FROM app.schema_migrations ORDER BY name')).rows,
    roles: (await client.query('SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls,rolconfig FROM pg_roles ORDER BY rolname')).rows,
    memberships: (await client.query('SELECT r.rolname AS role,m.rolname AS member,g.rolname AS grantor,a.admin_option,a.inherit_option,a.set_option FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor ORDER BY 1,2')).rows,
    clusterSettings: (await client.query('SELECT r.rolname AS role,d.datname AS database,s.setconfig FROM pg_db_role_setting s LEFT JOIN pg_roles r ON r.oid=s.setrole LEFT JOIN pg_database d ON d.oid=s.setdatabase ORDER BY 1,2')).rows,
    constraints: (await client.query(`SELECT n.nspname AS schema,c.conrelid::regclass::text AS relation,c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' ORDER BY 1,2,3`)).rows,
    extensions: (await client.query('SELECT extname,extversion FROM pg_extension ORDER BY extname')).rows,
    appRoles: (await client.query('SELECT role,count(*)::int AS count FROM app.app_users GROUP BY role ORDER BY role')).rows,
    links: (await client.query('SELECT count(*)::int AS missing FROM app.app_users a LEFT JOIN auth.users u ON u.id=a.auth_user_id WHERE u.id IS NULL')).rows[0],
    buckets: (await client.query('SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets ORDER BY id')).rows,
  };
}
async function backup() {
  const { Client } = require('pg');
  const cfg = config();
  const id = new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'Z');
  const dir = path.join(base, 'pre-015-' + id), keyFile = path.join(keyRoot, 'production-' + id + '.dpapi');
  if(fs.existsSync(dir)||fs.existsSync(keyFile))throw Error('Existing recovery path preserved; choose a fresh timestamp');
  restrict(dir); restrict(keyRoot);
  const rawKey = crypto.randomBytes(32); const key = protectedKey(keyFile, rawKey);
  if (!crypto.timingSafeEqual(key,rawKey)) throw Error('Key recovery test'); rawKey.fill(0);
  if (!decrypt(encrypt(Buffer.from('recovery-self-test'), key),key).equals(Buffer.from('recovery-self-test'))) throw Error('Encryption test');
  const client = new Client({ connectionString: cfg.raw, ssl: {rejectUnauthorized:true,ca:fs.readFileSync(cfg.ca,'utf8')}, connectionTimeoutMillis:10000 });
  const started = new Date().toISOString();
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if ((await client.query("SELECT current_setting('transaction_read_only') AS ro")).rows[0].ro !== 'on') throw Error('Read-only transaction gate');
    const snap = (await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
    const metadata = await snapshot(client);
    console.log(JSON.stringify({phase:'snapshot',tables:metadata.tables.length,transactionReadOnly:true}));
    // Password enters only the child's stdin, never Docker config, command line or logs.
    const args=['run','--rm','-i','--log-driver','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--mount',`type=bind,source=${cfg.ca},target=/prod-ca.crt,readonly`,'--entrypoint','sh',image,'-c',
      'IFS= read -r PGPASSWORD; export PGPASSWORD; export PGSSLMODE=verify-full PGSSLROOTCERT=/prod-ca.crt; exec pg_dump --host="$1" --port=5432 --username="$2" --dbname=postgres --format=custom --snapshot="$3" --lock-wait-timeout=15000',
      'backup',cfg.u.hostname,decodeURIComponent(cfg.u.username),snap];
    const r = cp.spawnSync('docker',args,{input:Buffer.from(decodeURIComponent(cfg.u.password)+'\n'),maxBuffer:256*1024*1024,timeout:180000});
    if(r.status!==0) {fs.writeFileSync(path.join(dir,'failure-details.gcm'),encrypt(Buffer.concat([r.stderr||Buffer.alloc(0),Buffer.from(String(r.error?.code||''))]),key));throw Error('pg_dump failed; diagnostic encrypted privately');}
    if(r.stderr.length)fs.writeFileSync(path.join(dir,'dump-warnings.gcm'),encrypt(r.stderr,key));
    if(r.stdout.subarray(0,5).toString()!=='PGDMP')throw Error('Archive signature');
    const encrypted = encrypt(r.stdout,key);fs.writeFileSync(path.join(dir,'database.dump.gcm'),encrypted,{flag:'wx'});
    fs.writeFileSync(path.join(dir,'snapshot-metadata.json.gcm'),encrypt(Buffer.from(JSON.stringify(metadata)),key),{flag:'wx'});
    const clusterBytes=encrypt(Buffer.from(JSON.stringify({capturedUtc:started,settings:metadata.clusterSettings})),key);
    fs.writeFileSync(path.join(dir,'cluster-settings.json.gcm'),clusterBytes,{flag:'wx'});
    const manifest={project,startedUtc:started,completedUtc:new Date().toISOString(),transactionReadOnly:true,snapshotConsistent:true,archive:'database.dump.gcm',sha256:sha(encrypted),plaintextArchiveSha256:sha(r.stdout),encryptedBytes:encrypted.length,encryption:'AES-256-GCM; 96-bit nonce; 128-bit tag; authenticated AAH-GCM1 header',keyFile,keyProtection:'Windows DPAPI CurrentUser; separate owner/SYSTEM-only directory',scope:'Full pg_dump database archive, including app/Auth/Storage metadata, objects, owners/ACLs and extensions; separate role attributes/memberships; no role login password hashes',metadataSha256:sha(fs.readFileSync(path.join(dir,'snapshot-metadata.json.gcm'))),restoreVerified:false,tableCount:metadata.tables.length};
    manifest.clusterSettingsSha256=sha(clusterBytes);
    fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
    r.stdout.fill(0);
    await client.query('ROLLBACK');
    console.log(JSON.stringify({phase:'encrypted-backup-complete',directory:dir,...manifest}));
  } finally {key.fill(0);await client.end();}
}
if(require.main===module){if(process.argv[2]!=='backup')throw Error('Explicit backup action required');backup().catch(e=>{console.error(JSON.stringify({failed:true,error:e.message.startsWith('pg_dump failed')?e.message:'Recovery safety/tooling check failed',code:e.code||null}));process.exitCode=1;});}
module.exports={decrypt,encrypt,protectedKey,sha,image,base,snapshot,config};
