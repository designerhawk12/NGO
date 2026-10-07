export type VolunteerStatus = 'AVAILABLE' | 'ASSIGNED' | 'ON_DUTY' | 'OFF_DUTY' | 'UNAVAILABLE'
export type SlotStatus = 'AVAILABLE' | 'RESERVED' | 'UNAVAILABLE'
export type AssignmentStatus = 'Pending' | 'Accepted' | 'In Progress' | 'Completed' | 'Rejected' | 'Cancelled'
export type Page = 'dashboard' | 'volunteers' | 'teams' | 'food' | 'assignments' | 'pickups' | 'tracking' | 'vehicles' | 'settings'

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
export interface Vehicle {
  vehicleId: string
  registrationNumber: string
  type: string
  capacityKg: number
  status: 'AVAILABLE' | 'ON TRIP' | 'MAINTENANCE'
  sizeCategory?: 'SMALL' | 'MEDIUM' | 'LARGE'
  indicativeMaxVessels?: number
  driverId?: string
  lastMaintenance?: string
  nextMaintenance?: string
}
export interface Driver { driverId: string; name: string; phone: string; licenseNumber: string; licenseExpiry: string; status: 'AVAILABLE' | 'ON TRIP' | 'UNAVAILABLE' }
export interface VehicleMaintenanceRecord {
  recordId: string
  vehicleId: string
  servicedOn: string
  condition: 'GOOD' | 'NEEDS_SERVICE' | 'UNSAFE'
  serviceType: string
  summary: string
  nextServiceDueOn?: string
  recordedBy?: string
}
