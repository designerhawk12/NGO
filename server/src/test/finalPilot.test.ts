import { createHmac } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { identityProofSchema } from '@aaharaconnect/shared';
const {query}=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('../db/pool',()=>({getPool:()=>({query}),withTransaction:async(fn:(tx:unknown)=>Promise<unknown>)=>fn({query})}));
import { validatedIdentityImage, registerWithIdentity } from '../modules/volunteers/identity';
import { enqueue, dispatchOne, retryDelay, safeAppPath, verifySignature } from '../modules/notifications/service';
import { androidRelease } from '../modules/releases/routes';
import { decideVolunteerApplication } from '../modules/volunteers/service';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
describe('private identity proof boundary',()=>{
  it('requires an application denial reason after identity onboarding is enabled',async()=>{
    vi.stubEnv('VOLUNTEER_IDENTITY_REQUIRED','true');
    await expect(decideVolunteerApplication({id:'a0000000-0000-4000-8000-000000000001',authUserId:'b0000000-0000-4000-8000-000000000001',role:'ADMIN',displayName:'Admin'},'a0000000-0000-4000-8000-000000000002',{status:'DENIED'})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
    expect(query).not.toHaveBeenCalled();
  });
  it('requires masked Aadhaar acknowledgement and processing consent',()=>{
    const base={documentType:'MASKED_AADHAAR',contentType:'image/jpeg',dataBase64:'AAAAAAAAAAAAAAAA',consent:true,maskedAadhaarConfirmed:false};
    expect(identityProofSchema.safeParse(base).success).toBe(false);expect(identityProofSchema.safeParse({...base,maskedAadhaarConfirmed:true}).success).toBe(true);expect(identityProofSchema.safeParse({...base,consent:false,maskedAadhaarConfirmed:true}).success).toBe(false);
  });
  it('rejects missing proof before creating an application or invitation',async()=>{
    vi.stubEnv('VOLUNTEER_IDENTITY_REQUIRED','true');await expect(registerWithIdentity({name:'Volunteer',email:'v@example.test',phoneE164:'+919876543210',skills:[]},'127.0.0.1')).rejects.toMatchObject({code:'IDENTITY_REQUIRED'});expect(query).not.toHaveBeenCalled();
  });
  it('decodes and re-encodes supported images rather than trusting the file name',async()=>{
    const png=await sharp({create:{width:16,height:16,channels:3,background:'#fff'}}).png().toBuffer();
    const result=await validatedIdentityImage({documentType:'PAN',contentType:'image/png',dataBase64:png.toString('base64'),consent:true,maskedAadhaarConfirmed:false});
    expect((await sharp(result).metadata()).format).toBe('jpeg');
    await expect(validatedIdentityImage({documentType:'PAN',contentType:'image/jpeg',dataBase64:png.toString('base64'),consent:true,maskedAadhaarConfirmed:false})).rejects.toMatchObject({code:'IDENTITY_TYPE_INVALID'});
    await expect(validatedIdentityImage({documentType:'PAN',contentType:'image/jpeg',dataBase64:Buffer.alloc(500001).toString('base64'),consent:true,maskedAadhaarConfirmed:false})).rejects.toMatchObject({code:'IDENTITY_TOO_LARGE'});
  });
});
describe('disabled-by-default durable WhatsApp',()=>{
  it('does not enqueue or send anything while disabled',async()=>{
    vi.stubEnv('NOTIFICATION_OUTBOX_ENABLED','false');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    await enqueue({query} as never,'donation_received','a0000000-0000-4000-8000-000000000001',[]);
    expect(await dispatchOne()).toMatchObject({disabled:true});expect(query).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });
  it('deduplicates recipients and contains outbox database failure with a savepoint',async()=>{
    vi.stubEnv('NOTIFICATION_OUTBOX_ENABLED','true');query.mockResolvedValue({rows:[]});
    await enqueue({query} as never,'volunteer_assignment','a0000000-0000-4000-8000-000000000001',['u1','u1']);
    const inserts=query.mock.calls.filter(([sql])=>String(sql).includes('INSERT INTO app.notification_outbox'));expect(inserts).toHaveLength(1);expect(inserts[0][0]).toContain('ON CONFLICT(event_key) DO NOTHING');
    query.mockClear();query.mockResolvedValueOnce({rows:[]}).mockRejectedValueOnce(new Error('db')).mockResolvedValue({rows:[]});
    await expect(enqueue({query} as never,'driver_assignment','a0000000-0000-4000-8000-000000000001',['u1'])).resolves.toBeUndefined();expect(query.mock.calls.some(([sql])=>String(sql).includes('ROLLBACK TO SAVEPOINT'))).toBe(true);
  });
  it('verifies the raw-byte signature and rejects tampering',()=>{
    const raw=Buffer.from('{"entry":[]}');const signature='sha256='+createHmac('sha256','test-secret').update(raw).digest('hex');expect(verifySignature(raw,signature,'test-secret')).toBe(true);expect(verifySignature(Buffer.from('{}'),signature,'test-secret')).toBe(false);expect(verifySignature(raw,'bad','test-secret')).toBe(false);
  });
  it('bounds retries and accepts only predefined object links',()=>{
    expect(retryDelay(1)).toBe(30);expect(retryDelay(20)).toBe(3600);expect(safeAppPath('donation_received','a0000000-0000-4000-8000-000000000001')).toContain('/open/donation/');expect(()=>safeAppPath('driver_assignment','https://evil.test')).toThrow();
  });
});
describe('APK release gate',()=>{
  it('does not expose an unapproved or temporary artifact',()=>{
    vi.stubEnv('ANDROID_RELEASE_APPROVED','false');expect(androidRelease().available).toBe(false);
    vi.stubEnv('ANDROID_RELEASE_APPROVED','true');vi.stubEnv('ANDROID_RELEASE_URL','https://expo.dev/build.apk');vi.stubEnv('ANDROID_RELEASE_VERSION','1.0.1');vi.stubEnv('ANDROID_RELEASE_BUILD_ID','build');vi.stubEnv('ANDROID_RELEASE_SHA256','a'.repeat(64));vi.stubEnv('SUPABASE_URL','https://example.supabase.co');expect(androidRelease().available).toBe(false);
    vi.stubEnv('ANDROID_RELEASE_URL','https://example.supabase.co/storage/v1/object/public/mobile-releases/aaharaconnect-1.0.1.apk');expect(androidRelease().available).toBe(true);
  });
});
