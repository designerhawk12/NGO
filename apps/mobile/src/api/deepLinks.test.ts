import {describe,it,expect} from 'vitest';
import {parseAppLink,linkDestination,linkRole} from './deepLinks';
describe('authenticated object deep links',()=>{
  it('maps only the three known record types and never accepts redirect URLs',()=>{
    const id='a0000000-0000-4000-8000-000000000001';
    for(const kind of ['donation','volunteer','driver']){const link=parseAppLink(kind,id)!;expect(link).not.toBeNull();expect(linkDestination(link)).toContain(id);expect(linkRole(link)).toBe(kind==='donation'?'donor':kind);}
    expect(parseAppLink('https://evil.test',id)).toBeNull();expect(parseAppLink('driver','../other')).toBeNull();expect(parseAppLink('driver',['id'])).toBeNull();
  });
});
