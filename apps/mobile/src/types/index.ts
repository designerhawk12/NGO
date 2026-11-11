export type Language = 'en' | 'kn';
export type Role = 'admin' | 'volunteer' | 'donor' | 'driver' | null;
export type AssignmentStatus = 'Pending' | 'Accepted' | 'In Progress' | 'Checked In' | 'Completed' | 'Rejected';
export type RequestStatus = 'Submitted' | 'Assigned' | 'Pickup In Progress' | 'Completed' | 'Cancelled';
export type VolunteerAssignment = {
  id: string; event: string; date: string; time: string; address: string; distance: string;
  role: string; team: string; leader: string; members: string[]; driver: string;
  driverPhone: string; vehicle: string; vehicleNumber: string; capacity: string;
  status: AssignmentStatus; notes: string; rejectionReason?: string;
};
export type AvailabilitySlot = { id: string; date: string; start: string; end: string; };
export type VolunteerProfile = { name: string; email: string; phone: string; registration: string; emergencyName: string; emergencyPhone: string; };
export type DonorProfile = { name: string; organization: string; email: string; phone: string; address: string; };
export type DonorRequest = {
  id: string; source: string; sourceType: string; address: string; date: string; time: string;
  foodType: string; meals: string; readyTime: string; contactName: string; phone: string;
  notes: string; status: RequestStatus; event: string; createdAt: string;
};
