import { beforeEach, expect, it, vi } from 'vitest';
import { requireDriverTracking, startDriverTracking, trackingSession } from './driverTracking';

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  request: vi.fn(),
  stop: vi.fn(),
  start: vi.fn(),
  point: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => mocks.storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { mocks.storage.set(key, value); },
    removeItem: async (key: string) => { mocks.storage.delete(key); },
  },
}));
vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, High: 4 },
  requestForegroundPermissionsAsync: async () => ({ granted: true }),
  requestBackgroundPermissionsAsync: async () => ({ granted: true }),
  getForegroundPermissionsAsync: async () => ({ granted: true }),
  getBackgroundPermissionsAsync: async () => ({ granted: true }),
  hasServicesEnabledAsync: async () => true,
  hasStartedLocationUpdatesAsync: async () => true,
  getCurrentPositionAsync: mocks.point,
  startLocationUpdatesAsync: mocks.start,
  stopLocationUpdatesAsync: mocks.stop,
}));
vi.mock('expo-task-manager', () => ({ defineTask: vi.fn() }));
vi.mock('../../api/auth', () => ({ getCurrentAccessToken: async () => 'test-token', setSignOutCleanup: vi.fn() }));
vi.mock('../../api/client', () => ({ apiRequest: mocks.request, ApiClientError: class extends Error {} }));


beforeEach(() => {
  vi.clearAllMocks();
  mocks.storage.clear();
  const timestamp = Date.now();
  mocks.point.mockResolvedValue({ timestamp, coords: { latitude: 12, longitude: 77, accuracy: 12 } });
});

function mockReport(accepted: boolean) {
  mocks.request.mockImplementation(async (_path, { method }) => {
    if (method === 'DELETE') return undefined;
    if (_path.endsWith('tracking-consent')) return { vehicleId: 'vehicle', registrationNumber: 'KA', startedAt: new Date().toISOString() };
    return { accepted };
  });
}

it('reuses the accepted activation fix when opening navigation immediately', async () => {
  mockReport(true);
  await startDriverTracking('pickup');
  await requireDriverTracking('pickup');
  expect(mocks.request.mock.calls.filter(([path]) => path.endsWith('/locations'))).toHaveLength(1);
});

it('withdraws consent and clears the tracking session when the first report is rejected', async () => {
  mockReport(false);
  await expect(startDriverTracking('pickup')).rejects.toThrow('did not accept');
  expect(await trackingSession()).toBeNull();
  expect(mocks.request).toHaveBeenCalledWith('pickups/pickup/tracking-consent', expect.objectContaining({ method: 'DELETE' }));
});
