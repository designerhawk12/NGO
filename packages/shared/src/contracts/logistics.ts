// Pure, unit-aware load and container planning shared by the API (authoritative checks)
// and the Admin website (display). Nothing here invents a measurement:
//   * kilograms come from per-item weights or KG quantities;
//   * litres are converted to an ESTIMATED weight at 1 kg per litre and always labelled as estimates;
//   * meals and packages without a recorded weight are "unmeasured" and force capacity verification.
// Litre-rated containers are treated as holding about 1 kg per litre, again labelled as an estimate.

export type LoadFoodItem = {
  name?: string | null;
  quantity: number;
  unit: 'MEALS' | 'KG' | 'LITRES' | 'PACKAGES' | string;
  estimatedWeightKg?: number | null;
};

export type LoadAssessment = {
  /** Best available total weight in kg, or null when it cannot be determined from stored data. */
  weightKg: number | null;
  /** Sum of weights that are actually known (measured or litre-estimated); a lower bound. */
  knownWeightKg: number;
  basis: 'MEASURED' | 'ESTIMATED' | 'UNKNOWN';
  liquidLitres: number;
  unmeasuredItems: string[];
  verificationRequired: boolean;
  notes: string[];
};

export type CapacityStatus = 'FITS' | 'EXCEEDS' | 'VERIFY';

export type VehicleCapacityAssessment = {
  status: CapacityStatus;
  message: string;
};

export type PlanningVessel = {
  id: string;
  name: string;
  vesselCode: string;
  vesselType: string;
  capacityValue: number;
  capacityUnit: 'LITRES' | 'KG' | string;
  temperatureSuitability: string;
  foodGradeCertified: boolean;
  hasTightLid: boolean;
  status: string;
  cleaningStatus: string;
  maintenanceCondition: string;
  inspectionResult?: string | null;
};

export type VesselRecommendationResult = {
  vesselIds: string[];
  totalCapacityKg: number;
  sufficient: boolean;
  estimate: boolean;
  summary: string;
  reasons: string[];
};

const round = (value: number) => Math.round(value * 100) / 100;

export function assessFoodLoad(items: LoadFoodItem[], requestEstimatedWeightKg?: number | null): LoadAssessment {
  let measuredKg = 0;
  let estimatedKg = 0;
  let liquidLitres = 0;
  const unmeasuredItems: string[] = [];
  const notes: string[] = [];
  for (const [index, item] of items.entries()) {
    const label = item.name?.trim() || `Item ${index + 1}`;
    const quantity = Number(item.quantity);
    if (item.unit === 'LITRES' && Number.isFinite(quantity) && quantity > 0) liquidLitres += quantity;
    if (item.estimatedWeightKg != null && Number(item.estimatedWeightKg) > 0) {
      measuredKg += Number(item.estimatedWeightKg);
    } else if (item.unit === 'KG' && Number.isFinite(quantity) && quantity > 0) {
      measuredKg += quantity;
    } else if (item.unit === 'LITRES' && Number.isFinite(quantity) && quantity > 0) {
      estimatedKg += quantity;
    } else {
      unmeasuredItems.push(label);
    }
  }
  if (estimatedKg > 0) notes.push('Litre quantities are estimated at about 1 kg per litre.');
  const knownWeightKg = round(measuredKg + estimatedKg);
  const requestKg = requestEstimatedWeightKg != null && Number(requestEstimatedWeightKg) > 0
    ? Number(requestEstimatedWeightKg) : null;

  if (unmeasuredItems.length === 0) {
    return {
      weightKg: knownWeightKg > 0 ? knownWeightKg : null,
      knownWeightKg,
      basis: knownWeightKg <= 0 ? 'UNKNOWN' : estimatedKg > 0 ? 'ESTIMATED' : 'MEASURED',
      liquidLitres: round(liquidLitres),
      unmeasuredItems,
      verificationRequired: knownWeightKg <= 0,
      notes,
    };
  }
  if (requestKg != null && requestKg >= knownWeightKg) {
    notes.push(`The donor's overall weight estimate (${round(requestKg)} kg) is used because ${unmeasuredItems.length} item(s) have no recorded weight.`);
    return {
      weightKg: round(requestKg), knownWeightKg, basis: 'ESTIMATED', liquidLitres: round(liquidLitres),
      unmeasuredItems, verificationRequired: false, notes,
    };
  }
  notes.push(`No weight is recorded for: ${unmeasuredItems.join(', ')}. Capacity verification required.`);
  return {
    weightKg: null, knownWeightKg, basis: 'UNKNOWN', liquidLitres: round(liquidLitres),
    unmeasuredItems, verificationRequired: true, notes,
  };
}

