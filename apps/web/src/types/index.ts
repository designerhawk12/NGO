export type VolunteerStatus = 'AVAILABLE' | 'ASSIGNED' | 'ON_DUTY' | 'OFF_DUTY' | 'UNAVAILABLE'
export type SlotStatus = 'AVAILABLE' | 'RESERVED' | 'UNAVAILABLE'
export type AssignmentStatus = 'Pending' | 'Accepted' | 'In Progress' | 'Completed' | 'Rejected' | 'Cancelled'
export type Page = 'dashboard' | 'volunteers' | 'teams' | 'food' | 'assignments' | 'pickups' | 'tracking' | 'vehicles' | 'vessels' | 'settings'

export interface Volunteer {
  volunteerId: string
  name: string
  phone: string
  email: string
  skills: string[]
  status: VolunteerStatus
  teamId?: string
  profileImage?: string
  joinedDate?: string
  completedAssignments?: number
  volunteerHours?: number
  rating?: number
}
export interface VolunteerTeam { teamId: string; teamName: string; leaderId: string; memberIds: string[] }
export interface AvailabilitySlot { slotId: string; volunteerId: string; startTime: string; endTime: string; status: SlotStatus }
export interface Assignment {
  assignmentId: string
  volunteerId?: string
  teamId?: string
  eventId: string
  vehicleId: string
  driverId: string
  role: string
  status: AssignmentStatus
  assignedTime: string
}
export interface Event { eventId: string; title: string; location: string; dateTime: string; eventType: string; expectedMeals: number }
export type VehicleLifecycleStatus = 'ACTIVE' | 'MAINTENANCE' | 'RETIRED'
export type VehicleDispatchReadiness = 'READY' | 'DISPATCHED' | 'MAINTENANCE_RESTRICTED' | 'RETIRED'

export interface VehicleReadinessReason {
  code: string
  message: string
  severity: 'BLOCKING' | 'WARNING'
}

export interface VehicleReadinessInfo {
  isReady: boolean
  dispatchStatus: VehicleDispatchReadiness
  reasons: VehicleReadinessReason[]
}

export interface Vehicle {
  photoDataUrl?: string | null
  vehicleId: string
  registrationNumber: string
  type: string
  capacityKg: number
  status: 'ACTIVE' | 'MAINTENANCE' | 'RETIRED' | 'AVAILABLE' | 'ON TRIP' | string
  sizeCategory?: 'SMALL' | 'MEDIUM' | 'LARGE'
  indicativeMaxVessels?: number
  usableCargoVolume?: string
  temperatureCapability?: 'AMBIENT' | 'CHILLED' | 'REFRIGERATED'
  equipment?: {
    insulatedBody?: boolean
    refrigeratedUnit?: boolean
    foodGradeContainers?: boolean
  }
  foodContactSuitable?: boolean
  registrationExpiry?: string
  insuranceExpiry?: string
  pollutionExpiry?: string
  nextServiceDate?: string
  lastCleaningDate?: string
  nextCleaningDueDate?: string
  driverId?: string
  driverName?: string
  driverPhone?: string
  driverLicence?: string
  lastMaintenance?: string
  nextMaintenance?: string
  readiness?: VehicleReadinessInfo
}
export interface Driver {
  driverId: string
  name: string
  phone: string
  licenseNumber: string
  licenseExpiry: string
  licenceNumber?: string
  licenceExpiresOn?: string
  status: 'ACTIVE' | 'INACTIVE' | 'AVAILABLE' | 'ON TRIP' | 'UNAVAILABLE'
}
export interface VehicleMaintenanceRecord {
  recordId: string
  vehicleId: string
  servicedOn: string
  condition: 'GOOD' | 'NEEDS_SERVICE' | 'UNSAFE'
  serviceType?: string
  summary: string
  nextServiceDueOn?: string
  recordedBy?: string
}