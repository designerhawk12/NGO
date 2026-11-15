import { describe, expect, it } from 'vitest';
import { normalizeIndianPhone } from './volunteerRegistrationInput';

describe('normalizeIndianPhone', () => {
  it.each(['9876543210', '09876543210', '919876543210', '+919876543210', '+91 98765-43210']) (
    'normalizes %s to E.164', value => {
      expect(normalizeIndianPhone(value)).toEqual({ ok: true, phoneE164: '+919876543210' });
    }
  );

  it('requires a phone number for a Volunteer application', () => {
    expect(normalizeIndianPhone('  ')).toEqual({ ok: false });
  });

  it.each(['1234567890', '987654321', '+1 555 123 4567', '98abc543210']) (
    'rejects non-Indian or malformed input %s', value => {
      expect(normalizeIndianPhone(value)).toEqual({ ok: false });
    }
  );
});
