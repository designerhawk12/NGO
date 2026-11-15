import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { verify, findUser, query } = vi.hoisted(() => ({ verify: vi.fn(), findUser: vi.fn(), query: vi.fn() }));
vi.mock('../auth/supabase', () => ({ verifySupabaseToken: verify, getSupabaseAdminClient: () => { throw new Error('storage must not be reached'); } }));
vi.mock('../auth/appUsers', () => ({ findOrCreateAppUser: findUser }));
vi.mock('../db/pool', () => ({
  getPool: () => ({ query }),
  withTransaction: async (run: (client: { query: typeof query }) => Promise<unknown>) => run({ query }),
}));

import {
  createDistributionCenterSchema, createFoodRequestSchema, updateDistributionCenterSchema, uploadProfilePhotoSchema,
} from '@aaharaconnect/shared';
import { app } from '../app';
import { requireActiveCenterAddress } from '../modules/distribution/service';
import { detectImageType } from '../modules/profilePhotos/service';

const admin = { id: 'a0000000-0000-4000-8000-000000000001', authUserId: 'b0000000-0000-4000-8000-000000000001', role: 'ADMIN', displayName: 'Admin' };
const donor = { id: 'a0000000-0000-4000-8000-000000000003', authUserId: 'b0000000-0000-4000-8000-000000000003', role: 'DONOR', displayName: 'Donor' };
const asUser = (user: typeof admin | typeof donor) => { verify.mockResolvedValue({ authUserId: user.authUserId, email: 'u@example.com' }); findUser.mockResolvedValue(user); };

beforeEach(() => { vi.clearAllMocks(); query.mockReset(); asUser(admin); });

const jpegBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
const gifBase64 = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32, 1)]).toString('base64');
const centerId = 'c0000000-0000-4000-8000-000000000001';

