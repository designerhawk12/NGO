import type { Assignment, AvailabilitySlot, Driver, Event, Vehicle, VehicleMaintenanceRecord, Volunteer, VolunteerTeam } from '../types'

export const skills = ['Food Handling', 'Coordination', 'Driving', 'Distribution', 'First Aid', 'Event Support']
export const roles = ['Team Leader', 'Driver', 'Pickup Volunteer', 'Food Handling Volunteer', 'Distribution Volunteer']

export const initialVolunteers: Volunteer[] = [
  { volunteerId: 'VOL001', name: 'Arjun Rao', phone: '+91 98765 42018', email: 'arjun.rao@example.com', skills: ['Food Handling', 'Coordination', 'Event Support'], status: 'AVAILABLE', teamId: 'T001', joinedDate: '2025-02-12', completedAssignments: 14, volunteerHours: 37, rating: 4.8 },
  { volunteerId: 'VOL002', name: 'Priya Sharma', phone: '+91 98765 42024', email: 'priya.sharma@example.com', skills: ['Food Handling', 'Distribution'], status: 'AVAILABLE', teamId: 'T001', joinedDate: '2025-03-08', completedAssignments: 11, volunteerHours: 31, rating: 4.9 },
  { volunteerId: 'VOL003', name: 'Rahul Kumar', phone: '+91 98765 42031', email: 'rahul.kumar@example.com', skills: ['Distribution', 'Event Support'], status: 'AVAILABLE', teamId: 'T001', joinedDate: '2025-05-14', completedAssignments: 9, volunteerHours: 26, rating: 4.7 },
  { volunteerId: 'VOL004', name: 'Sneha Patel', phone: '+91 98765 42045', email: 'sneha.patel@example.com', skills: ['First Aid', 'Food Handling'], status: 'ASSIGNED', teamId: 'T001', joinedDate: '2025-01-19', completedAssignments: 16, volunteerHours: 43, rating: 4.9 },
  { volunteerId: 'VOL005', name: 'Kiran Reddy', phone: '+91 98765 42057', email: 'kiran.reddy@example.com', skills: ['Driving', 'Coordination'], status: 'ON_DUTY', teamId: 'T002', joinedDate: '2025-04-02', completedAssignments: 12, volunteerHours: 35, rating: 4.7 },
  { volunteerId: 'VOL006', name: 'Neha Singh', phone: '+91 98765 42063', email: 'neha.singh@example.com', skills: ['Distribution', 'First Aid'], status: 'AVAILABLE', teamId: 'T002', joinedDate: '2025-06-11', completedAssignments: 7, volunteerHours: 19, rating: 4.8 },
  { volunteerId: 'VOL007', name: 'Rohan Joshi', phone: '+91 98765 42076', email: 'rohan.joshi@example.com', skills: ['Food Handling', 'Event Support'], status: 'AVAILABLE', teamId: 'T002', joinedDate: '2025-03-23', completedAssignments: 10, volunteerHours: 28, rating: 4.6 },
  { volunteerId: 'VOL008', name: 'Ananya Gupta', phone: '+91 98765 42082', email: 'ananya.gupta@example.com', skills: ['Coordination', 'First Aid'], status: 'OFF_DUTY', teamId: 'T003', joinedDate: '2025-07-06', completedAssignments: 6, volunteerHours: 17, rating: 4.8 },
  { volunteerId: 'VOL009', name: 'Meera Nair', phone: '+91 98765 42095', email: 'meera.nair@example.com', skills: ['Distribution', 'Food Handling'], status: 'AVAILABLE', teamId: 'T003', joinedDate: '2025-02-27', completedAssignments: 13, volunteerHours: 36, rating: 4.9 },
  { volunteerId: 'VOL010', name: 'Vikram Desai', phone: '+91 98765 42104', email: 'vikram.desai@example.com', skills: ['Driving', 'Event Support'], status: 'UNAVAILABLE', teamId: 'T003', joinedDate: '2025-05-03', completedAssignments: 8, volunteerHours: 22, rating: 4.5 },
  { volunteerId: 'VOL011', name: 'Aditi Kulkarni', phone: '+91 98765 42117', email: 'aditi.kulkarni@example.com', skills: ['Coordination', 'Distribution'], status: 'AVAILABLE', teamId: 'T004', joinedDate: '2025-04-18', completedAssignments: 11, volunteerHours: 30, rating: 4.8 },
  { volunteerId: 'VOL012', name: 'Sanjay Verma', phone: '+91 98765 42123', email: 'sanjay.verma@example.com', skills: ['Food Handling', 'First Aid'], status: 'ASSIGNED', teamId: 'T004', joinedDate: '2025-08-01', completedAssignments: 5, volunteerHours: 15, rating: 4.6 },
]

