// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DriverJob } from '@aaharaconnect/shared';
import DriverJobs from './DriverJobs';
import { openDriverDirections } from './driverNavigation';

const native = vi.hoisted(() => ({
  services: vi.fn(), permission: vi.fn(), request: vi.fn(), position: vi.fn(),
  settings: vi.fn(), intent: vi.fn(),
  appState: { currentState: 'active', addEventListener: vi.fn() },
  list: vi.fn(), update: vi.fn(), open: vi.fn(), alert: vi.fn(), start: vi.fn(), requireTracking: vi.fn(),
}));
vi.mock('expo-location', () => ({
  Accuracy: { High: 4 }, hasServicesEnabledAsync: native.services,
  getForegroundPermissionsAsync: native.permission, requestForegroundPermissionsAsync: native.request,
  getCurrentPositionAsync: native.position,
}));
vi.mock('react-native', () => ({
  AppState: native.appState, Platform: { OS: 'android' },
  Linking: { openSettings: native.settings, sendIntent: native.intent },
  View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Alert: { alert: native.alert }, Pressable: () => null,
}));
vi.mock('expo-router', async () => {
  const { useEffect } = await import('react');
  return { useFocusEffect: (callback: React.EffectCallback) => useEffect(callback, [callback]) };
});
vi.mock('expo-linking', () => ({ openURL: native.open }));
vi.mock('../../api/auth', () => ({ getCurrentAccessToken: async () => 'test-token' }));
vi.mock('../../api/driver', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/driver')>(), listDriverJobs: native.list, updateDriverJob: native.update,
}));
vi.mock('../../constants/theme', () => ({ C: {} }));
vi.mock('../../context/LanguageContext', () => ({ useLanguage: () => ({ t: (text: string) => text }) }));
vi.mock('../common/NotificationBell', () => ({ default: () => null }));
vi.mock('../tracking/driverTracking', () => ({
  trackingSession: async () => null, activeDriverTracking: async () => null,
  startDriverTracking: native.start, requireDriverTracking: native.requireTracking,
}));
vi.mock('../common/UI', () => {
  const Wrapper = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  return {
    Screen: Wrapper, Card: Wrapper, T: Wrapper, Badge: () => null, Empty: () => null, Header: () => null,
    Icon: () => null, InfoRow: () => null, Sheet: () => null,
    Button: ({ title, disabled, onPress }: { title: string; disabled?: boolean; onPress: () => void }) =>
      <button disabled={disabled} onClick={onPress}>{title}</button>,
  };
});

const job: DriverJob = {
  assignmentId: 'assignment', pickupId: 'pickup', version: 1, status: 'PENDING', driverAcceptance: 'PENDING',
  donorName: 'Synthetic donor', pickupAddress: '1 Test Street, Bengaluru', deliveryAddress: '2 Test Street',
  windowStartsAt: '2026-11-16T10:00:00Z', windowEndsAt: '2026-11-16T12:00:00Z',
  contactName: null, contactPhone: null, handlingRequirements: null, operationalNotes: null, foodItems: [], crew: [],
  vehicle: { id: 'vehicle', registrationNumber: 'KA00AB0000', kind: 'Van', capacityKg: 100 },
  createdAt: '2026-11-16T09:00:00Z', completedAt: null,
};
const accepted = { ...job, driverAcceptance: 'ACCEPTED' as const };
const precise = { granted: true, canAskAgain: true, android: { accuracy: 'fine' } };
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let listener: (state: string) => void;
const button = (label: string) => [...container.querySelectorAll('button')].find(node => node.textContent === label)!;
const click = (label: string) => act(async () => { button(label).click(); });

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  vi.resetAllMocks();
  native.appState.currentState = 'active';
  native.appState.addEventListener.mockImplementation((_event, callback) => { listener = callback; return { remove: vi.fn() }; });
  native.services.mockResolvedValue(true);
  native.permission.mockResolvedValue(precise);
  native.position.mockImplementation(async () => ({ timestamp: Date.now(), coords: { latitude: 12, longitude: 77, accuracy: 10 } }));
  native.list.mockResolvedValue([job]);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('requires a fresh GPS fix and submits one acceptance for repeated taps', async () => {
  await act(async () => root.render(<DriverJobs />));
  expect(button('Accept assignment').disabled).toBe(true);
  await click('Enable GPS');
  expect(button('Accept assignment').disabled).toBe(false);
  expect(native.update).not.toHaveBeenCalled();
  native.update.mockImplementation(async () => { native.list.mockResolvedValue([accepted]); });
  const accept = button('Accept assignment');
  await act(async () => { accept.click(); accept.click(); });
  expect(native.update).toHaveBeenCalledExactlyOnceWith(job, 'ACCEPT', undefined);
  expect(button('Show on Maps')).toBeDefined();
});

