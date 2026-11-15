import { describe, expect, it } from 'vitest';
import { addressFromPlace, clamp, composePickupAddress, deriveDeadline, emptyAddress } from './donationRules';

const prepared = (hour: number, minute: number) => ({ date: new Date(2026, 10, 10), hour, minute });

describe('pickup deadline (time only)', () => {
  it('keeps a later clock time on the preparation day', () => {
    const result = deriveDeadline(prepared(10, 0), { hour: 14, minute: 30 });
    expect(result).toMatchObject({ ok: true, nextDay: false });
    if (result.ok) expect(result.iso).toBe(new Date(2026, 10, 10, 14, 30).toISOString());
  });
  it('moves an earlier clock time to the next day and says so explicitly', () => {
    const result = deriveDeadline(prepared(22, 0), { hour: 1, minute: 30 });
    expect(result).toMatchObject({ ok: true, nextDay: true });
    if (result.ok) expect(result.iso).toBe(new Date(2026, 10, 11, 1, 30).toISOString());
  });
  it('crosses month and year boundaries and rejects an identical time', () => {
    const result = deriveDeadline({ date: new Date(2026, 11, 31), hour: 23, minute: 0 }, { hour: 2, minute: 0 });
    if (result.ok) expect(result.iso).toBe(new Date(2027, 0, 1, 2, 0).toISOString());
    expect(deriveDeadline(prepared(10, 0), { hour: 10, minute: 0 })).toMatchObject({ ok: false });
  });
  it('never yields a deadline before preparation and requires the prepared date and time first', () => {
    for (const [ph, dh] of [[0, 23], [23, 0], [12, 11], [12, 13]] as const) {
      const result = deriveDeadline(prepared(ph, 0), { hour: dh, minute: 0 });
      expect(result.ok && new Date(result.iso).getTime() > new Date(2026, 10, 10, ph, 0).getTime()).toBe(true);
    }
    expect(deriveDeadline({ date: null, hour: null, minute: null }, { hour: 1, minute: 0 })).toMatchObject({ ok: false });
    expect(deriveDeadline({ date: new Date(), hour: null, minute: null }, null)).toMatchObject({ ok: false });
  });
});

describe('pickup address', () => {
  it('requires building, street and area and builds one Maps-friendly line', () => {
    expect(composePickupAddress(emptyAddress())).toEqual({ error: 'Enter the hall or building name.' });
    expect(composePickupAddress({ ...emptyAddress(), hall: 'Royal Hall' })).toEqual({ error: 'Enter the street or road.' });
    expect(composePickupAddress({ hall: ' Royal  Orchid Hall ', flat: '2nd floor', street: 'Bellary Road', area: 'Yelahanka, Bengaluru 560064', landmark: 'Metro' }))
      .toEqual({ address: 'Royal Orchid Hall, 2nd floor, Bellary Road, Yelahanka, Bengaluru 560064, Near Metro' });
  });
  it('pre-fills only street and area from GPS and never invents a building', () => {
    expect(addressFromPlace({ streetNumber: '12', street: 'Bellary Road', district: 'Yelahanka', city: 'Bengaluru', postalCode: '560064' }))
      .toEqual({ street: '12 Bellary Road', area: 'Yelahanka, Bengaluru, 560064' });
    expect(addressFromPlace({})).toEqual({ street: '', area: '' });
  });
  it('clamps quantities', () => { expect(clamp(0, 1, 10)).toBe(1); expect(clamp(11, 1, 10)).toBe(10); expect(clamp(5, 1, 10)).toBe(5); });
});
