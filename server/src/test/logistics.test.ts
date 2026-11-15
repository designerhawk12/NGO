import { describe, expect, it } from 'vitest';
import {
  assessFoodLoad,
  assessVehicleCapacity,
  recommendVessels,
  validateVesselSelection,
  type PlanningVessel,
} from '@aaharaconnect/shared';

const vessel = (id: string, capacityValue: number, overrides: Partial<PlanningVessel> = {}): PlanningVessel => ({
  id, name: 'Container', vesselCode: id, vesselType: 'CRATE', capacityValue, capacityUnit: 'KG',
  temperatureSuitability: 'AMBIENT', foodGradeCertified: true, hasTightLid: false, status: 'AVAILABLE',
  cleaningStatus: 'CLEAN', maintenanceCondition: 'GOOD', inspectionResult: 'PASSED', ...overrides,
});

describe('unit-aware food load', () => {
  it('adds kilograms and per-item weights as measured weight', () => {
    const load = assessFoodLoad([
      { name: 'Rice', quantity: 20, unit: 'KG' },
      { name: 'Meals', quantity: 50, unit: 'MEALS', estimatedWeightKg: 15 },
    ]);
    expect(load).toMatchObject({ weightKg: 35, basis: 'MEASURED', verificationRequired: false, liquidLitres: 0 });
  });

  it('labels litre conversions as estimates and tracks liquids separately', () => {
    const load = assessFoodLoad([{ name: 'Dal', quantity: 12, unit: 'LITRES' }]);
    expect(load).toMatchObject({ weightKg: 12, basis: 'ESTIMATED', liquidLitres: 12 });
    expect(load.notes.join(' ')).toContain('estimated');
  });

  it('never invents a weight for meals or packages without one', () => {
    const load = assessFoodLoad([{ name: 'Packets', quantity: 40, unit: 'PACKAGES' }]);
    expect(load).toMatchObject({ weightKg: null, basis: 'UNKNOWN', verificationRequired: true, unmeasuredItems: ['Packets'] });
  });

  it('uses the donor overall estimate only when it covers the known items', () => {
    expect(assessFoodLoad([{ quantity: 40, unit: 'MEALS' }, { quantity: 5, unit: 'KG' }], 25))
      .toMatchObject({ weightKg: 25, basis: 'ESTIMATED', verificationRequired: false });
    expect(assessFoodLoad([{ quantity: 40, unit: 'MEALS' }, { quantity: 30, unit: 'KG' }], 25))
      .toMatchObject({ weightKg: null, verificationRequired: true });
  });
});

describe('vehicle capacity', () => {
  it('fits, exceeds, or requires verification without false guarantees', () => {
    const measured = assessFoodLoad([{ quantity: 30, unit: 'KG' }]);
    expect(assessVehicleCapacity(measured, 50).status).toBe('FITS');
    expect(assessVehicleCapacity(measured, 20)).toMatchObject({ status: 'EXCEEDS' });
    expect(assessVehicleCapacity(measured, 20).message).toContain('Vehicle capacity is insufficient');
    const unknown = assessFoodLoad([{ quantity: 10, unit: 'MEALS' }, { quantity: 5, unit: 'KG' }]);
    expect(assessVehicleCapacity(unknown, 50).status).toBe('VERIFY');
    expect(assessVehicleCapacity(unknown, 3).status).toBe('EXCEEDS');
  });
});

describe('container recommendation and validation', () => {
  const load = assessFoodLoad([{ quantity: 70, unit: 'KG' }]);

  it('recommends a compact combination from available, clean, food-grade inventory', () => {
    const result = recommendVessels(load, [
      vessel('A', 20), vessel('B', 20), vessel('C', 20), vessel('D', 10), vessel('E', 50, { status: 'IN_USE' }),
      vessel('F', 50, { foodGradeCertified: false }),
    ], null);
    expect(result.sufficient).toBe(true);
    expect(result.vesselIds).toEqual(['A', 'B', 'C', 'D']);
    expect(result.summary).toBe('Recommended: 3 × 20 kg Container + 1 × 10 kg Container');
  });

  it('reports a shortfall or vehicle container limit instead of a false recommendation', () => {
    expect(recommendVessels(load, [vessel('A', 20)], null).sufficient).toBe(false);
    const limited = recommendVessels(load, [vessel('A', 20), vessel('B', 20), vessel('C', 20), vessel('D', 10)], 2);
    expect(limited.sufficient).toBe(false);
    expect(limited.reasons.join(' ')).toContain('at most 2');
    expect(recommendVessels(load, [], null)).toMatchObject({ sufficient: false, vesselIds: [] });
  });

  it('puts liquids only in sealed containers', () => {
    const liquid = assessFoodLoad([{ quantity: 10, unit: 'LITRES' }]);
    const open = recommendVessels(liquid, [vessel('OPEN', 20)], null);
    expect(open.sufficient).toBe(false);
    const sealed = recommendVessels(liquid, [vessel('OPEN', 20), vessel('CAN', 10, { vesselType: 'MILK_CAN', capacityUnit: 'LITRES' })], null);
    expect(sealed).toMatchObject({ sufficient: true, vesselIds: ['CAN'], estimate: true });
  });

  it('validates Admin adjustments on the server', () => {
    expect(validateVesselSelection(load, [], null)).toHaveLength(1);
    expect(validateVesselSelection(load, [vessel('A', 50)], null).join(' ')).toContain('hold about 50 kg');
    expect(validateVesselSelection(load, [vessel('A', 50), vessel('B', 30, { cleaningStatus: 'DIRTY' })], null).join(' ')).toContain('not clean');
    expect(validateVesselSelection(load, [vessel('A', 50), vessel('B', 30)], 1).join(' ')).toContain('at most 1');
    expect(validateVesselSelection(load, [vessel('A', 50), vessel('B', 30)], null)).toEqual([]);
  });
});
