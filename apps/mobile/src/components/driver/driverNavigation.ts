import type { DriverJob } from '@aaharaconnect/shared';
import { isClosedJob } from '../../api/driver';

// The current API only sends addresses. Prefer coordinates if a job payload supplies them.
type JobWithCoordinates = DriverJob & { pickupLatitude?: unknown; pickupLongitude?: unknown };

export function driverNavigation(job: JobWithCoordinates) {
  if (isClosedJob(job) || job.driverAcceptance !== 'ACCEPTED') return null;
  const delivery = job.status === 'FOOD_COLLECTED';
  const { pickupLatitude: lat, pickupLongitude: lon } = job;
  const hasCoordinates = !delivery && typeof lat === 'number' && typeof lon === 'number'
    && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const target = hasCoordinates ? `${lat},${lon}` : (delivery ? job.deliveryAddress : job.pickupAddress)?.trim();
  if (!target) return null;
  const encoded = encodeURIComponent(target);
  return {
    native: `google.navigation:q=${encoded}&mode=d`,
    https: `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving&dir_action=navigate`,
  };
}

export async function openDriverDirections(job: JobWithCoordinates, android: boolean, open: (url: string) => Promise<unknown>) {
  const links = driverNavigation(job);
  if (!links) throw new Error('No destination is recorded for this job. Contact the NGO administrator.');
  if (android) {
    try { await open(links.native); return; }
    catch { /* The HTTPS directions link works when the native handler is unavailable. */ }
  }
  await open(links.https);
}
