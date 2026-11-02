import { describe, expect, it } from 'vitest';
import { createVehicleSchema, updateVehicleSchema, createVesselSchema, updateVesselSchema } from '@aaharaconnect/shared';
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
describe('inventory photos', () => {
  it('supports vessel photo updates, removal and invalid image rejection', () => {
    expect(createVesselSchema.shape.photoDataUrl.safeParse(photo).success).toBe(true);
    expect(updateVesselSchema.parse({ photoDataUrl: photo })).toEqual({ photoDataUrl: photo });
    expect(updateVesselSchema.parse({ photoDataUrl: null })).toEqual({ photoDataUrl: null });
    expect(updateVesselSchema.safeParse({ photoDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }).success).toBe(false);
  });
  it('accepts optional photos and explicit photo removal', () => {
    expect(createVehicleSchema.safeParse({ registrationNumber: 'KA-01-AB-9999', kind: 'Van', capacityKg: 250, photoDataUrl: photo }).success).toBe(true);
    expect(updateVehicleSchema.parse({ photoDataUrl: null })).toEqual({ photoDataUrl: null });
    expect(updateVehicleSchema.parse({ kind: 'Truck' })).not.toHaveProperty('photoDataUrl');
  });
  it('rejects unsupported, invalid and oversized photos', () => {
    for (const value of ['https://example.com/car.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,YmFk', 'data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(700000)]) {
      expect(updateVehicleSchema.safeParse({ photoDataUrl: value }).success).toBe(false);
    }
  });
});
