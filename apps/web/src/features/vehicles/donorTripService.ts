import type { Vehicle } from '../../types'
import { apiRequest } from '../../api/client'
import { getAuthHeaders, isLiveAdmin } from '../pickups/adapters'

export interface FoodItemDetail {
  name: string
  quantity: number
  unit: string
  foodType?: string
}

export interface EquipmentRequirement {
  needsRefrigerator: boolean
  needsInsulatedBody: boolean
  label: string
  badgeClass: string
  reason: string
  containerRecommendation: string
}

export interface DonorPickupRequest {
  id: string
  donorName: string
  pickupAddress: string
  contactName?: string
  contactPhone?: string
  readyAt: string
  pickupDeadline: string
  estimatedWeightKg: number
  weightProvided?: boolean
  totalVessels: number
  foods: FoodItemDetail[]
  handlingRequirements: string
  equipment: EquipmentRequirement
  safetyReview?: 'PENDING' | 'APPROVED' | 'REJECTED'
  status: 'SUBMITTED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED'
  pickup?: {
    id: string
    status: string
    windowStartsAt: string
    windowEndsAt: string
    deliveryAddress: string
    assignmentStatus?: string | null
  } | null
  assignedVehicleId?: string
  assignedVehicleReg?: string
}

export interface VehicleActiveTrip {
  assignmentId: string
  pickupId?: string
  foodRequestId: string
  vehicleId: string
  vehicleReg: string
  driverId?: string
  driverName?: string
  donorName: string
  pickupAddress: string
  deliveryDestination: string
  windowStartsAt: string
  windowEndsAt: string
  estimatedWeightKg: number
  totalVessels: number
  foods: FoodItemDetail[]
  equipment: EquipmentRequirement
  status: 'ASSIGNED' | 'EN_ROUTE' | 'COLLECTED' | 'DELIVERED' | 'COMPLETED'
  assignedAt: string
}

/**
 * Automatically evaluates whether refrigerator or insulated thermal body
 * is required based on food items and handling specifications.
 */
export function calculateEquipmentRequirements(
  foods: FoodItemDetail[] = [],
  handlingNotes = ''
): EquipmentRequirement {
  const notesLower = (handlingNotes || '').toLowerCase()
  let hasCold =
    notesLower.includes('cold') ||
    notesLower.includes('refrigerat') ||
    notesLower.includes('chill') ||
    notesLower.includes('frozen')
  let hasHot =
    notesLower.includes('hot') ||
    notesLower.includes('thermal') ||
    notesLower.includes('cooked') ||
    notesLower.includes('insulat')

  for (const item of foods) {
    const name = (item.name || '').toLowerCase()
    const type = (item.foodType || '').toUpperCase()

    if (
      name.includes('curd') ||
      name.includes('dairy') ||
      name.includes('milk') ||
      name.includes('ice') ||
      name.includes('kulfi') ||
      name.includes('paneer') ||
      name.includes('cream') ||
      name.includes('salad') ||
      name.includes('raita') ||
      (type === 'SWEETS' && (name.includes('ras') || name.includes('milk') || name.includes('chilled')))
    ) {
      hasCold = true
    }

    if (
      name.includes('biryani') ||
      name.includes('rice') ||
      name.includes('dal') ||
      name.includes('sambar') ||
      name.includes('curry') ||
      name.includes('gravy') ||
      name.includes('soup') ||
      name.includes('roti') ||
      name.includes('chapati') ||
      name.includes('pulao') ||
      type === 'VEG' ||
      type === 'NON_VEG'
    ) {
      hasHot = true
    }
  }

  if (hasCold && hasHot) {
    return {
      needsRefrigerator: true,
      needsInsulatedBody: true,
      label: 'Dual-Zone: Refrigerator & Insulated Body Required',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      reason: 'Contains both hot entrees (>60°C) and cold perishables/dairy (<5°C) requiring segregated zones.',
      containerRecommendation: 'Insulated hot carriers + active cold carrier boxes',
    }
  }

  if (hasCold) {
    return {
      needsRefrigerator: true,
      needsInsulatedBody: false,
      label: 'Refrigerated Unit Required (< 5°C)',
      badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      reason: 'Cold perishables and dairy products require continuous refrigeration (<5°C).',
      containerRecommendation: 'Insulated Cold Carrier with eutectic cold packs',
    }
  }

  if (hasHot) {
    return {
      needsRefrigerator: false,
      needsInsulatedBody: true,
      label: 'Insulated Body Required (> 60°C)',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      reason: 'Cooked surplus food requires thermal body retention to maintain safe temperature (>60°C).',
      containerRecommendation: 'Thermal Hot Boxes with silicone gasket lid clamps',
    }
  }

  return {
    needsRefrigerator: false,
    needsInsulatedBody: false,
    label: 'Standard Cargo Storage',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    reason: 'Ambient shelf-stable goods; standard clean enclosed vehicle bed suitable.',
    containerRecommendation: 'Standard food-grade crates and tie-down straps',
  }
}

