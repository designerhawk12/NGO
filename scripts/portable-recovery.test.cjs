const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {inventory}=require('./portable-recovery.cjs');
test('inventory strips private locators and rejects corrupted companion bytes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-portable-'));
 try{
  const m={project:'pyzyxgpcfwpcqyqrihuo',archive:'database.dump.gcm',keyFile:'DO-NOT-EXPORT',unknownSecret:'DO-NOT-EXPORT'};
  for(const [name,field] of [['database.dump.gcm','sha256'],['snapshot-metadata.json.gcm','metadataSha256'],['cluster-settings.json.gcm','clusterSettingsSha256']]){
   const b=crypto.randomBytes(64);fs.writeFileSync(path.join(dir,name),b);m[field]=crypto.createHash('sha256').update(b).digest('hex');
  }m.encryptedBytes=64;fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(m));
  assert(!JSON.stringify(inventory(dir)).includes('DO-NOT-EXPORT'));
  fs.writeFileSync(path.join(dir,'snapshot-metadata.json.gcm'),Buffer.alloc(64));assert.throws(()=>inventory(dir));
 }finally{for(const n of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,n));fs.rmdirSync(dir);}
});
test('portable pipe accepts only exact binary key length without exposing bytes',()=>{
 const script="const k=require('./scripts/portable-recovery.cjs').readKeyFromPipe(); console.log(k.length); k.fill(0)";
 for(const n of [0,31,32,33,64]){const r=cp.spawnSync(process.execPath,['-e',script],{input:Buffer.alloc(n,123)});assert.equal(r.status===0,n===32);if(n===32)assert.equal(r.stdout.toString().trim(),'32');}
});
test('recovery crypto loads without Windows profile and rejects wrong synthetic key',()=>{
 const r=cp.spawnSync(process.execPath,['-e',"const c=require('./scripts/production-recovery.cjs');const k=Buffer.alloc(32,7);const b=c.encrypt(Buffer.from('synthetic'),k);if(c.decrypt(b,k).toString()!=='synthetic')process.exit(1);try{c.decrypt(b,Buffer.alloc(32));process.exit(2)}catch{}"],{env:{...process.env,LOCALAPPDATA:''}});assert.equal(r.status,0);
});
