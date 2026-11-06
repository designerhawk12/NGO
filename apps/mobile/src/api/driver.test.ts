import type { DriverJob } from '@aaharaconnect/shared';
import { describe, expect, it, vi } from 'vitest';
import { currentDestination, isClosedJob, listDriverJobs, nextDriverStep, updateDriverJob } from './driver';
import { pickupNavigationUrl } from '../components/volunteer/pickupNavigation';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('./auth', () => ({ getCurrentAccessToken: vi.fn(async () => 'driver-token') }));
vi.mock('./client', () => ({ apiRequest }));

const job = (overrides: Partial<DriverJob> = {}): DriverJob => ({
  assignmentId: 'a1', pickupId: 'p1', status: 'PENDING', driverAcceptance: 'PENDING', version: 3,
  donorName: 'Royal Orchid Hall', pickupAddress: 'Bellary Road, Yelahanka, Bengaluru',
  deliveryAddress: 'AaharaConnect Distribution Center, Indiranagar',
  windowStartsAt: '2026-11-10T10:00:00.000Z', windowEndsAt: '2026-11-10T12:00:00.000Z',
  contactName: null, contactPhone: null, handlingRequirements: null, operationalNotes: null,
  foodItems: [], vehicle: { id: 'v1', registrationNumber: 'KA01AB1234', kind: 'Mini truck', capacityKg: 500 },
  crew: [], createdAt: '2026-11-06T10:00:00.000Z', completedAt: null, ...overrides,
});

describe('driver job workflow', () => {
  it('asks the driver to accept first, separately from the crew', () => {
    expect(nextDriverStep(job())).toEqual({ action: 'ACCEPT', label: 'Accept assignment' });
    expect(nextDriverStep(job({ status: 'ACCEPTED' }))).toEqual({ action: 'ACCEPT', label: 'Accept assignment' });
    expect(nextDriverStep(job({ driverAcceptance: 'ACCEPTED' }))).toEqual({ waiting: 'Waiting for a crew volunteer to accept.' });
  });

  it('follows the existing status machine after acceptance and stops when closed', () => {
    const accepted = { driverAcceptance: 'ACCEPTED' as const };
    expect(nextDriverStep(job({ ...accepted, status: 'ACCEPTED' }))).toMatchObject({ action: 'START' });
    expect(nextDriverStep(job({ ...accepted, status: 'EN_ROUTE' }))).toMatchObject({ action: 'ARRIVE' });
    expect(nextDriverStep(job({ ...accepted, status: 'ARRIVED_AT_DONOR' }))).toMatchObject({ action: 'COLLECT' });
    expect(nextDriverStep(job({ ...accepted, status: 'FOOD_COLLECTED' }))).toMatchObject({ action: 'DELIVER' });
    for (const status of ['DELIVERED', 'REJECTED', 'CANCELLED', 'FAILED'] as const) {
      expect(nextDriverStep(job({ ...accepted, status }))).toBeNull();
      expect(isClosedJob(job({ status }))).toBe(true);
    }
  });

  it('shows Maps only after acceptance: pickup first, then the delivery destination', () => {
    expect(currentDestination(job())).toBeNull();
    const toPickup = currentDestination(job({ driverAcceptance: 'ACCEPTED', status: 'EN_ROUTE' }));
    expect(toPickup).toEqual({ label: 'pickup', address: 'Bellary Road, Yelahanka, Bengaluru' });
    expect(pickupNavigationUrl(toPickup!.address)).toBe('https://www.google.com/maps/dir/?api=1&destination=Bellary%20Road%2C%20Yelahanka%2C%20Bengaluru&travelmode=driving');
    expect(currentDestination(job({ driverAcceptance: 'ACCEPTED', status: 'FOOD_COLLECTED' }))).toEqual({ label: 'delivery destination', address: 'AaharaConnect Distribution Center, Indiranagar' });
    expect(currentDestination(job({ driverAcceptance: 'ACCEPTED', status: 'EN_ROUTE', pickupAddress: '   ' }))).toBeNull();
    expect(currentDestination(job({ driverAcceptance: 'ACCEPTED', status: 'DELIVERED' }))).toBeNull();
  });

  it('reads only the driver endpoint and sends the expected version on updates', async () => {
    apiRequest.mockResolvedValueOnce({ items: [job()], nextCursor: null }).mockResolvedValueOnce({});
    expect(await listDriverJobs()).toHaveLength(1);
    expect(apiRequest.mock.calls[0][0]).toBe('assignments/driver');
    await updateDriverJob(job(), 'REJECT', 'Vehicle problem');
    expect(apiRequest.mock.calls[1][0]).toBe('assignments/a1/status');
    expect(apiRequest.mock.calls[1][1]).toMatchObject({ method: 'PATCH', body: { action: 'REJECT', expectedVersion: 3, reason: 'Vehicle problem' } });
    expect(apiRequest.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer driver-token' });
  });
});