const STORAGE_KEY_TRIPS = 'aaharaconnect_vehicle_active_trips'

const SEEDED_DONOR_REQUESTS: DonorPickupRequest[] = [
  {
    id: 'f1000000-0000-4000-8000-000000000001',
    donorName: 'Royal Orchid Convention Center',
    pickupAddress: 'Royal Orchid Convention Center, Bellary Road, Yelahanka, Bengaluru',
    contactName: 'Vikram Malhotra',
    contactPhone: '+91 98765 41100',
    readyAt: new Date(Date.now() + 1800000).toISOString(),
    pickupDeadline: new Date(Date.now() + 12600000).toISOString(),
    estimatedWeightKg: 66,
    totalVessels: 4,
    foods: [
      { name: 'Basmati Rice', quantity: 30, unit: 'kg', foodType: 'VEG' },
      { name: 'Dal Makhani', quantity: 18, unit: 'kg', foodType: 'VEG' },
      { name: 'Mixed Veg Curry', quantity: 12, unit: 'kg', foodType: 'VEG' },
      { name: 'Gulab Jamun', quantity: 6, unit: 'kg', foodType: 'SWEETS' },
    ],
    handlingRequirements: 'Keep food covered in insulated thermal containers (>60°C).',
    equipment: calculateEquipmentRequirements([
      { name: 'Basmati Rice', quantity: 30, unit: 'kg', foodType: 'VEG' },
      { name: 'Dal Makhani', quantity: 18, unit: 'kg', foodType: 'VEG' },
      { name: 'Mixed Veg Curry', quantity: 12, unit: 'kg', foodType: 'VEG' },
      { name: 'Gulab Jamun', quantity: 6, unit: 'kg', foodType: 'SWEETS' },
    ], 'Thermal insulation >60C'),
    status: 'SUBMITTED',
  },
  {
    id: 'f1000000-0000-4000-8000-000000000002',
    donorName: 'Grand Palace Banquet & Catering',
    pickupAddress: 'Grand Palace Banquet Hall, Palace Grounds Gate 4, Bengaluru',
    contactName: 'Meenakshi Sundaram',
    contactPhone: '+91 98765 42200',
    readyAt: new Date(Date.now() + 3600000).toISOString(),
    pickupDeadline: new Date(Date.now() + 14400000).toISOString(),
    estimatedWeightKg: 70,
    totalVessels: 5,
    foods: [
      { name: 'Chilled Paneer Tikka', quantity: 25, unit: 'kg', foodType: 'VEG' },
      { name: 'Fresh Curd & Raita', quantity: 15, unit: 'kg', foodType: 'VEG' },
      { name: 'Ice Cream & Kulfi', quantity: 20, unit: 'kg', foodType: 'SWEETS' },
      { name: 'Packaged Sweets', quantity: 10, unit: 'kg', foodType: 'SWEETS' },
    ],
    handlingRequirements: 'Temperature sensitive: Requires refrigerated cold transport (<5°C).',
    equipment: calculateEquipmentRequirements([
      { name: 'Chilled Paneer Tikka', quantity: 25, unit: 'kg', foodType: 'VEG' },
      { name: 'Fresh Curd & Raita', quantity: 15, unit: 'kg', foodType: 'VEG' },
      { name: 'Ice Cream & Kulfi', quantity: 20, unit: 'kg', foodType: 'SWEETS' },
      { name: 'Packaged Sweets', quantity: 10, unit: 'kg', foodType: 'SWEETS' },
    ], 'Requires refrigerated cold transport (<5°C)'),
    status: 'SUBMITTED',
  },
  {
    id: 'f1000000-0000-4000-8000-000000000003',
    donorName: 'Whitefield Community Food Foundation',
    pickupAddress: 'Whitefield Main Road, Near ITPL, Bengaluru',
    contactName: 'Anil Deshmukh',
    contactPhone: '+91 98765 43300',
    readyAt: new Date(Date.now() + 2400000).toISOString(),
    pickupDeadline: new Date(Date.now() + 10800000).toISOString(),
    estimatedWeightKg: 45,
    totalVessels: 3,
    foods: [
      { name: 'Vegetable Biryani', quantity: 30, unit: 'kg', foodType: 'VEG' },
      { name: 'Mirchi Ka Salan', quantity: 15, unit: 'kg', foodType: 'VEG' },
    ],
    handlingRequirements: 'Keep covered in thermal hot box containers.',
    equipment: calculateEquipmentRequirements([
      { name: 'Vegetable Biryani', quantity: 30, unit: 'kg', foodType: 'VEG' },
      { name: 'Mirchi Ka Salan', quantity: 15, unit: 'kg', foodType: 'VEG' },
    ]),
    status: 'SUBMITTED',
  },
]

