import { beforeEach, describe, expect, it, vi } from 'vitest';
const { query, getBucket, upload, createSignedUrls } = vi.hoisted(() => ({ query:vi.fn(),getBucket:vi.fn(),upload:vi.fn(),createSignedUrls:vi.fn() }));
vi.mock('../db/pool',()=>({getPool:()=>({query})}));
vi.mock('../auth/supabase',()=>({getSupabaseAdminClient:()=>({storage:{getBucket,from:()=>({upload,createSignedUrls})}})}));
import { getOwnPhotoUrl, setOwnPhoto } from '../modules/profilePhotos/service';
beforeEach(()=>{vi.clearAllMocks();query.mockResolvedValue({rows:[{photo_path:'owner/existing.jpg'}]});});
describe('private profile photo infrastructure boundary',()=>{
  it('refuses uploads to an accidentally public existing bucket',async()=>{
    getBucket.mockResolvedValue({data:{public:true},error:null});
    const image=Buffer.from([255,216,255,0,0,0,0,0,0,0,0,0,0]);
    await expect(setOwnPhoto('owner',{contentType:'image/jpeg',dataBase64:image.toString('base64')})).rejects.toMatchObject({code:'PHOTO_STORAGE_UNAVAILABLE'});
    expect(upload).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
  });
  it('does not issue previews when privacy cannot be verified',async()=>{
    for(const bucket of [{data:{public:true},error:null},{data:null,error:{message:'unavailable'}}]){
      getBucket.mockResolvedValue(bucket);expect(await getOwnPhotoUrl('owner')).toBeNull();
    }
    expect(createSignedUrls).not.toHaveBeenCalled();
  });
  it('issues the existing one-hour preview only for a private bucket',async()=>{
    getBucket.mockResolvedValue({data:{public:false},error:null});
    createSignedUrls.mockResolvedValue({data:[{path:'owner/existing.jpg',signedUrl:'https://example.test/private-preview'}],error:null});
    expect(await getOwnPhotoUrl('owner')).toBe('https://example.test/private-preview');
    expect(createSignedUrls).toHaveBeenCalledWith(['owner/existing.jpg'],3600);
  });
});