export const initialTeams: VolunteerTeam[] = [
  { teamId: 'T001', teamName: 'Team Alpha', leaderId: 'VOL001', memberIds: ['VOL001', 'VOL002', 'VOL004', 'VOL003'] },
  { teamId: 'T002', teamName: 'Team Bravo', leaderId: 'VOL005', memberIds: ['VOL005', 'VOL006', 'VOL007'] },
  { teamId: 'T003', teamName: 'Team Charlie', leaderId: 'VOL008', memberIds: ['VOL008', 'VOL009', 'VOL010'] },
  { teamId: 'T004', teamName: 'Team Delta', leaderId: 'VOL011', memberIds: ['VOL011', 'VOL012'] },
]

export const events: Event[] = [
  { eventId: 'E001', title: 'Sharma Wedding', location: 'Royal Convention Hall', dateTime: '2026-09-30T22:30:00', eventType: 'Wedding', expectedMeals: 120 },
  { eventId: 'E002', title: 'TechCorp Annual Event', location: 'Indiranagar Convention Centre', dateTime: '2026-09-30T21:45:00', eventType: 'Corporate Event', expectedMeals: 80 },
  { eventId: 'E003', title: 'Community Food Drive', location: 'Jayanagar Community Hall', dateTime: '2026-09-30T20:00:00', eventType: 'Community Event', expectedMeals: 60 },
  { eventId: 'E004', title: 'Garden City Reception', location: 'Koramangala Social Hall', dateTime: '2026-10-01T21:00:00', eventType: 'Reception', expectedMeals: 95 },
  { eventId: 'E005', title: 'Campus Alumni Dinner', location: 'Malleswaram Campus Hall', dateTime: '2026-10-02T20:30:00', eventType: 'Campus Event', expectedMeals: 70 },
  { eventId: 'E006', title: 'South Bengaluru Meetup', location: 'JP Nagar Community Centre', dateTime: '2026-10-03T19:45:00', eventType: 'Community Event', expectedMeals: 55 },
  { eventId: 'E007', title: 'Harvest Festival Lunch', location: 'Basavanagudi Cultural Centre', dateTime: '2026-10-04T15:00:00', eventType: 'Festival', expectedMeals: 110 },
  { eventId: 'E008', title: 'Neighbourhood Celebration', location: 'Whitefield Community Hall', dateTime: '2026-10-05T21:15:00', eventType: 'Community Event', expectedMeals: 65 },
]

export const drivers: Driver[] = [
  { driverId: 'D001', name: 'Ramesh Kumar', phone: '+91 98765 53011', licenseNumber: 'KA03 20200014852', licenseExpiry: '2028-12-31', status: 'AVAILABLE' },
  { driverId: 'D002', name: 'Suresh Nair', phone: '+91 98765 53022', licenseNumber: 'KA05 20190021642', licenseExpiry: '2027-08-18', status: 'ON TRIP' },
  { driverId: 'D003', name: 'Devendra Shetty', phone: '+91 98765 53033', licenseNumber: 'KA01 20210032511', licenseExpiry: '2029-04-12', status: 'AVAILABLE' },
  { driverId: 'D004', name: 'Manoj Prasad', phone: '+91 98765 53044', licenseNumber: 'KA04 20180017310', licenseExpiry: '2026-05-21', status: 'UNAVAILABLE' },
]