export function assessVehicleCapacity(load: LoadAssessment, capacityKg: number): VehicleCapacityAssessment {
  const payload = round(Number(capacityKg));
  if (load.weightKg != null) {
    if (load.weightKg > payload) {
      return { status: 'EXCEEDS', message: `Vehicle capacity is insufficient: about ${load.weightKg} kg of food against a ${payload} kg payload.` };
    }
    return {
      status: 'FITS',
      message: load.basis === 'MEASURED'
        ? `${load.weightKg} kg of food fits within the ${payload} kg payload.`
        : `Estimated ${load.weightKg} kg of food fits within the ${payload} kg payload (estimate — verify at pickup).`,
    };
  }
  if (load.knownWeightKg > payload) {
    return { status: 'EXCEEDS', message: `Vehicle capacity is insufficient: recorded items alone weigh ${load.knownWeightKg} kg against a ${payload} kg payload.` };
  }
  return {
    status: 'VERIFY',
    message: `Capacity verification required: some food items have no recorded weight. Recorded items weigh ${load.knownWeightKg} kg; payload is ${payload} kg.`,
  };
}

export function vesselUnavailableReason(vessel: PlanningVessel): string | null {
  if (vessel.status !== 'AVAILABLE') return `Container status is ${vessel.status.replaceAll('_', ' ').toLowerCase()}.`;
  if (vessel.cleaningStatus !== 'CLEAN') return 'Container is not clean.';
  if (vessel.maintenanceCondition === 'UNSAFE' || vessel.maintenanceCondition === 'NEEDS_REPAIR') return 'Container needs repair.';
  if (vessel.inspectionResult === 'FAILED') return 'Container failed inspection.';
  if (!vessel.foodGradeCertified) return 'Container is not food-grade certified.';
  if (!(Number(vessel.capacityValue) > 0)) return 'Container capacity is not recorded.';
  return null;
}

/** Capacity in kilogram-equivalents; litre-rated containers are an estimate at 1 kg per litre. */
export function vesselCapacityKg(vessel: PlanningVessel): number {
  return Number(vessel.capacityValue);
}

const isSealed = (vessel: PlanningVessel) => vessel.hasTightLid || vessel.vesselType === 'MILK_CAN';

function pick(pool: PlanningVessel[], need: number, chosen: PlanningVessel[]): number {
  let remaining = need;
  const available = [...pool].sort((a, b) => vesselCapacityKg(b) - vesselCapacityKg(a));
  while (remaining > 0.0001 && available.length > 0) {
    const fitting = available.filter(vessel => vesselCapacityKg(vessel) >= remaining);
    const next = fitting.length > 0 ? fitting[fitting.length - 1] : available[0];
    chosen.push(next);
    available.splice(available.indexOf(next), 1);
    remaining -= vesselCapacityKg(next);
  }
  return Math.max(0, remaining);
}

