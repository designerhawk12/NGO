import type {
  AiLogisticsAssessment,
  ContainerPlan,
  FoodItemSummary,
  VehicleCandidateScore,
  VehicleRecommendation,
  VesselRecommendation,
  VolunteerCandidateScore,
} from './types'
import { buildTripRoute } from './vehicleRouting'

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

export interface VehiclePickupRequirement {
  totalEstimatedWeightKg: number
  totalVessels?: number
  foodTypes?: string[]
  pickupAddress?: string
  deliveryAddress?: string
}

/**
 * Deterministic multi-criteria scoring algorithm to rank candidate vehicles
 * based on verified payload capacity, operational status, proximity to donor, and trip route.
 */
export function rankVehiclesForPickup(
  vehicles: any[],
  requirement: VehiclePickupRequirement
): {
  ranked: VehicleCandidateScore[]
  suitable: VehicleCandidateScore[]
  bestVehicle: VehicleCandidateScore | null
  noCandidatesReason?: string
} {
  const loadKg = Math.max(1, requirement.totalEstimatedWeightKg || 10)
  const vesselCount = requirement.totalVessels || 2

  const scored: VehicleCandidateScore[] = vehicles.map(v => {
    const vehicleId = String(v.vehicleId || v.id || '')
    const registrationNumber = String(v.registrationNumber || v.reg || vehicleId)
    const kind = String(v.kind || v.type || 'Standard Vehicle')
    const capacityKg = Number(v.capacityKg || v.capacity || 0)
    const status = String(v.status || 'ACTIVE').toUpperCase()
    const maxVessels = v.indicativeMaxVessels != null ? Number(v.indicativeMaxVessels) : undefined

    const tripRoute = buildTripRoute(v, requirement.pickupAddress, requirement.deliveryAddress)
    const distanceKm = tripRoute.distanceToDonorKm
    const durationMins = tripRoute.durationToDonorMins

    const reasons: string[] = []
    const constraints: string[] = []

    let isEligible = true
    let isOverCapacity = false

    // 1. Availability check from schema status ('ACTIVE', 'MAINTENANCE', 'RETIRED')
    if (status !== 'ACTIVE') {
      isEligible = false
      constraints.push(`Vehicle status is ${status} (must be ACTIVE for dispatch).`)
    }

    // 2. Authoritative Vehicle Readiness Check (Module 5 integration)
    const readiness = v.readiness
    if (readiness) {
      const blockingReasons = readiness.reasons?.filter((r: any) => r.severity === 'BLOCKING') || []
      // Critical blocks: RETIRED, MAINTENANCE status, UNSAFE condition, or active maintenance downtime
      const criticalBlocks = blockingReasons.filter((r: any) =>
        r.code === 'RETIRED_STATUS' ||
        r.code === 'MAINTENANCE_STATUS' ||
        r.code === 'MAINTENANCE_CONDITION_UNSAFE' ||
        r.code === 'ACTIVE_DOWNTIME_RESTRICTION'
      )

      if (criticalBlocks.length > 0) {
        isEligible = false
        for (const b of criticalBlocks) {
          constraints.push(`Readiness: ${b.message}`)
        }
      }

      // Informational active assignment notes
      const assignmentConflicts = blockingReasons.filter((r: any) =>
        r.code === 'ACTIVE_ASSIGNMENT_CONFLICT'
      )
      for (const ac of assignmentConflicts) {
        reasons.push(`ℹ️ Fleet note: ${ac.message}`)
      }

      const warnings = readiness.reasons?.filter((r: any) => r.severity === 'WARNING') || []
      for (const w of warnings) {
        reasons.push(`⚠️ ${w.message}`)
      }
    } else {
      if (v.hasActiveDowntime || v.has_active_downtime) {
        isEligible = false
        constraints.push('Vehicle has an active downtime restriction scheduled.')
      }
      if (v.latestCondition === 'UNSAFE' || v.latest_condition === 'UNSAFE') {
        isEligible = false
        constraints.push('Vehicle condition is UNSAFE from latest maintenance service.')
      }
    }

    // 3. Capacity check
    if (capacityKg < loadKg) {
      isEligible = false
      isOverCapacity = true
      constraints.push(
        `Over-capacity: vehicle payload capacity (${capacityKg} kg) cannot carry estimated load (${loadKg} kg). Deficit: ${loadKg - capacityKg} kg.`
      )
    }

    // 4. Indicative vessels check if present
    if (maxVessels != null && maxVessels < vesselCount) {
      constraints.push(
        `Vessel space constraint: vehicle specification accommodates ${maxVessels} vessels (${vesselCount} required).`
      )
    }

    if (!isEligible) {
      return {
        vehicleId,
        registrationNumber,
        kind,
        capacityKg,
        status,
        isEligible: false,
        isOverCapacity,
        suitabilityScore: 0,
        rank: 999,
        reasons,
        constraints,
        distanceToDonorKm: distanceKm,
        durationToDonorMins: durationMins,
        locationLabel: tripRoute.vehicleLocation.name,
        isLiveLocation: tripRoute.vehicleLocation.isLiveGps,
        route: tripRoute,
      }
    }

    // Score calculation for eligible vehicles (0-100 deterministic scoring algorithm)
    let score = 50
    const marginKg = capacityKg - loadKg

    // 1. Proximity score (closer to donor yields higher score)
    const proximityBonus = Math.max(5, Math.round(35 - Math.min(distanceKm, 20) * 1.5))
    score += proximityBonus
    if (distanceKm <= 2.5) {
      reasons.unshift(`📍 Nearest vehicle: stationed only ${distanceKm} km from donor venue (~${durationMins} mins dispatch time).`)
    } else if (distanceKm <= 5.0) {
      reasons.unshift(`📍 Close proximity: located ${distanceKm} km from donor venue (~${durationMins} mins transit time).`)
    } else if (distanceKm <= 10.0) {
      reasons.unshift(`📍 Regional dispatch: ${distanceKm} km from donor venue (~${durationMins} mins transit time).`)
    } else if (distanceKm <= 15.0) {
      reasons.unshift(`📍 Urban route: ${distanceKm} km from donor venue (~${durationMins} mins transit time).`)
    } else {
      reasons.unshift(`📍 Long-distance dispatch: ${distanceKm} km from donor venue (~${durationMins} mins transit time).`)
    }

    // 2. Capacity fit (up to 15 points)
    if (loadKg <= 25) {
      if (kind.toLowerCase().includes('two') || kind.toLowerCase().includes('scooter') || kind.toLowerCase().includes('ev')) {
        score += 15
        reasons.push(`Optimal agility: compact EV vehicle maneuvers through urban traffic with zero emissions for ${loadKg} kg load.`)
      } else if (kind.toLowerCase().includes('3') || kind.toLowerCase().includes('auto')) {
        score += 12
        reasons.push(`Stable urban transport with ample ${marginKg} kg payload margin.`)
      } else {
        score += 8
        reasons.push(`High capacity headroom (${marginKg} kg buffer), though slightly oversized for a ${loadKg} kg load.`)
      }
    } else if (loadKg <= 120) {
      if (kind.toLowerCase().includes('3') || kind.toLowerCase().includes('auto')) {
        score += 15
        reasons.push(`Ideal fit: flatbed cargo auto easily handles ${loadKg} kg load with ${marginKg} kg buffer.`)
      } else if (kind.toLowerCase().includes('truck') || kind.toLowerCase().includes('ace')) {
        score += 12
        reasons.push(`Mini truck provides safe, stable loading bed with ${marginKg} kg buffer.`)
      } else {
        score += 8
        reasons.push(`Cargo van safely carries ${loadKg} kg load.`)
      }
    } else if (loadKg <= 500) {
      if (kind.toLowerCase().includes('truck') || kind.toLowerCase().includes('ace')) {
        score += 15
        reasons.push(`Optimal payload fit: flatbed mini truck safely carries ${loadKg} kg bulk load (${marginKg} kg buffer).`)
      } else {
        score += 12
        reasons.push(`Large commercial cargo hold safely accommodates bulk food rescue load.`)
      }
    } else {
      score += 15
      reasons.push(`Heavy payload capability: safely transports ${loadKg} kg community banquet volume (${marginKg} kg buffer).`)
    }

    reasons.push(`Verified active vehicle with valid payload capacity of ${capacityKg} kg.`)
    reasons.push(`Specified Route: ${tripRoute.routeSummary}`)

    return {
      vehicleId,
      registrationNumber,
      kind,
      capacityKg,
      status,
      isEligible: true,
      isOverCapacity: false,
      suitabilityScore: Math.min(100, Math.round(score)),
      rank: 1,
      reasons,
      constraints,
      distanceToDonorKm: distanceKm,
      durationToDonorMins: durationMins,
      locationLabel: tripRoute.vehicleLocation.name,
      isLiveLocation: tripRoute.vehicleLocation.isLiveGps,
      route: tripRoute,
    }
  })

  // Sort: eligible candidates primarily by distance to donor ASC (closest vehicle to donor recommended first),
  // with suitability score breaking ties, followed by ineligible candidates
  scored.sort((a, b) => {
    if (a.isEligible && !b.isEligible) return -1
    if (!a.isEligible && b.isEligible) return 1
    const distA = a.distanceToDonorKm ?? 999
    const distB = b.distanceToDonorKm ?? 999
    if (Math.abs(distA - distB) > 0.1) {
      return distA - distB
    }
    return b.suitabilityScore - a.suitabilityScore
  })

  scored.forEach((c, idx) => {
    c.rank = idx + 1
  })

  const suitable = scored.filter(c => c.isEligible)
  const bestVehicle = suitable.length > 0 ? suitable[0] : null
  const noCandidatesReason =
    suitable.length === 0
      ? scored.some(c => c.isOverCapacity)
        ? `No available vehicles meet the required payload capacity of ${loadKg} kg.`
        : 'No vehicles are currently available for dispatch.'
      : undefined

  return { ranked: scored, suitable, bestVehicle, noCandidatesReason }
}

