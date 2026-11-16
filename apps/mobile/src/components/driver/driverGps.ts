import * as Location from 'expo-location';

export type GpsStatus = 'checking' | 'disabled' | 'denied' | 'blocked' | 'approximate' | 'unverified' | 'ready';

export async function readGpsStatus(android: boolean): Promise<GpsStatus> {
  if (!await Location.hasServicesEnabledAsync()) return 'disabled';
  const permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted) return permission.canAskAgain ? 'denied' : 'blocked';
  if (android && permission.android?.accuracy !== 'fine') return 'approximate';
  return 'unverified';
}

export function isUsableGpsFix(location: Location.LocationObject, now = Date.now()): boolean {
  const { latitude, longitude, accuracy } = location.coords;
  return Number.isFinite(location.timestamp) && location.timestamp >= now - 120_000
    && location.timestamp <= now + 30_000 && Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    && accuracy != null && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 200;
}

export async function acquireDriverGpsFix(): Promise<Location.LocationObject> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const point = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: false }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Could not get a fresh, accurate GPS reading. Move outdoors and try again.')), 15_000); }),
    ]);
    if (!isUsableGpsFix(point)) throw new Error('Could not get a fresh, accurate GPS reading. Move outdoors and try again.');
    return point;
  } finally {
    clearTimeout(timer);
  }
}