/**
 * Fetch all available donor requests from the backend API,
 * merging with any donor requests submitted by the teammate's donor app.
 */
export async function fetchAllDonorRequests(liveOnly = false): Promise<DonorPickupRequest[]> {
  const result: DonorPickupRequest[] = []
  const seenIds = new Set<string>()

  // 1. Live Admin Mode: Fetch exclusively from live backend Express endpoint
  if (isLiveAdmin()) {
    try {
      const headers = await getAuthHeaders()
      const data = await apiRequest<{ items: any[] }>('food-requests', { headers })
      if (data && Array.isArray(data.items)) {
        for (const item of data.items) {
          const foods: FoodItemDetail[] = (item.items || item.foods || []).map((f: any) => ({
            name: f.foodType || f.name || 'Food item',
            quantity: Number(f.quantity) || 1,
            unit: (f.unit || 'kg').toLowerCase(),
            foodType: f.foodType,
          }))

          const eq = calculateEquipmentRequirements(foods, item.handlingRequirements || '')
          const weightProvided = item.estimatedWeightKg != null && Number(item.estimatedWeightKg) > 0
          const totalVessels = weightProvided ? Math.max(1, Math.ceil(Number(item.estimatedWeightKg) / 15)) : 0
          const pickup = item.pickup
            ? {
                id: item.pickup.id,
                status: item.pickup.status,
                windowStartsAt: item.pickup.windowStartsAt,
                windowEndsAt: item.pickup.windowEndsAt,
                deliveryAddress: item.pickup.deliveryAddress,
                assignmentStatus: item.pickup.assignmentStatus ?? null,
              }
            : null
          const pickupStatus = item.pickup?.status
          const status: DonorPickupRequest['status'] = item.status === 'CANCELLED'
            ? 'CANCELLED'
            : pickup?.assignmentStatus
              ? 'ASSIGNED'
              : pickupStatus === 'DELIVERED'
                ? 'DELIVERED'
                : ['EN_ROUTE', 'ARRIVED_AT_DONOR', 'FOOD_COLLECTED'].includes(pickupStatus ?? '')
                  ? 'IN_TRANSIT'
                  : pickupStatus === 'ASSIGNED'
                    ? 'ASSIGNED'
                    : item.status || 'SUBMITTED'

          result.push({
            id: item.id,
            donorName: item.sourceName || item.donorName || 'Food Donor',
            pickupAddress: item.pickupAddress || item.location || 'Bengaluru',
            contactName: item.contactName,
            contactPhone: item.contactPhoneE164,
            readyAt: item.readyAt,
            pickupDeadline: item.pickupDeadline,
            estimatedWeightKg: weightProvided ? Number(item.estimatedWeightKg) : (Number(item.estimatedWeightKg) || 0),
            weightProvided,
            totalVessels,
            foods,
            handlingRequirements: item.handlingRequirements || '',
            equipment: eq,
            safetyReview: item.safetyReview,
            status,
            pickup,
          })
          seenIds.add(item.id)
        }
        return result
      }
    } catch (error) {
      if (liveOnly || isLiveAdmin()) throw error
      // Demo mode may use local donor records when the API is unavailable.
    }
  }

  if (liveOnly || isLiveAdmin()) return result

  // 2. Read from teammate's donor portal storage (aa:donations)
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('aa:donations')
      const donationsList: any[] = raw ? JSON.parse(raw) : []
      const persistedRaw = window.localStorage.getItem('aa:last-persisted-food-request-data')
      if (persistedRaw) {
        const persisted = JSON.parse(persistedRaw)
        if (persisted && persisted.id && !donationsList.some(d => d.id === persisted.id)) {
          donationsList.unshift(persisted)
        }
      }

      if (Array.isArray(donationsList)) {
        for (const d of donationsList) {
          if (!seenIds.has(d.id)) {
            const foods: FoodItemDetail[] = (d.foods || d.items || []).map((f: any) => ({
              name: f.name || f.foodType || 'Food item',
              quantity: Number(f.quantity) || 1,
              unit: (f.unit || 'kg').toLowerCase(),
              foodType: f.foodType,
            }))
            const eq = calculateEquipmentRequirements(foods, d.handlingRequirements || '')
            const totalWeight = foods.reduce((acc, f) => acc + (f.unit === 'kg' ? f.quantity : f.quantity * 0.1), 0)
            const weightKg = totalWeight > 0 ? Math.round(totalWeight) : 25
            const totalVessels = Math.max(1, Math.ceil(weightKg / 15))

            result.push({
              id: d.id,
              donorName: d.donorName || d.sourceName || 'Food Donor',
              pickupAddress: d.location || d.pickupAddress || 'Bengaluru',
              readyAt: d.readyAt || new Date().toISOString(),
              pickupDeadline: d.pickupDeadline || new Date(Date.now() + 10800000).toISOString(),
              estimatedWeightKg: weightKg,
              totalVessels,
              foods,
              handlingRequirements: d.handlingRequirements || '',
              equipment: eq,
              status: d.status || 'SUBMITTED',
            })
            seenIds.add(d.id)
          }
        }
      }
    } catch {}
  }

  // 3. Demo Mode fallback only: Seeded sample requests for offline prototype evaluation
  for (const s of SEEDED_DONOR_REQUESTS) {
    if (!seenIds.has(s.id)) {
      result.push(s)
      seenIds.add(s.id)
    }
  }

  return result
}