export interface VolunteerPickupRequirement {
  totalEstimatedWeightKg?: number
  foods?: FoodItemSummary[]
}

/**
 * Deterministic multi-criteria scoring algorithm to rank candidate volunteers
 * based on operational availability, active roster status, and food rescue skills.
 */
export function rankVolunteersForPickup(
  volunteers: any[],
  requirement: VolunteerPickupRequirement
): {
  ranked: VolunteerCandidateScore[]
  suitable: VolunteerCandidateScore[]
  bestVolunteer: VolunteerCandidateScore | null
  noCandidatesReason?: string
} {
  const loadKg = requirement.totalEstimatedWeightKg || 10

  const scored: VolunteerCandidateScore[] = volunteers.map(v => {
    const volunteerId = String(v.volunteerId || v.id || '')
    const name = String(v.name || v.fullName || volunteerId)
    const role = v.role ? String(v.role) : undefined
    const skills: string[] = Array.isArray(v.skills) ? v.skills : []
    const status = String(v.status || 'ACTIVE').toUpperCase()

    const reasons: string[] = []
    const constraints: string[] = []

    let isEligible = true

    if (status !== 'ACTIVE') {
      isEligible = false
      constraints.push('Volunteer is currently INACTIVE in roster.')
    }
    if (v.windowAvailable === false) {
      isEligible = false
      constraints.push(String(v.windowAvailabilityReason || 'No available volunteer schedule covers this pickup window.'))
    }

    if (!isEligible) {
      return {
        volunteerId,
        name,
        role,
        skills,
        status,
        isEligible: false,
        suitabilityScore: 0,
        rank: 999,
        reasons,
        constraints,
        availabilityLabel: status !== 'ACTIVE'
          ? 'Inactive roster'
          : String(v.windowAvailabilityLabel || 'Unavailable'),
      }
    }

    let score = 75

    const skillsLower = skills.map(s => s.toLowerCase())
    const roleLower = (role || '').toLowerCase()

    if (skillsLower.some(s => s.includes('food') || s.includes('handling') || s.includes('safety') || s.includes('pack'))) {
      score += 15
      reasons.push('Trained in hygienic food safety inspection, packing, and container handling.')
    }

    if (loadKg >= 30 && skillsLower.some(s => s.includes('heavy') || s.includes('lift') || s.includes('physical'))) {
      score += 10
      reasons.push(`Equipped for heavy container lifting (${loadKg} kg total load).`)
    }

    if (roleLower.includes('pickup') || roleLower.includes('rescue')) {
      score += 5
      reasons.push('Experienced food rescue pickup volunteer.')
    }

    reasons.push('Active roster status; eligible for assignment.')



    return {
      volunteerId,
      name,
      role,
      skills,
      status,
      isEligible: true,
      suitabilityScore: Math.min(100, score),
      rank: 1,
      reasons,
      constraints,
      availabilityLabel: 'Active — Eligible',
    }
  })

  scored.sort((a, b) => {
    if (a.isEligible && !b.isEligible) return -1
    if (!a.isEligible && b.isEligible) return 1
    return b.suitabilityScore - a.suitabilityScore
  })

  scored.forEach((c, idx) => {
    c.rank = idx + 1
  })

  const suitable = scored.filter(c => c.isEligible)
  const bestVolunteer = suitable.length > 0 ? suitable[0] : null





  const hasUnverifiedCandidates = scored.some(
    candidate => candidate.status === 'ACTIVE' && candidate.availabilityLabel === 'Not checked'
  )
  const noCandidatesReason =
    suitable.length === 0 && !hasUnverifiedCandidates
      ? 'No active volunteers are currently available in the roster.'
      : undefined






  return { ranked: scored, suitable, bestVolunteer, noCandidatesReason }
}
