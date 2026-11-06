export type IndianPhoneNormalization =
  | { ok: true; phoneE164: string }
  | { ok: false };

/** Accepts a ten-digit Indian mobile number with an optional 0 or +91 prefix. */
export function normalizeIndianPhone(input: string): IndianPhoneNormalization {
  const value = input.trim().replace(/[\s()-]/g, '');
  if (!value) return { ok: false };
  if (!/^\+?[0-9]+$/.test(value)) return { ok: false };

  let digits = value.startsWith('+') ? value.slice(1) : value;
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  if (!/^[6-9][0-9]{9}$/.test(digits)) return { ok: false };
  return { ok: true, phoneE164: `+91${digits}` };
}
