// Read-only package verification. No DPAPI access, decryption or network operation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function readKeyFromPipe(){
  if(process.stdin.isTTY)throw Error('Protected binary key pipe required');
  const key=Buffer.alloc(33);let n=0,r;
  while(n<33&&(r=fs.readSync(0,key,n,33-n,null))>0)n+=r;
  if(n!==32){key.fill(0);throw Error('Expected exactly 32 key bytes');}
  const result=Buffer.from(key.subarray(0,32));key.fill(0);return result;
}
function inventory(dir){
  const source=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  if(source.project!=='pyzyxgpcfwpcqyqrihuo'||source.archive!=='database.dump.gcm')throw Error('Package identity mismatch');
  const fields=['project','startedUtc','completedUtc','archive','sha256','plaintextArchiveSha256','metadataSha256','clusterSettingsSha256','restoreImageId','encryptedBytes','tableCount'];
  const manifest=Object.fromEntries(fields.filter(k=>source[k]!==undefined).map(k=>[k,source[k]]));
  const files=[['database.dump.gcm','sha256'],['snapshot-metadata.json.gcm','metadataSha256'],['cluster-settings.json.gcm','clusterSettingsSha256']].map(([name,field])=>{
    if(!/^[a-f0-9]{64}$/.test(source[field]||''))throw Error('Missing expected checksum');
    const bytes=fs.readFileSync(path.join(dir,name));
    if(digest(bytes)!==source[field])throw Error('Encrypted companion checksum mismatch');
    return {name,bytes:bytes.length,sha256:source[field]};
  });
  if(files[0].bytes!==source.encryptedBytes)throw Error('Archive size mismatch');
  return {manifest,files};
}
if(require.main===module){
  try{console.log(JSON.stringify(inventory(path.resolve(process.argv[2]||'')),null,2));}
  catch{console.error('Recovery package validation failed; no sensitive content printed');process.exitCode=1;}
}
module.exports={inventory,readKeyFromPipe};