describe('Distribution Center contracts', () => {
  it('requires an address and treats the name as optional', () => {
    expect(createDistributionCenterSchema.safeParse({ address: '12 MG Road, Bengaluru' }).success).toBe(true);
    expect(createDistributionCenterSchema.safeParse({ name: 'Indiranagar', address: '12 MG Road, Bengaluru' }).success).toBe(true);
    expect(createDistributionCenterSchema.safeParse({ name: 'No address' }).success).toBe(false);
    expect(createDistributionCenterSchema.safeParse({ address: 'abc' }).success).toBe(false);
    expect(updateDistributionCenterSchema.safeParse({}).success).toBe(false);
    expect(updateDistributionCenterSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});

describe('Distribution Center selection (server-side enforcement)', () => {
  it('rejects a missing, unknown or archived center and returns the address snapshot for an active one', async () => {
    await expect(requireActiveCenterAddress(undefined)).rejects.toMatchObject({ status: 400, code: 'DISTRIBUTION_CENTER_REQUIRED' });
    query.mockResolvedValueOnce({ rows: [] });
    await expect(requireActiveCenterAddress(centerId)).rejects.toMatchObject({ status: 400, code: 'DISTRIBUTION_CENTER_INVALID' });
    query.mockResolvedValueOnce({ rows: [{ id: centerId, address: 'Old', is_active: false }] });
    await expect(requireActiveCenterAddress(centerId)).rejects.toMatchObject({ status: 409, code: 'DISTRIBUTION_CENTER_INACTIVE' });
    query.mockResolvedValueOnce({ rows: [{ id: centerId, address: '12 MG Road', is_active: true }] });
    await expect(requireActiveCenterAddress(centerId)).resolves.toEqual({ id: centerId, address: '12 MG Road' });
  });
  it('creating a pickup without a center is rejected before any write', async () => {
    const response = await request(app).post('/api/v1/pickups').set('Authorization', 'Bearer t')
      .send({ foodRequestId: 'f0000000-0000-4000-8000-000000000001', windowStartsAt: '2030-10-10T10:00:00.000Z', windowEndsAt: '2030-10-10T12:00:00.000Z', deliveryAddress: 'Typed by hand' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('DISTRIBUTION_CENTER_REQUIRED');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO app.pickups'))).toBe(false);
  });
  it('limits the Distribution Center API to Admins', async () => {
    asUser(donor);
    expect((await request(app).get('/api/v1/distribution-centers').set('Authorization', 'Bearer t')).status).toBe(403);
    expect((await request(app).post('/api/v1/distribution-centers').set('Authorization', 'Bearer t').send({ address: '12 MG Road, Bengaluru' })).status).toBe(403);
    expect((await request(app).get('/api/v1/distribution-centers')).status).toBe(401);
  });
});

describe('profile photos', () => {
  it('recognises real JPEG, PNG and WebP bytes only', () => {
    expect(detectImageType(jpegBytes)).toBe('image/jpeg');
    expect(detectImageType(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]))).toBe('image/png');
    expect(detectImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]))).toBe('image/webp');
    expect(detectImageType(Buffer.from(gifBase64, 'base64'))).toBeNull();
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });
  it('validates the upload body shape and size', () => {
    expect(uploadProfilePhotoSchema.safeParse({ contentType: 'image/jpeg', dataBase64: jpegBytes.toString('base64') }).success).toBe(true);
    expect(uploadProfilePhotoSchema.safeParse({ contentType: 'image/gif', dataBase64: gifBase64 }).success).toBe(false);
    expect(uploadProfilePhotoSchema.safeParse({ contentType: 'image/jpeg', dataBase64: 'A'.repeat(900_000) }).success).toBe(false);
    expect(uploadProfilePhotoSchema.safeParse({ contentType: 'image/jpeg', dataBase64: '<script>alert(1)</script>' }).success).toBe(false);
  });
  it('rejects a mislabelled upload before touching storage, and needs sign-in', async () => {
    asUser(donor);
    const mislabelled = await request(app).put('/api/v1/profile-photos/me').set('Authorization', 'Bearer t').send({ contentType: 'image/jpeg', dataBase64: gifBase64 });
    expect(mislabelled.status).toBe(415);
    expect(mislabelled.body.error.code).toBe('PHOTO_TYPE_UNSUPPORTED');
    expect((await request(app).put('/api/v1/profile-photos/me').send({ contentType: 'image/jpeg', dataBase64: gifBase64 })).status).toBe(401);
  });
  it('lets only Admins look up other people\'s photos and never takes a user id for uploads', async () => {
    asUser(donor);
    const lookup = await request(app).post('/api/v1/profile-photos/lookup').set('Authorization', 'Bearer t').send({ kind: 'DONOR', ids: [donor.id] });
    expect(lookup.status).toBe(403);
    expect((await request(app).put(`/api/v1/profile-photos/${admin.id}`).set('Authorization', 'Bearer t').send({})).status).toBe(404);
  });
});

describe('food request without a "food ready" time', () => {
  const base = {
    sourceName: 'Hall', sourceType: 'Event', pickupAddress: 'Royal Hall, Bellary Road, Yelahanka', preparedAt: '2030-01-01T10:00:00.000Z',
    pickupDeadline: '2030-01-01T14:00:00.000Z', contactName: 'A', contactPhoneE164: '+919876543210', handlingRequirements: '',
    donorSafetyDeclaration: true as const, items: [{ foodType: 'Rice', quantity: 10, unit: 'MEALS' as const, handlingRequirements: '' }], estimatedWeightKg: null,
  };
  it('accepts requests with or without readyAt and still rejects a deadline before preparation', () => {
    expect(createFoodRequestSchema.safeParse(base).success).toBe(true);
    expect(createFoodRequestSchema.safeParse({ ...base, readyAt: '2030-01-01T10:30:00.000Z' }).success).toBe(true);
    expect(createFoodRequestSchema.safeParse({ ...base, readyAt: '2030-01-01T15:00:00.000Z' }).success).toBe(false);
    expect(createFoodRequestSchema.safeParse({ ...base, pickupDeadline: '2030-01-01T09:00:00.000Z' }).success).toBe(false);
  });
});
