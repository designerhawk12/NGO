// Pure scheduling / address rules for the Donate Food form (unit-tested, no React Native imports).

export type ClockTime = { hour: number; minute: number };
export type Selection = { date: Date | null; hour: number | null; minute: number | null };
export const emptySelection = (): Selection => ({ date: null, hour: null, minute: null });

export function selectedTimeToIso(value: Selection): string | null {
  if (!value.date || value.hour === null || value.minute === null) return null;
  const instant = new Date(value.date.getFullYear(), value.date.getMonth(), value.date.getDate(), value.hour, value.minute);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

/**
 * Pickup deadline rule (device local time, sent to the API as a UTC instant):
 *  - the donor picks only a clock time;
 *  - it is applied to the Food Prepared DATE;
 *  - if that clock time is later than the preparation time the deadline is the same day;
 *  - if it is earlier, the deadline is the NEXT day (overnight) and the UI says so explicitly;
 *  - the same clock time as the preparation time is rejected (it would mean a 24-hour wait).
 * The deadline can therefore never precede the preparation timestamp and is always < 24 h after it.
 */
export function deriveDeadline(prepared: Selection, deadlineTime: ClockTime | null):
  { ok: true; iso: string; date: Date; nextDay: boolean } | { ok: false; error: string } {
  const preparedIso = selectedTimeToIso(prepared);
  if (!preparedIso || !prepared.date || prepared.hour === null || prepared.minute === null) {
    return { ok: false, error: 'Select the food prepared date and time first.' };
  }
  if (!deadlineTime) return { ok: false, error: 'Select the pickup deadline time.' };
  const preparedMinutes = prepared.hour * 60 + prepared.minute;
  const deadlineMinutes = deadlineTime.hour * 60 + deadlineTime.minute;
  if (deadlineMinutes === preparedMinutes) return { ok: false, error: 'Choose a pickup deadline time different from the preparation time.' };
  const nextDay = deadlineMinutes < preparedMinutes;
  const date = new Date(prepared.date.getFullYear(), prepared.date.getMonth(), prepared.date.getDate() + (nextDay ? 1 : 0), deadlineTime.hour, deadlineTime.minute);
  return { ok: true, iso: date.toISOString(), date, nextDay };
}

export function validateDonationTimes(preparedAt: string, pickupDeadline: string, now = new Date()): string | null {
  if (new Date(pickupDeadline) < new Date(preparedAt)) return 'Pickup deadline cannot be earlier than the food preparation time.';
  if (new Date(pickupDeadline) <= now) return 'Pickup deadline must be in the future.';
  return null;
}

export type AddressParts = { hall: string; flat: string; street: string; area: string; landmark: string };
export const emptyAddress = (): AddressParts => ({ hall: '', flat: '', street: '', area: '', landmark: '' });

/** One readable line for the API / Google Maps. Building, street and area are mandatory. */
export function composePickupAddress(parts: AddressParts): { address: string } | { error: string } {
  const clean = (value: string) => value.trim().replace(/\s+/g, ' ');
  const hall = clean(parts.hall), street = clean(parts.street), area = clean(parts.area);
  if (!hall) return { error: 'Enter the hall or building name.' };
  if (!street) return { error: 'Enter the street or road.' };
  if (!area) return { error: 'Enter the area or locality.' };
  const flat = clean(parts.flat), landmark = clean(parts.landmark);
  const address = [hall, flat, street, area, landmark ? `Near ${landmark}` : ''].filter(Boolean).join(', ');
  return address.length > 500 ? { error: 'The address is too long (500 characters at most).' } : { address };
}

export type GeocodedPlace = {
  name?: string | null; streetNumber?: string | null; street?: string | null; district?: string | null;
  subregion?: string | null; city?: string | null; region?: string | null; postalCode?: string | null;
};

/** Pre-fills what GPS can reasonably know (street and area). Building / hall / floor are never guessed. */
export function addressFromPlace(place: GeocodedPlace): Pick<AddressParts, 'street' | 'area'> {
  const street = [place.streetNumber, place.street ?? place.name].filter(Boolean).join(' ').trim();
  const area = [place.district ?? place.subregion, place.city ?? place.region, place.postalCode].filter(Boolean).join(', ').trim();
  return { street, area };
}

export const MIN_ITEMS = 1;
export const MAX_ITEMS = 10;
export const MAX_MEALS = 100000;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
