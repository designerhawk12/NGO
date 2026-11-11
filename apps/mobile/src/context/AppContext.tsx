import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { C, font, shadow } from '../constants/theme';
import { donorProfile, initialAssignments, initialAvailability, initialRequests, volunteerProfile } from '../data/mockData';
import { AssignmentStatus, AvailabilitySlot, DonorProfile, DonorRequest, Role, VolunteerAssignment, VolunteerProfile } from '../types';
import { useLanguage } from './LanguageContext';
import { restoreAppUser, signOut } from '../api/auth';

type AppValue = {
  role: Role; mode: 'demo' | 'live' | null; login: (role: Exclude<Role, null>) => void; loginAuthenticated: (role: Exclude<Role, null>) => void; logout: () => void;
  volunteerApplicationStatus: 'PENDING' | 'DENIED' | null;
  setVolunteerApplicationStatus: (status: 'PENDING' | 'DENIED' | null) => void;
  assignments: VolunteerAssignment[]; updateAssignment: (id: string, status: AssignmentStatus, reason?: string) => void;
  slots: AvailabilitySlot[]; saveSlot: (slot: AvailabilitySlot) => void; deleteSlot: (id: string) => void;
  volunteer: VolunteerProfile; saveVolunteer: (profile: VolunteerProfile) => void;
  donor: DonorProfile; saveDonor: (profile: DonorProfile) => void;
  requests: DonorRequest[]; submitRequest: (request: Omit<DonorRequest, 'id' | 'status' | 'createdAt'>) => string;
  cancelRequest: (id: string) => boolean; notify: (message: string) => void;
};
const Context = createContext<AppValue | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  const [role, setRole] = useState<Role>(null);
  const [mode, setMode] = useState<'demo' | 'live' | null>(null);
  const [volunteerApplicationStatus, setVolunteerApplicationStatus] = useState<'PENDING' | 'DENIED' | null>(null);
  const demoChosen = useRef(false);
  useEffect(() => {
    let active = true;
    restoreAppUser().then(user => {
      if (!active || demoChosen.current) return;
      if (user?.role === 'VOLUNTEER' && (user.volunteerApplicationStatus === 'PENDING' || user.volunteerApplicationStatus === 'DENIED')) {
        setVolunteerApplicationStatus(user.volunteerApplicationStatus === 'DENIED' ? 'DENIED' : 'PENDING');
        return;
      }
      // The role always comes from the server; an NGO employee driver restores to the Driver screens.
      if (user?.role === 'ADMIN' || user?.role === 'DONOR' || user?.role === 'VOLUNTEER' || user?.role === 'DRIVER') {
        setVolunteerApplicationStatus(null);
        setMode('live');
        setRole(user.role === 'ADMIN' ? 'admin' : user.role === 'DONOR' ? 'donor' : user.role === 'DRIVER' ? 'driver' : 'volunteer');
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [slots, setSlots] = useState(initialAvailability);
  const [volunteer, setVolunteer] = useState(volunteerProfile);
  const [donor, setDonor] = useState(donorProfile);
  const [requests, setRequests] = useState(initialRequests);
  const [toast, setToast] = useState('');
  const notify = (message: string) => { setToast(message); setTimeout(() => setToast(''), 3000); };
  const updateAssignment = (id: string, status: AssignmentStatus, reason?: string) => {
    setAssignments(prev => prev.map(item => item.id === id ? { ...item, status, rejectionReason: reason } : item));
    const feedback: Record<AssignmentStatus, string> = { Pending: 'Pending', Accepted: 'Assignment accepted', 'In Progress': 'Pickup started', 'Checked In': 'Check-in complete', Completed: 'Assignment completed', Rejected: 'Assignment declined' };
    notify(feedback[status]);
  };
  const saveSlot = (slot: AvailabilitySlot) => { setSlots(prev => [slot, ...prev.filter(item => item.id !== slot.id)]); notify('Slot saved'); };
  const deleteSlot = (id: string) => { setSlots(prev => prev.filter(item => item.id !== id)); notify('Slot deleted'); };
  const saveVolunteer = (profile: VolunteerProfile) => { setVolunteer(profile); notify('Profile updated'); };
  const saveDonor = (profile: DonorProfile) => { setDonor(profile); notify('Profile updated'); };
  const submitRequest = (request: Omit<DonorRequest, 'id' | 'status' | 'createdAt'>) => {
    const next = Math.max(7, ...requests.map(item => Number(item.id.slice(4)) || 0)) + 1;
    const id = `REQ-${String(next).padStart(3, '0')}`;
    setRequests(prev => [{ ...request, id, status: 'Submitted', createdAt: new Date().toISOString().slice(0, 10) }, ...prev]);
    return id;
  };
  const cancelRequest = (id: string) => {
    const item = requests.find(request => request.id === id);
    if (!item || !['Submitted', 'Assigned'].includes(item.status)) { notify('Pickup has already begun.'); return false; }
    setRequests(prev => prev.map(request => request.id === id ? { ...request, status: 'Cancelled' } : request));
    notify('Request cancelled'); return true;
  };
  const value = {
    role, mode,
    volunteerApplicationStatus, setVolunteerApplicationStatus,
    login: (next: Exclude<Role, null>) => { demoChosen.current = true; setVolunteerApplicationStatus(null); void signOut(); setMode('demo'); setRole(next); },
    loginAuthenticated: (next: Exclude<Role, null>) => { demoChosen.current = false; setVolunteerApplicationStatus(null); setMode('live'); setRole(next); },
    logout: () => { demoChosen.current = true; setVolunteerApplicationStatus(null); setMode(null); setRole(null); void signOut(); },
    assignments: mode === 'live' && role === 'volunteer' ? [] : assignments, updateAssignment,
    slots: mode === 'live' && role === 'volunteer' ? [] : slots, saveSlot, deleteSlot,
    volunteer, saveVolunteer, donor, saveDonor, requests: mode === 'live' && role === 'donor' ? [] : requests, submitRequest, cancelRequest, notify };
  return <Context.Provider value={value}>
    {children}
    {!!toast && <View pointerEvents="none" style={{ position: 'absolute', bottom: 88, alignSelf: 'center', backgroundColor: C.ink, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 14, maxWidth: '90%', ...shadow }}>
      <Text style={{ color: C.white, fontSize: 15, fontFamily: font, fontWeight: '600', textAlign: 'center' }}>{t(toast)}</Text>
    </View>}
  </Context.Provider>;
}
export function useApp() { const value = useContext(Context); if (!value) throw new Error('AppProvider missing'); return value; }
