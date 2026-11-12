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
  operationalNotes?: string | null
  donorName?: string
  donorLocation?: string
  foods?: FoodItemSummary[]
  aiAssessment?: AiLogisticsAssessment
}

export interface CreatePickupInput {
  foodRequestId: string
  windowStartsAt: string
  windowEndsAt: string
  distributionCenterId: string
}

export interface ContainerPlan {
  containerType: string
  count: number
  estimatedLoadKg?: number | null
}

export interface CreateAssignmentInput {
  teamId?: string | null
  volunteerIds: string[]
  vesselIds?: string[]
  driverId: string
  vehicleId?: string
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
  /** The NGO employee driver's own response, separate from the crew status. */
  driverAcceptance?: 'NOT_REQUIRED' | 'PENDING' | 'ACCEPTED' | 'DECLINED'
  crewResponses?: Array<{volunteerId:string;response:'PENDING'|'ACCEPTED'|'DECLINED'|'CANCELLED'}>
}

export interface VehicleAssignmentSummary {
  assignmentId: string
  pickupId: string
  status: string
  windowStartsAt?: string
  windowEndsAt?: string
  /** Legacy nested shape; the API returns flat windowStartsAt/windowEndsAt. */
  pickupWindow?: {
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
  pickup?: {
    id: string
    status: string
    windowStartsAt: string
    windowEndsAt: string
    deliveryAddress: string
    assignmentStatus?: string | null
  } | null
}

export interface VehicleCandidateScore {
  vehicleId: string
  registrationNumber: string
  kind: string
  capacityKg: number
  status: string
  isEligible: boolean
  isOverCapacity: boolean
  suitabilityScore: number
  rank: number
  reasons: string[]
  constraints: string[]
  distanceToDonorKm?: number
  durationToDonorMins?: number
  locationLabel?: string
  isLiveLocation?: boolean
  route?: import('./vehicleRouting').SpecifiedTripRoute
}

export interface VolunteerCandidateScore {
  volunteerId: string
  name: string
  role?: string
  skills: string[]
  status: string
  isEligible: boolean
  suitabilityScore: number
  rank: number
  reasons: string[]
  constraints: string[]
  availabilityLabel?: string
}
