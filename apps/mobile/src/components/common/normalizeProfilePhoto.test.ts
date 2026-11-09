import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_PHOTO_MAX_BYTES } from '@aaharaconnect/shared';
import { normalizeProfilePhoto } from './normalizeProfilePhoto';
const { manipulate, save, resize, release } = vi.hoisted(() => ({ manipulate: vi.fn(), save: vi.fn(), resize: vi.fn(), release: vi.fn() }));
vi.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate }, SaveFormat: { JPEG: 'jpeg' } }));
const jpeg = Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(30)]).toString('base64');
beforeEach(() => {
  vi.clearAllMocks();
  manipulate.mockReturnValue({resize,release,renderAsync:async()=>({width:4000,height:3000,release,saveAsync:save})});
  save.mockReset().mockResolvedValue({uri:'file:///normalized.jpg',base64:jpeg});
});
describe('gallery photo normalization', () => {
  it.each(['jpg','png','webp','heic','heif','unknown'])('normalizes the cropped %s URI regardless of gallery MIME',async format => {
    expect(await normalizeProfilePhoto('file:///cropped.'+format)).toEqual({uri:'file:///normalized.jpg',base64:jpeg,contentType:'image/jpeg'});
    expect(manipulate).toHaveBeenCalledWith('file:///cropped.'+format);
    expect(resize).toHaveBeenCalledWith({width:1024,height:768});
    expect(save).toHaveBeenCalledWith({format:'jpeg',compress:0.85,base64:true});
    expect(release).toHaveBeenCalledTimes(3);
  });
  it('retries encoding at lower quality when the actual output exceeds 600 KB',async()=>{
    save.mockResolvedValueOnce({uri:'large.jpg',base64:Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(PROFILE_PHOTO_MAX_BYTES)]).toString('base64')});
    await normalizeProfilePhoto('file:///photo');
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({format:'jpeg',compress:0.65,base64:true});
  });
  it('fails closed after bounded attempts and accepts no over-limit payload',async()=>{
    save.mockResolvedValue({base64:Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(PROFILE_PHOTO_MAX_BYTES)]).toString('base64')});
    await expect(normalizeProfilePhoto('file:///photo')).rejects.toThrow('PHOTO_TOO_LARGE');
    expect(save).toHaveBeenCalledTimes(4);
  });
  it('does not upscale small cropped images',async()=>{
    manipulate.mockReturnValue({resize,release,renderAsync:async()=>({width:256,height:256,release,saveAsync:save})});
    await normalizeProfilePhoto('file:///small');expect(resize).toHaveBeenCalledWith({width:256,height:256});
  });
  it('rejects empty/non-JPEG encoder output and releases native references',async()=>{
    save.mockResolvedValue({base64:'iVBORw0KGgoAAA'});
    await expect(normalizeProfilePhoto('file:///bad')).rejects.toThrow('PHOTO_CONVERSION_FAILED');
    expect(release).toHaveBeenCalledTimes(3);
  });
  it('propagates unsupported native decoding as a handled failure, including unavailable HEIF codecs',async()=>{
    manipulate.mockReturnValue({release,renderAsync:async()=>{throw Error('Unsupported image');}});
    await expect(normalizeProfilePhoto('file:///unsupported.heif')).rejects.toThrow('Unsupported image');expect(release).toHaveBeenCalledOnce();
  });
});
