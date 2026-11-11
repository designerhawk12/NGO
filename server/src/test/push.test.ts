import { describe, expect, it, vi } from 'vitest';
import { enqueuePush, validExpoToken } from '../modules/push/service';
const id='123e4567-e89b-42d3-a456-426614174000';
describe('private push event construction',()=>{
  it('accepts Expo token formats and rejects arbitrary destinations',()=>{
    expect(validExpoToken('ExpoPushToken[abcde12345]')).toBe(true);
    expect(validExpoToken('ExponentPushToken[abcde12345]')).toBe(true);
    expect(validExpoToken('https://example.org/token')).toBe(false);
  });
  it('inserts Admin inbox rows and device deliveries in one transaction with a stable key',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[]});
    await enqueuePush({query} as never,'FOOD_REQUEST',id,`food-request:${id}`,'ADMINS');
    const [sql,parameters]=query.mock.calls[0];
    expect(sql).toContain('ON CONFLICT(event_key,recipient_user_id) DO NOTHING');
    expect(sql).toContain("SELECT id FROM app.app_users WHERE role='ADMIN'");
    expect(sql).toContain('$5::uuid IS NULL');
    expect(sql).toContain('INSERT INTO app.push_deliveries');
    expect(parameters[0]).toBe(`food-request:${id}`);
    expect(parameters[2]).toBe(id);
    expect(parameters.join(' ')).not.toMatch(/aadhaar|password|phone/i);
  });
  it('resolves only the selected people for crew assignments',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[]});
    await enqueuePush({query} as never,'VOLUNTEER_ASSIGNED',id,`volunteer-assigned:${id}`,{personIds:[id]});
    expect(query.mock.calls[0][0]).toContain('WHERE id=ANY($5::uuid[])');
    expect(query.mock.calls[0][1][4]).toEqual([id]);
  });
});
