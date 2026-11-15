import { describe, expect, it } from 'vitest';
import { pickupNavigationUrl, pickupSearchUrl } from './pickupNavigation';

describe('pickup navigation', () => {
  it('encodes the actual address for Google Maps directions', () => {
    expect(pickupNavigationUrl(' Hall #2, MG Road & 5th ')).toBe('https://www.google.com/maps/dir/?api=1&destination=Hall%20%232%2C%20MG%20Road%20%26%205th&travelmode=driving');
  });
  it('has a browser maps fallback and rejects missing addresses', () => {
    expect(pickupSearchUrl('Hall & Market')).toBe('https://www.google.com/maps/search/?api=1&query=Hall%20%26%20Market');
    expect(pickupNavigationUrl('  ')).toBeNull();
    expect(pickupSearchUrl('')).toBeNull();
  });
});
