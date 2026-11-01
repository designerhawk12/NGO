import type {
  Availability,
  CreateAvailabilityRequest,
  Page,
  Volunteer,
  VolunteerRegistrationInput,
  VolunteerRegistrationResult,
} from '@aaharaconnect/shared';
import { getCurrentAccessToken } from './auth';
import { apiRequest } from './client';

async function authorization() {
  return { Authorization: `Bearer ${await getCurrentAccessToken()}` };
}

export async function getOwnVolunteerProfile(): Promise<Volunteer> {
  return apiRequest<Volunteer>('volunteers/me', { headers: await authorization() });
}

export function registerVolunteer(input: VolunteerRegistrationInput): Promise<VolunteerRegistrationResult> {
  return apiRequest<VolunteerRegistrationResult>('volunteers/register', { method: 'POST', body: input });
}

export type OwnVolunteerTeam = { id: string; name: string; isLeader: boolean };

export async function listOwnVolunteerTeams(): Promise<OwnVolunteerTeam[]> {
  const page = await apiRequest<Page<OwnVolunteerTeam>>('volunteers/me/teams', { headers: await authorization() });
  return page.items;
}

export async function updateOwnVolunteerProfile(input: { name: string; phoneE164?: string }): Promise<Volunteer> {
  return apiRequest<Volunteer>('volunteers/me', {
    method: 'PATCH', headers: await authorization(), body: input,
  });
}

export async function listOwnVolunteerAvailability(): Promise<Availability[]> {
  const page = await apiRequest<Page<Availability>>('volunteers/me/availability', { headers: await authorization() });
  return page.items;
}

export async function createOwnVolunteerAvailability(input: CreateAvailabilityRequest): Promise<Availability> {
  return apiRequest<Availability>('volunteers/me/availability', {
    method: 'POST', headers: await authorization(), body: input,
  });
}

export async function replaceOwnVolunteerAvailability(slotId: string, input: CreateAvailabilityRequest): Promise<Availability> {
  return apiRequest<Availability>(`volunteers/me/availability/${encodeURIComponent(slotId)}`, {
    method: 'PATCH', headers: await authorization(), body: input,
  });
}