export const vehicles: Vehicle[] = [
  { vehicleId: 'V006', registrationNumber: 'KA-09-AB-2027', type: 'Van', capacityKg: 250, status: 'AVAILABLE', sizeCategory: 'MEDIUM', indicativeMaxVessels: 12, driverName: 'raj', lastMaintenance: '2026-09-29', nextMaintenance: '2026-10-29' },
  { vehicleId: 'V005', registrationNumber: 'KA-09-AB-2026', type: 'Van', capacityKg: 250, status: 'AVAILABLE', sizeCategory: 'MEDIUM', indicativeMaxVessels: 12, driverName: 'sumant', lastMaintenance: '2026-09-30', nextMaintenance: '2026-10-30' },
  { vehicleId: 'V002', registrationNumber: 'KA-09-AB-2048', type: 'Van 02', capacityKg: 250, status: 'AVAILABLE', sizeCategory: 'MEDIUM', indicativeMaxVessels: 14, driverId: 'D001', lastMaintenance: '2026-08-15', nextMaintenance: '2026-10-15' },
  { vehicleId: 'V001', registrationNumber: 'KA-05-MN-1180', type: 'Van 01', capacityKg: 200, status: 'ON TRIP', sizeCategory: 'SMALL', indicativeMaxVessels: 10, driverId: 'D002', lastMaintenance: '2026-09-01', nextMaintenance: '2026-11-01' },
  { vehicleId: 'V003', registrationNumber: 'KA-03-CD-4512', type: 'Van 03', capacityKg: 300, status: 'ON TRIP', sizeCategory: 'MEDIUM', indicativeMaxVessels: 18, driverId: 'D003', lastMaintenance: '2026-07-20', nextMaintenance: '2026-10-02' },
  { vehicleId: 'V004', registrationNumber: 'KA-01-PQ-7734', type: 'Mini Truck 01', capacityKg: 450, status: 'MAINTENANCE', sizeCategory: 'LARGE', indicativeMaxVessels: 26, driverId: 'D004', lastMaintenance: '2026-09-10', nextMaintenance: '2026-09-25' },
]

export const initialMaintenanceRecords: VehicleMaintenanceRecord[] = [
  { recordId: 'MNT001', vehicleId: 'V004', servicedOn: '2026-09-10', condition: 'NEEDS_SERVICE', serviceType: 'Brake Repair', summary: 'Brake pad wear detected; replacement required before high-payload trips.', nextServiceDueOn: '2026-09-25', recordedBy: 'Anjali Mehta' },
  { recordId: 'MNT002', vehicleId: 'V001', servicedOn: '2026-09-01', condition: 'GOOD', serviceType: 'General Service', summary: 'Routine 10,000 km oil change and tire rotation. All systems normal.', nextServiceDueOn: '2026-11-01', recordedBy: 'Anjali Mehta' },
  { recordId: 'MNT003', vehicleId: 'V002', servicedOn: '2026-08-15', condition: 'GOOD', serviceType: 'Insurance & Fitness', summary: 'Annual fitness certificate renewal and emission clearance passed.', nextServiceDueOn: '2026-10-15', recordedBy: 'Anjali Mehta' },
  { recordId: 'MNT004', vehicleId: 'V003', servicedOn: '2026-07-20', condition: 'GOOD', serviceType: 'AC Service', summary: 'Refrigeration unit inspection and insulated chamber sanitize.', nextServiceDueOn: '2026-10-02', recordedBy: 'Anjali Mehta' },
]

