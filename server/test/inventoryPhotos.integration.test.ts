import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { createVehicleSchema, createVesselSchema, updateVesselSchema } from '@aaharaconnect/shared';
import { getPool, closePool } from '../src/db/pool';
import * as vehicles from '../src/modules/vehicles/repository';
import * as vessels from '../src/modules/vessels/repository';

const url = process.env.TEST_DATABASE_URL;
const enabled = !!url && new URL(url).pathname.endsWith('_test')
  && process.env.DATABASE_URL === url && process.env.ALLOW_TEST_DATABASE_MUTATION === 'true';
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=';
afterAll(async () => { if (enabled) await closePool(); });
async function rollbackTest(run: (client: PoolClient) => Promise<void>) {
  const client = await getPool().connect();
  try { await client.query('BEGIN'); await run(client); }
  finally { await client.query('ROLLBACK'); client.release(); }
}
describe.skipIf(!enabled)('Inventory photo persistence', () => {
  it('stores vehicle photos, preserves them during edits and supports removal', async () => {
    await rollbackTest(async client => {
      const input = createVehicleSchema.parse({ registrationNumber: 'PHOTO-' + randomUUID().slice(0, 18), kind: 'Van', capacityKg: 250, photoDataUrl: photo });
      const created = await vehicles.createVehicle(input, client);
      expect(created?.photoDataUrl).toBe(photo);
      await vehicles.updateVehicle(created!.id, { capacityKg: 300 }, client);
      expect((await vehicles.findVehicleById(created!.id, client))?.photoDataUrl).toBe(photo);
      await vehicles.updateVehicle(created!.id, { photoDataUrl: null }, client);
      expect((await vehicles.findVehicleById(created!.id, client))?.photoDataUrl).toBeNull();
    });
  });
  it('stores vessel photos without resetting other fields on photo-only edits', async () => {
    await rollbackTest(async client => {
      const input = createVesselSchema.parse({ vesselCode: 'PHOTO-' + randomUUID(), name: 'Photo test', vesselType: 'HOT_BOX', material: 'STAINLESS_STEEL', capacityValue: 20, capacityUnit: 'LITRES', temperatureSuitability: 'HOT', status: 'MAINTENANCE', photoDataUrl: photo });
      const created = await vessels.createVessel(input, client);
      expect(created?.photoDataUrl).toBe(photo);
      await vessels.updateVessel(created!.id, updateVesselSchema.parse({ name: 'Updated photo test' }), client);
      expect((await vessels.findVesselById(created!.id, client))?.photoDataUrl).toBe(photo);
      await vessels.updateVessel(created!.id, updateVesselSchema.parse({ photoDataUrl: null }), client);
      expect(await vessels.findVesselById(created!.id, client)).toMatchObject({ photoDataUrl: null, status: 'MAINTENANCE' });
    });
  });
});
