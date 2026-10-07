import type {
  AiLogisticsAssessment,
  ContainerPlan,
  FoodItemSummary,
  VehicleRecommendation,
  VesselRecommendation,
} from './types'

export function calculateAiLogistics(
  foods: FoodItemSummary[] = [],
  _donorName = 'Food Donor',
  _location = 'Bengaluru'
): AiLogisticsAssessment {
  let liquidKg = 0
  let solidKg = 0
  let dryKg = 0
  let sweetsKg = 0
  let totalExplicitFeeds = 0

  if (foods.length > 0) {
    for (const item of foods) {
      const name = item.name.toLowerCase()
      const rawQty = Number(item.quantity) || 0
      let weightKg = rawQty

      if (item.unit === 'pcs' || item.unit === 'pieces') {
        if (name.includes('roti') || name.includes('chapati') || name.includes('bread') || name.includes('naan')) {
          weightKg = rawQty * 0.05
        } else if (name.includes('sweet') || name.includes('jamun') || name.includes('ladoo') || name.includes('halwa')) {
          weightKg = rawQty * 0.04
        } else {
          weightKg = rawQty * 0.1
        }
      }

      if (item.peopleFed) {
        totalExplicitFeeds += item.peopleFed
      }

      if (
        name.includes('dal') ||
        name.includes('sambar') ||
        name.includes('curry') ||
        name.includes('gravy') ||
        name.includes('rasam') ||
        name.includes('kheer') ||
        name.includes('soup') ||
        name.includes('raita')
      ) {
        liquidKg += weightKg
      } else if (
        name.includes('roti') ||
        name.includes('chapati') ||
        name.includes('bread') ||
        name.includes('naan') ||
        name.includes('paratha') ||
        name.includes('snack')
      ) {
        dryKg += weightKg
      } else if (
        name.includes('sweet') ||
        name.includes('jamun') ||
        name.includes('halwa') ||
        name.includes('dessert') ||
        name.includes('salad') ||
        name.includes('curd')
      ) {
        sweetsKg += weightKg
      } else {
        solidKg += weightKg
      }
    }
  } else {
    // Default estimate for unspecified food requests
    solidKg = 25
    liquidKg = 15
  }

  const totalEstimatedWeightKg = Math.max(5, Math.round(liquidKg + solidKg + dryKg + sweetsKg))
  const estimatedFeeds = totalExplicitFeeds > 0 ? totalExplicitFeeds : Math.round(totalEstimatedWeightKg * 3.5)

  // Vessel Calculations
  const vessels: VesselRecommendation[] = []

  if (solidKg > 0) {
    const count = Math.max(1, Math.ceil(solidKg / 25))
    vessels.push({
      containerType: 'Insulated Thermal Hot Box (25kg)',
      count,
      purpose: 'Heat retention (>65°C) for bulk rice & hot main course',
      capacityPerUnit: '25 kg / vessel',
    })
  }

  if (liquidKg > 0) {
    const count = Math.max(1, Math.ceil(liquidKg / 15))
    vessels.push({
      containerType: 'Spill-Proof Stainless Steel Can (20L)',
      count,
      purpose: 'Leak-tight silicone gasket for gravies, sambar & dal',
      capacityPerUnit: '20 Liters / vessel',
    })
  }

  if (dryKg > 0) {
    const count = Math.max(1, Math.ceil(dryKg / 12))
    vessels.push({
      containerType: 'Food-Grade Stackable Bread Crate (15kg)',
      count,
      purpose: 'Aerated hygienic protection for rotis, chapatis & bread',
      capacityPerUnit: '15 kg / vessel',
    })
  }

  if (sweetsKg > 0) {
    const count = Math.max(1, Math.ceil(sweetsKg / 10))
    vessels.push({
      containerType: 'Insulated Cold Carrier (10kg)',
      count,
      purpose: 'Chilled preservation with food-grade ice/gel packs',
      capacityPerUnit: '10 kg / vessel',
    })
  }

  if (vessels.length === 0) {
    vessels.push({
      containerType: 'Insulated Thermal Hot Box (25kg)',
      count: 2,
      purpose: 'Standard food rescue thermal containers',
      capacityPerUnit: '25 kg / vessel',
    })
  }

  const totalVessels = vessels.reduce((acc, v) => acc + v.count, 0)

  // Vehicle Recommendation
  let vehicle: VehicleRecommendation

  if (totalEstimatedWeightKg <= 15 && totalVessels <= 2) {
    vehicle = {
      vehicleType: 'Two-Wheeler EV with Thermal Box',
      category: 'two_wheeler',
      maxCapacityKg: 25,
      suitabilityScore: 97,
      reason: `Lightweight food rescue (${totalEstimatedWeightKg}kg). EV two-wheeler swiftly navigates narrow streets and congested traffic with zero tailpipe emissions.`,
      recommendedAction: 'Dispatch volunteer with thermal delivery carrier backpack or secure bike pannier.',
    }
  } else if (totalEstimatedWeightKg <= 75 && totalVessels <= 6) {
    vehicle = {
      vehicleType: '3-Wheeler Cargo Auto (E-Rickshaw)',
      category: 'three_wheeler',
      maxCapacityKg: 120,
      suitabilityScore: 99,
      reason: `Optimal urban rescue load (${totalEstimatedWeightKg}kg across ${totalVessels} vessels). E-Cargo auto provides low-floor flatbed stability and prevents vessel tipping.`,
      recommendedAction: 'Dispatch 3-wheeler cargo vehicle with non-slip floor matting and vessel tie-down straps.',
    }
  } else if (totalEstimatedWeightKg <= 220) {
    vehicle = {
      vehicleType: 'Mini Commercial Truck (Tata Ace)',
      category: 'mini_truck',
      maxCapacityKg: 500,
      suitabilityScore: 98,
      reason: `Substantial community rescue (${totalEstimatedWeightKg}kg across ${totalVessels} vessels). Flatbed cargo truck safely accommodates heavy insulated hot boxes and liquid cans.`,
      recommendedAction: 'Dispatch Tata Ace or Mahindra Bolero with a 2-person crew for safe ergonomic loading.',
    }
  } else {
    vehicle = {
      vehicleType: 'Refrigerated Cargo Van (Tata 407)',
      category: 'cargo_van',
      maxCapacityKg: 1200,
      suitabilityScore: 96,
      reason: `Large-scale banquet rescue (${totalEstimatedWeightKg}kg). Temperature-controlled cargo hold maintains food safety across multiple community distribution centers.`,
      recommendedAction: 'Deploy refrigerated van with hydraulic lift gate and continuous temperature logger.',
    }
  }

  // AI Safety Guidelines
  const foodSafetyNotes: string[] = [
    'Maintain thermal food chain: keep hot items above 60°C and cold items below 5°C.',
    'Target collection-to-distribution window under 90 minutes to ensure fresh food quality.',
  ]

  if (liquidKg > 0) {
    foodSafetyNotes.push('Ensure silicone gasket lid clamps are tightly fastened before vehicle departs.')
  }

  if (totalEstimatedWeightKg >= 70) {
    foodSafetyNotes.push('Use two-person lift protocol for containers exceeding 20 kg.')
  }

  return {
    totalEstimatedWeightKg,
    estimatedFeeds,
    vessels,
    vehicle,
    foodSafetyNotes,
    temperaturePreservation: liquidKg > 0 || solidKg > 0 ? 'Hot thermal retention (>60°C)' : 'Ambient dry storage',
  }
}

export function getContainerPlansFromAi(assessment: AiLogisticsAssessment): ContainerPlan[] {
  return assessment.vessels.map(v => ({
    containerType: v.containerType,
    count: v.count,
    estimatedLoadKg: Math.round(assessment.totalEstimatedWeightKg / assessment.vessels.length),
  }))
}