export const initialAssignments: Assignment[] = [
  { assignmentId: 'ASG001', teamId: 'T001', eventId: 'E001', vehicleId: 'V002', driverId: 'D001', role: 'Pickup Volunteer', status: 'Pending', assignedTime: '2026-09-28T10:00:00' },
  { assignmentId: 'ASG002', volunteerId: 'VOL002', eventId: 'E002', vehicleId: 'V003', driverId: 'D003', role: 'Food Handling Volunteer', status: 'In Progress', assignedTime: '2026-09-28T10:30:00' },
  { assignmentId: 'ASG003', volunteerId: 'VOL003', eventId: 'E003', vehicleId: 'V002', driverId: 'D001', role: 'Distribution Volunteer', status: 'Pending', assignedTime: '2026-09-28T11:00:00' },
  { assignmentId: 'ASG004', teamId: 'T002', eventId: 'E004', vehicleId: 'V001', driverId: 'D002', role: 'Team Leader', status: 'Accepted', assignedTime: '2026-09-27T16:00:00' },
  { assignmentId: 'ASG005', volunteerId: 'VOL009', eventId: 'E005', vehicleId: 'V003', driverId: 'D003', role: 'Food Handling Volunteer', status: 'Completed', assignedTime: '2026-09-25T13:00:00' },
  { assignmentId: 'ASG006', volunteerId: 'VOL004', eventId: 'E006', vehicleId: 'V002', driverId: 'D001', role: 'Pickup Volunteer', status: 'Accepted', assignedTime: '2026-09-26T12:00:00' },
  { assignmentId: 'ASG007', teamId: 'T003', eventId: 'E007', vehicleId: 'V003', driverId: 'D003', role: 'Distribution Volunteer', status: 'Completed', assignedTime: '2026-09-22T12:00:00' },
  { assignmentId: 'ASG008', volunteerId: 'VOL011', eventId: 'E008', vehicleId: 'V002', driverId: 'D001', role: 'Team Leader', status: 'Cancelled', assignedTime: '2026-09-24T12:00:00' },
  { assignmentId: 'ASG009', volunteerId: 'VOL006', eventId: 'E003', vehicleId: 'V003', driverId: 'D003', role: 'Distribution Volunteer', status: 'Rejected', assignedTime: '2026-09-27T13:00:00' },
  { assignmentId: 'ASG010', teamId: 'T004', eventId: 'E002', vehicleId: 'V001', driverId: 'D002', role: 'Food Handling Volunteer', status: 'Accepted', assignedTime: '2026-09-27T15:00:00' },
]

export const availabilitySlots: AvailabilitySlot[] = [
  ['VOL001', '2026-09-30T18:00', '2026-09-30T23:30', 'AVAILABLE'],
  ['VOL002', '2026-09-30T18:30', '2026-09-30T23:30', 'AVAILABLE'],
  ['VOL003', '2026-09-30T17:00', '2026-09-30T22:00', 'AVAILABLE'],
  ['VOL004', '2026-09-30T19:00', '2026-09-30T23:00', 'RESERVED'],
  ['VOL005', '2026-09-30T18:00', '2026-09-30T22:00', 'RESERVED'],
  ['VOL006', '2026-09-30T17:30', '2026-09-30T22:30', 'AVAILABLE'],
  ['VOL007', '2026-09-30T18:00', '2026-09-30T23:00', 'AVAILABLE'],
  ['VOL008', '2026-09-30T19:00', '2026-09-30T22:00', 'UNAVAILABLE'],
  ['VOL009', '2026-09-30T18:00', '2026-09-30T23:30', 'AVAILABLE'],
  ['VOL010', '2026-09-30T17:00', '2026-09-30T22:00', 'UNAVAILABLE'],
  ['VOL011', '2026-09-30T18:30', '2026-09-30T23:30', 'AVAILABLE'],
  ['VOL012', '2026-09-30T18:00', '2026-09-30T23:00', 'RESERVED'],
  ['VOL001', '2026-10-02T18:00', '2026-10-02T23:00', 'AVAILABLE'],
  ['VOL002', '2026-10-02T18:00', '2026-10-02T22:00', 'AVAILABLE'],
  ['VOL006', '2026-10-02T17:00', '2026-10-02T22:00', 'AVAILABLE'],
].map(([volunteerId, startTime, endTime, status], index) => ({ slotId: `SL${String(index + 1).padStart(3, '0')}`, volunteerId, startTime, endTime, status: status as AvailabilitySlot['status'] }))