it('refreshes GPS after returning from system settings and disables acceptance if services go off', async () => {
  native.services.mockResolvedValue(false);
  await act(async () => root.render(<DriverJobs />));
  await click('Enable GPS');
  expect(native.intent).toHaveBeenCalledWith('android.settings.LOCATION_SOURCE_SETTINGS');
  expect(button('Accept assignment').disabled).toBe(true);
  await act(async () => {
    listener('background');
    native.services.mockResolvedValue(true);
    listener('active');
  });
  expect(button('Accept assignment').disabled).toBe(false);
  native.services.mockResolvedValue(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(button('Accept assignment').disabled).toBe(true);
});

it.each([
  [{ granted: false, canAskAgain: true }, 'Enable GPS', native.request],
  [{ granted: false, canAskAgain: false }, 'Open app settings', native.settings],
  [{ ...precise, android: { accuracy: 'coarse' } }, 'Open app settings', native.settings],
] as const)('blocks acceptance when location authorization is insufficient', async (permission, action, expected) => {
  native.permission.mockResolvedValue(permission);
  await act(async () => root.render(<DriverJobs />));
  await click(action);
  expect(expected).toHaveBeenCalledOnce();
  expect(native.position).not.toHaveBeenCalled();
  expect(button('Accept assignment').disabled).toBe(true);
});

it('uses pickup coordinates when valid and falls back to HTTPS driving directions', async () => {
  native.open.mockRejectedValueOnce(new Error('no Maps handler')).mockResolvedValueOnce(undefined);
  await openDriverDirections({ ...accepted, pickupLatitude: 12, pickupLongitude: 77 }, true, native.open);
  expect(native.open.mock.calls.map(([url]) => url)).toEqual([
    'google.navigation:q=12%2C77&mode=d',
    'https://www.google.com/maps/dir/?api=1&destination=12%2C77&travelmode=driving&dir_action=navigate',
  ]);
});

it('rechecks accepted duty before sharing and keeps navigation and journey actions working', async () => {
  native.list.mockResolvedValue([accepted]);
  await act(async () => root.render(<DriverJobs />));
  await click('Turn On GPS / Start Location Sharing');
  const confirm = native.alert.mock.lastCall?.[2][1].onPress;
  native.list.mockResolvedValueOnce([{ ...accepted, status: 'CANCELLED' }]);
  await act(async () => confirm());
  expect(native.start).not.toHaveBeenCalled();
  expect(container.textContent).toContain('no longer an accepted active duty');

  await click('Refresh jobs');
  await click('Turn On GPS / Start Location Sharing');
  await act(async () => native.alert.mock.lastCall?.[2][1].onPress());
  expect(native.start).toHaveBeenCalledExactlyOnceWith(job.pickupId);
  await click('Show on Maps');
  expect(native.open).toHaveBeenCalledWith(expect.stringContaining('google.navigation:'));
  await click('Start journey to pickup');
  expect(native.requireTracking).toHaveBeenCalledWith(job.pickupId);
  expect(native.update).toHaveBeenCalledWith(accepted, 'START', undefined);
});

it('uses the real address for invalid coordinates and rejects a missing destination', async () => {
  await openDriverDirections({ ...accepted, pickupLatitude: 100, pickupLongitude: 77 }, false, native.open);
  expect(native.open.mock.calls[0][0]).toContain('destination=1%20Test%20Street%2C%20Bengaluru');
  await expect(openDriverDirections({ ...accepted, pickupAddress: ' ' }, true, native.open)).rejects.toThrow('No destination');
  expect(native.open).toHaveBeenCalledOnce();
});
