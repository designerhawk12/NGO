const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {encrypt,decrypt,protectedKey,sha,restrict}=require('./production-recovery.cjs');

test('private directory creation and secure reuse require no owner reassignment',{skip:process.platform!=='win32'},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aahara-acl-regression-'));
  try{restrict(dir);assert.doesNotThrow(()=>restrict(dir));}
  finally{fs.rmdirSync(dir);}
});
test('AES-GCM authenticates binary data including zero bytes',()=>{
  const key=crypto.randomBytes(32),data=Buffer.concat([Buffer.alloc(32),crypto.randomBytes(4096)]);
  assert.deepEqual(decrypt(encrypt(data,key),key),data);key.fill(0);
});
test('fresh nonces produce distinct encrypted archives',()=>{
  const key=crypto.randomBytes(32),data=Buffer.from('synthetic only');
  assert.notDeepEqual(encrypt(data,key),encrypt(data,key));key.fill(0);
});
test('wrong key, modified header, ciphertext and authentication tag reject',()=>{
  const key=crypto.randomBytes(32),archive=encrypt(Buffer.from('synthetic only'),key);
  assert.throws(()=>decrypt(archive,crypto.randomBytes(32)));
  for(const position of [0,21,archive.length-1]){const altered=Buffer.from(archive);altered[position]^=1;assert.throws(()=>decrypt(altered,key));}key.fill(0);
});
test('Windows DPAPI recovers synthetic key and cannot overwrite an existing key file',{skip:process.platform!=='win32'},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aahara-synthetic-key-test-')),file=path.join(dir,'synthetic.dpapi'),key=crypto.randomBytes(32);
  try{assert.deepEqual(protectedKey(file,key),key);const before=sha(fs.readFileSync(file));assert.throws(()=>protectedKey(file,crypto.randomBytes(32)));assert.equal(sha(fs.readFileSync(file)),before);assert.deepEqual(protectedKey(file),key);}finally{key.fill(0);if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
});