/**
 * Get active trips assigned to a specific vehicle.
 */
export function getActiveTripsForVehicle(vehicleId: string): VehicleActiveTrip[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_TRIPS)
    if (raw) {
      const parsed: VehicleActiveTrip[] = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter(t => t.vehicleId === vehicleId && t.status !== 'COMPLETED' && t.status !== 'DELIVERED')
      }
    }
  } catch {}
  return []
}

/**
 * Get all active trips across all vehicles.
 */
export function getAllActiveTrips(): VehicleActiveTrip[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_TRIPS)
    if (raw) {
      const parsed: VehicleActiveTrip[] = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter(t => t.status !== 'COMPLETED' && t.status !== 'DELIVERED')
      }
    }
  } catch {}
  return []
}

/**
 * Assign a food donor pickup request to a vehicle.
 * Checks capacity and updates status.
 */
export function assignDonorPickupToVehicle(
  vehicle: Vehicle,
  donorRequest: DonorPickupRequest,
  deliveryAddress = 'AaharaConnect Distribution Center, Indiranagar'
): { success: boolean; trip?: VehicleActiveTrip; error?: string } {
  if (vehicle.capacityKg < donorRequest.estimatedWeightKg) {
    return {
      success: false,
      error: `Vehicle capacity (${vehicle.capacityKg} kg) is insufficient for this pickup (${donorRequest.estimatedWeightKg} kg).`,
    }
  }

  const assignmentId = 'TRIP-' + String(Date.now()).slice(-4)
  const newTrip: VehicleActiveTrip = {
    assignmentId,
    foodRequestId: donorRequest.id,
    vehicleId: vehicle.vehicleId,
    vehicleReg: vehicle.registrationNumber,
    driverId: vehicle.driverId,
    driverName: vehicle.driverName,
    donorName: donorRequest.donorName,
    pickupAddress: donorRequest.pickupAddress,
    deliveryDestination: deliveryAddress,
    windowStartsAt: donorRequest.readyAt,
    windowEndsAt: donorRequest.pickupDeadline,
    estimatedWeightKg: donorRequest.estimatedWeightKg,
    totalVessels: donorRequest.totalVessels,
    foods: donorRequest.foods,
    equipment: donorRequest.equipment,
    status: 'ASSIGNED',
    assignedAt: new Date().toISOString(),
  }

  try {
    const existing = getAllActiveTrips().filter(t => t.assignmentId !== assignmentId)
    window.localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify([newTrip, ...existing]))
  } catch {}

  return { success: true, trip: newTrip }
}

/**
 * Mark a delivery completed!
 * Removes the trip entry and marks vehicle AVAILABLE.
 */
export function completeDeliveryTrip(assignmentId: string): { success: boolean; vehicleId?: string } {
  if (typeof window === 'undefined') return { success: false }

  try {
    const all = getAllActiveTrips()
    const target = all.find(t => t.assignmentId === assignmentId)
    const remaining = all.filter(t => t.assignmentId !== assignmentId)

    window.localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify(remaining))

    return {
      success: true,
      vehicleId: target?.vehicleId,
    }
  } catch {
    return { success: false }
  }
}
