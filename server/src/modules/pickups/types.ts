import type {
  Assignment,
  AssignmentStatus,
  AssignmentTransition,
  CreateAssignment,
  CreatePickup,
  Page,
  Pickup,
  PickupStatus,
} from '@aaharaconnect/shared';

export type {
  Assignment,
  AssignmentStatus,
  AssignmentTransition,
  CreateAssignment,
  CreatePickup,
  Page,
  Pickup,
  PickupStatus,
};

export type PickupRow = {
  id: string;
  food_request_id: string;
  window_starts_at: Date;
  window_ends_at: Date;
  delivery_address: string;
  status: PickupStatus;
  version: number;
  created_at: Date;
  operational_notes?: string | null;
};

export type AssignmentRow = {
  id: string;
  pickup_id: string;
  team_id: string | null;
  driver_id: string;
  vehicle_id: string;
  role: string;
  status: AssignmentStatus;
  version: number;
  created_at: Date;
  pickup_address?: string | null;
  delivery_address?: string | null;
  driver_acceptance?: 'NOT_REQUIRED' | 'PENDING' | 'ACCEPTED' | 'DECLINED' | null;
  own_response?: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | null;
  window_starts_at?: Date | null;
  window_ends_at?: Date | null;
  terminal_at?: Date | null;
};

export type IdempotencyKeyRow = {
  actor_user_id: string;
  key: string;
  request_hash: string;
  assignment_id: string | null;
  created_at: Date;
};

export type PickupDetail = Pickup & {
  deliveryAddress: string;
  createdAt?: string;
};

export type ListPickupsQuery = {
  cursor?: string;
  limit: number;
};

