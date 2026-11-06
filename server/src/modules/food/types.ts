import type {
  AssignmentStatus,
  CreateFoodRequest,
  FoodRequest,
  PickupStatus,
} from '@aaharaconnect/shared';

export type FoodRequestRow = {
  id: string;
  donor_id: string;
  source_name: string;
  source_type: string;
  pickup_address: string;
  prepared_at: Date;
  ready_at: Date;
  pickup_deadline: Date;
  estimated_weight_kg: string | number | null;
  handling_requirements: string;
  donor_safety_declaration: boolean;
  safety_review: 'PENDING' | 'APPROVED' | 'REJECTED';
  safety_reviewed_by: string | null;
  safety_reviewed_at: Date | null;
  contact_name: string;
  contact_phone_e164: string;
  notes: string | null;
  status: 'SUBMITTED' | 'CANCELLED';
  created_at: Date;
  cancelled_at: Date | null;
};

export type FoodItemRow = {
  id: string;
  food_request_id: string;
  food_type: string;
  quantity: string | number;
  unit: 'MEALS' | 'KG' | 'LITRES' | 'PACKAGES';
  handling_requirements: string;
  estimated_meals?: string | number | null;
  estimated_weight_kg?: string | number | null;
};

export type DonorRow = {
  id: string;
  app_user_id: string;
  organization_name: string | null;
  contact_phone_e164: string | null;
  created_at: Date;
};

export type FoodItemDetail = {
  foodType: string;
  quantity: number;
  unit: 'MEALS' | 'KG' | 'LITRES' | 'PACKAGES';
  handlingRequirements: string;
  estimatedMeals?: number;
  estimatedWeightKg?: number;
};

export type FoodItemSummaryCompat = {
  name: string;
  foodType: string;
  quantity: number;
  unit: string;
  peopleFed?: number;
};

export type FoodRequestPickupSummary = {
  id: string;
  status: PickupStatus;
  windowStartsAt: string;
  windowEndsAt: string;
  deliveryAddress: string;
  assignmentStatus?: AssignmentStatus | null;
};

export type FoodRequestDetail = FoodRequest & {
  donorName?: string;
  location?: string;
  foods?: FoodItemSummaryCompat[];
  totalFeeds?: number;
  pickup?: FoodRequestPickupSummary | null;
};

export type ListFoodRequestsQuery = {
  status?: 'SUBMITTED' | 'CANCELLED';
  safetyReview?: 'PENDING' | 'APPROVED' | 'REJECTED';
  limit?: number;
  cursor?: string;
};
