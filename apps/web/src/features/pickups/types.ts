export type PickupStatus =
  | 'PLANNED'
  | 'ASSIGNED'
  | 'EN_ROUTE'
  | 'ARRIVED_AT_DONOR'
  | 'FOOD_COLLECTED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED'

export type AssignmentStatusLive =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EN_ROUTE'
  | 'ARRIVED_AT_DONOR'
  | 'FOOD_COLLECTED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED'

export interface Pickup {
  id: string
  foodRequestId: string
  status: PickupStatus
  windowStartsAt: string
  windowEndsAt: string
  deliveryAddress: string
  version: number
  createdAt: string
  donorName?: string
  donorLocation?: string
  foods?: FoodItemSummary[]
  aiAssessment?: AiLogisticsAssessment
}

export interface CreatePickupInput {
  foodRequestId: string
  windowStartsAt: string
  windowEndsAt: string
  deliveryAddress: string
}

export interface ContainerPlan {
  containerType: string
  count: number
  estimatedLoadKg?: number
}

export interface CreateAssignmentInput {
  teamId?: string | null
  volunteerIds: string[]
  driverId: string
  vehicleId: string
  role: string
  windowStartsAt: string
  windowEndsAt: string
  containers: ContainerPlan[]
}

export interface LiveAssignment {
  id: string
  pickupId: string
  status: AssignmentStatusLive
  version: number
  volunteerIds: string[]
  teamId?: string | null
  driverId: string
  vehicleId: string
}

export interface VehicleAssignmentSummary {
  assignmentId: string
  pickupId: string
  status: string
  pickupWindow: {
    windowStartsAt: string
    windowEndsAt: string
  }
  driverId: string
  volunteerIds: string[]
}

export interface FoodItemSummary {
  name: string
  foodType: string
  quantity: number
  unit: string
  peopleFed?: number
}

export interface VesselRecommendation {
  containerType: string
  count: number
  purpose: string
  capacityPerUnit: string
}

export interface VehicleRecommendation {
  vehicleType: string
  category: 'two_wheeler' | 'three_wheeler' | 'mini_truck' | 'cargo_van'
  reason: string
  maxCapacityKg: number
  suitabilityScore: number
  recommendedAction: string
}

export interface AiLogisticsAssessment {
  totalEstimatedWeightKg: number
  estimatedFeeds: number
  vessels: VesselRecommendation[]
  vehicle: VehicleRecommendation
  foodSafetyNotes: string[]
  temperaturePreservation: string
}

export interface FoodRequestSummary {
  id: string
  donorName: string
  location: string
  readyAt: string
  pickupDeadline: string
  status: string
  safetyReview: string
  foods?: FoodItemSummary[]
  totalFeeds?: number
  isDemo?: boolean
}
