import { afterEach, describe, expect, it, vi } from 'vitest';
import { redirectSystemPath } from './systemLinks';
import appConfig from '../../app.config';
afterEach(() => vi.unstubAllEnvs());
describe('native incoming link bounds', () => {
  it('preserves normal links for both cold and warm launches', () => {
    const id='a0000000-0000-4000-8000-000000000001';
    for(const initial of [true,false])for(const path of [`aaharaconnect:///open/driver/${id}`,`https://aaharaconnect-ngo-staging.vercel.app/open/volunteer/${id}`,'/donor/login'])expect(redirectSystemPath({path,initial})).toBe(path);
  });
  it('rejects percent-decoder attack strings, oversized input and control characters before routing', () => {
    for(const path of ['%'.repeat(100000),'aaharaconnect:///open/%C0%AF','/open/'+ 'a'.repeat(600),'/open/driver/\n',''])expect(redirectSystemPath({path,initial:true})).toBe('/');
  });
});
describe('build-specific App Link domain', () => {
  it.each(['https://aaharaconnect-ngo-staging.vercel.app','https://ngo-eight-umber.vercel.app'])('uses %s and preserves package/native settings', origin => {
    vi.stubEnv('EXPO_PUBLIC_WEB_BASE_URL',origin);
    const base={name:'AaharaConnect',slug:'aaharaconnect-mobile',android:{package:'com.rajashishpatil10.aaharaconnect',blockedPermissions:['android.permission.CAMERA']}};
    const result=appConfig({config:base} as never);
    expect(result.android?.package).toBe(base.android.package);expect(result.android?.blockedPermissions).toEqual(base.android.blockedPermissions);
    expect(result.android?.intentFilters?.[0].data).toEqual([{scheme:'https',host:new URL(origin).hostname,pathPrefix:'/open/'}]);
  });
  it('rejects credentialed or non-origin configuration', () => {
    for(const origin of ['http://example.test','https://user:password@example.test','https://example.test/path']){
      vi.stubEnv('EXPO_PUBLIC_WEB_BASE_URL',origin);expect(()=>appConfig({config:{name:'AaharaConnect',slug:'app'}} as never)).toThrow();
    }
  });
});
