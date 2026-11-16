import { useCallback, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { acquireDriverGpsFix, isUsableGpsFix, readGpsStatus, type GpsStatus } from './driverGps';

const android = Platform.OS === 'android';

export function useDriverGps(enabled: boolean) {
  const [status, setStatus] = useState<GpsStatus>('checking');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requested = useRef(false);
  const focused = useRef(false);
  const enabling = useRef(false);
  const verifying = useRef(false);
  const epoch = useRef(0);
  const fix = useRef<Location.LocationObject | null>(null);

  const refresh = useCallback(async function refresh(acquire: boolean) {
    if (!focused.current || enabling.current || verifying.current || AppState.currentState === 'background') return;
    verifying.current = true;
    const version = epoch.current;
    const current = () => focused.current && epoch.current === version && AppState.currentState !== 'background';
    try {
      const next = await readGpsStatus(android);
      if (!current()) return;
      if (next !== 'unverified') {
        fix.current = null;
        setStatus(next);
        setError('');
      } else if (!fix.current || !isUsableGpsFix(fix.current)) {
        setStatus('unverified');
        if (acquire && requested.current) {
          setStatus('checking');
          const point = await acquireDriverGpsFix();
          const verified = await readGpsStatus(android);
          if (!current()) return;
          fix.current = verified === 'unverified' ? point : null;
          setStatus(verified === 'unverified' ? 'ready' : verified);
          setError('');
        }
      } else {
        setStatus('ready');
      }
    } catch (cause) {
      if (current()) {
        fix.current = null;
        setStatus('unverified');
        setError(cause instanceof Error ? cause.message : 'Could not verify GPS. Try again.');
      }
    } finally {
      verifying.current = false;
      if (epoch.current !== version && focused.current) void refresh(true);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    focused.current = true;
    const resume = () => {
      epoch.current += 1;
      fix.current = null;
      setStatus('checking');
      void refresh(true);
    };
    resume();
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') resume();
      else { epoch.current += 1; fix.current = null; setStatus('checking'); }
    });
    const timer = setInterval(() => void refresh(false), 3_000);
    return () => {
      focused.current = false;
      epoch.current += 1;
      fix.current = null;
      listener.remove();
      clearInterval(timer);
    };
  }, [enabled, refresh]));

  const enable = async () => {
    if (enabling.current || verifying.current) return;
    enabling.current = true;
    requested.current = true;
    fix.current = null;
    setBusy(true);
    setError('');
    try {
      const current = await readGpsStatus(android);
      if (current === 'disabled' && android) {
        await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
      } else if (current === 'blocked' || current === 'approximate') {
        await Linking.openSettings();
      } else if (current === 'denied') {
        await Location.requestForegroundPermissionsAsync();
      }
    } catch {
      setError('Could not open location settings. Open Android Settings and check location access.');
    } finally {
      enabling.current = false;
      setBusy(false);
      await refresh(true);
    }
  };

  const confirmReady = async () => {
    const current = await readGpsStatus(android);
    if (!focused.current || AppState.currentState === 'background' || current !== 'unverified'
      || !fix.current || !isUsableGpsFix(fix.current)) {
      fix.current = null;
      setStatus(current);
      throw new Error('Verify a fresh GPS position before accepting this assignment.');
    }
  };
  return { status, error, busy, enable, confirmReady };
}
