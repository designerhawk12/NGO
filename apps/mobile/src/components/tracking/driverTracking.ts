import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getCurrentAccessToken, setSignOutCleanup } from '../../api/auth';
import { apiRequest, ApiClientError } from '../../api/client';

const TASK = 'aaharaconnect-driver-duty-location-v1';
const KEY = 'aaharaconnect-driver-duty-session-v1';
type Session = { pickupId: string; vehicleId: string; registrationNumber: string; startedAt: string };
const interval = (raw: string | undefined, fallback: number) => Math.min(300_000, Math.max(30_000, Number(raw) || fallback));
const movingMs = interval(process.env.EXPO_PUBLIC_GPS_MOVING_MS, 30_000);
const stationaryMs = interval(process.env.EXPO_PUBLIC_GPS_STATIONARY_MS, 90_000);
let lastSent = 0;
let uploading = false;
let starting = false;
const headers = async () => ({ Authorization: `Bearer ${await getCurrentAccessToken()}` });
export async function trackingSession(): Promise<Session | null> {
  const raw = await AsyncStorage.getItem(KEY);
  try { return raw ? JSON.parse(raw) as Session : null; } catch { return null; }
}
export async function activeDriverTracking(): Promise<Session | null> {
  const session=await trackingSession();
  if(!session)return null;
  try {
    if(Date.now()-Date.parse(session.startedAt)<12*60*60*1000
      && await Location.hasStartedLocationUpdatesAsync(TASK)
      && (await Location.getForegroundPermissionsAsync()).granted
      && (await Location.getBackgroundPermissionsAsync()).granted
      && await Location.hasServicesEnabledAsync())return session;
  }catch{/* Interrupted native tasks require an explicit restart. */}
  await stopDriverTracking();return null;
}
export async function stopDriverTracking(): Promise<void> {
  const session = await trackingSession();
  await AsyncStorage.removeItem(KEY);
  try { if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK); }
  catch { /* A missing/revoked native task must not prevent account sign-out. */ }
  if (session) {
    try { await apiRequest(`pickups/${session.pickupId}/tracking-consent`, { method: 'DELETE', headers: await headers() }); }
    catch { /* Offline server status becomes stale; native collection has already stopped. */ }
  }
  lastSent = 0;
}
async function upload(location: Location.LocationObject, force = false) {
  if (uploading) { if (force) throw new Error('A GPS report is in progress. Try again shortly.'); return; }
  uploading = true;
  try {
    const session = await trackingSession();
    if (!session) return;
    if (Date.now() - Date.parse(session.startedAt) >= 12 * 60 * 60 * 1000) { await stopDriverTracking(); return; }
    const pace = (location.coords.speed ?? 0) > 1 ? movingMs : stationaryMs;
    if (!force && Date.now() - lastSent < pace) return;
    // Never replay an offline trail: the next native callback sends only its freshest position.
    if (Date.now() - location.timestamp > 120_000 || (location.coords.accuracy ?? Infinity) > 200) {
      if (force) throw new Error('A current, accurate GPS reading is required. Move outdoors and try again.');
      return;
    }
    await apiRequest(`vehicles/${session.vehicleId}/locations`, {
      method: 'POST', headers: await headers(), body: {
        pickupId: session.pickupId, latitude: location.coords.latitude, longitude: location.coords.longitude,
        recordedAt: new Date(location.timestamp).toISOString(),
        accuracyMeters: location.coords.accuracy ?? undefined, speedMps: location.coords.speed != null && location.coords.speed >= 0 ? location.coords.speed : null,
        sessionStartedAt: session.startedAt,
      },
    });
    lastSent = Date.now();
  } catch (cause) {
    if (cause instanceof ApiClientError && [401, 403, 404].includes(cause.status)) await stopDriverTracking();
    if (force) throw cause;
  } finally { uploading = false; }
}
setSignOutCleanup(stopDriverTracking);
// Expo requires module-scope registration, imported by the root layout before screens mount.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error) { await stopDriverTracking(); return; }
  const newest = data?.locations?.at(-1);
  if (newest) await upload(newest);
});
export async function startDriverTracking(pickupId: string): Promise<Session> {
  if (starting) throw new Error('Location sharing is already starting.');
  starting = true;
  try {
    if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new Error('Allow location access before starting this tracked pickup.');
    if (!(await Location.requestBackgroundPermissionsAsync()).granted) throw new Error('Allow background location in Android Settings so sharing continues while Google Maps is open.');
    if (!await Location.hasServicesEnabledAsync()) throw new Error('Turn on phone Location/GPS in Android Settings.');
    await stopDriverTracking();
    const session = await apiRequest<Session>(`pickups/${pickupId}/tracking-consent`, { method: 'POST', headers: await headers(), body: { pickupId, consent: true } });
    const stored = { ...session, pickupId };
    await AsyncStorage.setItem(KEY, JSON.stringify(stored));
    try {
      await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.Accuracy.Balanced, timeInterval: movingMs, distanceInterval: 15,
        deferredUpdatesInterval: movingMs, pausesUpdatesAutomatically: false,
        foregroundService: { notificationTitle: 'AaharaConnect location sharing', notificationBody: `Sharing ${session.registrationNumber} during NGO pickup duty. Open the app to Stop Sharing.`, killServiceOnDestroy: true },
      });
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if ((location.coords.accuracy ?? Infinity) > 200) throw new Error('GPS is not accurate enough yet. Move outdoors and try again.');
      await upload(location, true);
    } catch (cause) { await stopDriverTracking(); throw cause; }
    return stored;
  } finally { starting = false; }
}
export async function requireDriverTracking(pickupId: string) {
  const session = await trackingSession();
  if (!session || session.pickupId !== pickupId || !await Location.hasStartedLocationUpdatesAsync(TASK)
    || !(await Location.getForegroundPermissionsAsync()).granted || !(await Location.getBackgroundPermissionsAsync()).granted) {
    throw new Error('Turn On GPS / Start Location Sharing before starting the journey or opening Google Maps.');
  }
  if (!await Location.hasServicesEnabledAsync()) throw new Error('Phone Location/GPS is switched off.');
  const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  await upload(point, true);
}