export function describeVessels(vessels: PlanningVessel[]): string {
  const groups = new Map<string, number>();
  for (const vessel of vessels) {
    const unit = vessel.capacityUnit === 'LITRES' ? 'L' : 'kg';
    const label = `${round(Number(vessel.capacityValue))} ${unit} ${vessel.name}`;
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  return [...groups.entries()].map(([label, count]) => `${count} × ${label}`).join(' + ');
}

export function recommendVessels(
  load: LoadAssessment,
  vessels: PlanningVessel[],
  maxVessels: number | null,
): VesselRecommendationResult {
  const usable = vessels.filter(vessel => vesselUnavailableReason(vessel) === null);
  const reasons: string[] = [];
  const estimate = load.basis !== 'MEASURED' || usable.some(vessel => vessel.capacityUnit === 'LITRES');
  if (usable.length === 0) {
    return { vesselIds: [], totalCapacityKg: 0, sufficient: false, estimate, summary: 'No clean, available food-grade containers are registered.', reasons: ['No clean, available food-grade containers are registered in Vessels.'] };
  }
  const required = load.weightKg ?? load.knownWeightKg;
  const chosen: PlanningVessel[] = [];
  const liquidNeed = Math.min(load.liquidLitres, required > 0 ? required : load.liquidLitres);
  let shortfall = 0;
  if (liquidNeed > 0) {
    const sealed = usable.filter(isSealed);
    const liquidShortfall = pick(sealed, liquidNeed, chosen);
    if (liquidShortfall > 0) {
      reasons.push(`Not enough sealed containers for ${load.liquidLitres} L of liquid food.`);
      shortfall += liquidShortfall;
    }
  }
  const solidNeed = Math.max(0, required - liquidNeed);
  if (solidNeed > 0 || required <= 0) {
    const remainingPool = usable.filter(vessel => !chosen.includes(vessel));
    shortfall += pick(remainingPool, required <= 0 ? 0.0001 : solidNeed, chosen);
  }
  if (shortfall > 0.0001 && !reasons.length) {
    reasons.push(`Available containers hold about ${round(chosen.reduce((sum, v) => sum + vesselCapacityKg(v), 0))} kg; about ${round(required)} kg is needed.`);
  }
  if (maxVessels != null && chosen.length > maxVessels) {
    reasons.push(`The selected vehicle carries at most ${maxVessels} container(s); ${chosen.length} would be needed.`);
  }
  if (load.weightKg == null) reasons.push('Food weight is not fully recorded, so this container plan must be verified at pickup.');
  const totalCapacityKg = round(chosen.reduce((sum, vessel) => sum + vesselCapacityKg(vessel), 0));
  const sufficient = shortfall <= 0.0001 && (maxVessels == null || chosen.length <= maxVessels);
  return {
    vesselIds: chosen.map(vessel => vessel.id),
    totalCapacityKg,
    sufficient,
    estimate,
    summary: chosen.length ? `Recommended: ${describeVessels(chosen)}` : 'No container combination found.',
    reasons,
  };
}

export function validateVesselSelection(
  load: LoadAssessment,
  selected: PlanningVessel[],
  maxVessels: number | null,
): string[] {
  const problems: string[] = [];
  if (selected.length === 0) {
    problems.push('Select at least one clean, food-grade container for this pickup.');
    return problems;
  }
  for (const vessel of selected) {
    const reason = vesselUnavailableReason(vessel);
    if (reason) problems.push(`${vessel.vesselCode}: ${reason}`);
  }
  if (maxVessels != null && selected.length > maxVessels) {
    problems.push(`The selected vehicle carries at most ${maxVessels} container(s).`);
  }
  const total = selected.reduce((sum, vessel) => sum + vesselCapacityKg(vessel), 0);
  const required = load.weightKg ?? load.knownWeightKg;
  if (required > 0 && total + 0.0001 < required) {
    problems.push(`Selected containers hold about ${round(total)} kg, but about ${round(required)} kg of food is expected.`);
  }
  if (load.liquidLitres > 0) {
    const sealedTotal = selected.filter(isSealed).reduce((sum, vessel) => sum + vesselCapacityKg(vessel), 0);
    if (sealedTotal + 0.0001 < load.liquidLitres) {
      problems.push(`Liquid food (${load.liquidLitres} L) needs sealed containers with at least that capacity.`);
    }
  }
  return problems;
}
