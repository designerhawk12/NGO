import {
  uuidSchema,
  type AppUser,
  type Availability,
  type CreateAvailabilityRequest,
  type Team,
  type Volunteer,
  type VolunteerApplication,
  type VolunteerApprovalDecision,
  type VolunteerRegistrationResult,
} from '@aaharaconnect/shared';
import type { PoolClient } from 'pg';
import { withTransaction } from '../../db/pool';
import { getSupabaseUserEmail, inviteSupabaseUserByEmail } from '../../auth/supabase';
import { HttpError } from '../../middleware/errorHandler';
import { getDriverDetailsForPerson, type DriverDetails } from '../vehicles/driverProfiles';
import * as volunteerRepository from './repository';
import type { VolunteerProfileRow } from './repository';
import type { AvailabilityRow } from './repository';
import { consumeVolunteerRegistrationRateLimit } from './registrationRateLimit';
import type {
  CreateSelfRegistrationInput,
  CreateTeamInput,
  ListApplicationsQuery,
  ListTeamsQuery,
  ListVolunteersQuery,
  UpdateAdminVolunteerInput,
  UpdateOwnProfileInput,
  UpdateTeamInput,
} from './schemas';

function requireVolunteer(actor: AppUser): void {
  if (actor.role !== 'VOLUNTEER') throw new HttpError(403, 'FORBIDDEN', 'Volunteer access is required.');
}

function requireAdmin(actor: AppUser): void {
  if (actor.role !== 'ADMIN') throw new HttpError(403, 'FORBIDDEN', 'Administrator access is required.');
}

function toVolunteer(row: VolunteerProfileRow): Volunteer {
  return {
    id: row.id,
    personId: row.person_id,
    registrationCode: row.registration_code,
    name: row.name,
    phoneE164: row.phone_e164,
    skills: row.skills,
    status: row.status,
  };
}

export async function getOwnProfile(actor: AppUser): Promise<Volunteer> {
  requireVolunteer(actor);
  const profile = await volunteerRepository.findByAppUserId(actor.id);
  if (!profile) throw new HttpError(404, 'NOT_FOUND', 'Volunteer profile not found.');
  return toVolunteer(profile);
}

export type OwnTeam = { id: string; name: string; isLeader: boolean };

export async function listOwnTeams(actor: AppUser): Promise<{ items: OwnTeam[]; nextCursor: null }> {
  requireVolunteer(actor);
  const profile = await volunteerRepository.findByAppUserId(actor.id);
  if (!profile) throw new HttpError(404, 'NOT_FOUND', 'Volunteer profile not found.');
  const rows = await volunteerRepository.listOwnTeamsByAppUserId(actor.id);
  return { items: rows.map(row => ({ id: row.id, name: row.name, isLeader: row.is_leader })), nextCursor: null };
}

export async function updateOwnProfile(actor: AppUser, input: UpdateOwnProfileInput): Promise<Volunteer> {
  requireVolunteer(actor);
  try {
    return await withTransaction(async client => {
      const profile = await volunteerRepository.findByAppUserId(actor.id, client, true);
      if (!profile) throw new HttpError(404, 'NOT_FOUND', 'Volunteer profile not found.');
      const updatedPerson = await volunteerRepository.updatePersonProfile(profile.person_id, input, client);
      return toVolunteer({ ...profile, ...updatedPerson });
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'Phone number is already in use.');
    }
    throw error;
  }
}

function toAvailability(row: AvailabilityRow): Availability {
  return {
    id: row.id,
    volunteerId: row.volunteer_id,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    state: row.state,
  };
}

export async function listOwnAvailability(actor: AppUser): Promise<{ items: Availability[]; nextCursor: null }> {
  requireVolunteer(actor);
  const profile = await volunteerRepository.findByAppUserId(actor.id);
  if (!profile) throw new HttpError(404, 'NOT_FOUND', 'Volunteer profile not found.');
  const rows = await volunteerRepository.listAvailabilityByVolunteerId(profile.id);
  return { items: rows.map(toAvailability), nextCursor: null };
}

export async function createOwnAvailability(actor: AppUser, input: CreateAvailabilityRequest): Promise<Availability> {
  requireVolunteer(actor);
  const row = await volunteerRepository.createAvailabilityForAppUser(actor.id, input);
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Volunteer profile not found.');
  return toAvailability(row);
}

export async function replaceOwnAvailability(actor: AppUser, availabilityId: string, input: CreateAvailabilityRequest): Promise<Availability> {
  requireVolunteer(actor);
  const row = await volunteerRepository.replaceAvailabilityForAppUser(actor.id, availabilityId, input);
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Availability slot not found.');
  return toAvailability(row);
}

export type VolunteerWindowAvailability = {
  id: string;
  personId: string;
  status: 'ACTIVE' | 'INACTIVE';
  isAvailable: boolean;
};

export async function getVolunteerAvailabilityForWindow(
  volunteerId: string, startsAt: Date, endsAt: Date, client?: PoolClient
): Promise<VolunteerWindowAvailability | null> {
  if (!(startsAt < endsAt)) throw new HttpError(400, 'VALIDATION_ERROR', 'Availability window end must follow start.');
  const row = await volunteerRepository.findWindowAvailability(volunteerId, startsAt, endsAt, client);
  if (!row) return null;
  return { id: row.id, personId: row.person_id, status: row.status, isAvailable: row.is_available };
}

export type VolunteerIdentity = Pick<VolunteerWindowAvailability, 'id' | 'personId' | 'status'>;
export type EligibleVolunteer = Omit<VolunteerIdentity, 'status'> & { status: 'ACTIVE'; isAvailable: true };
export type EligibleVolunteersQuery = { startAt: Date; endAt: Date; teamId?: string };
export type AssertVolunteerAssignableInput = { volunteerId: string; startAt: Date; endAt: Date };

function assertValidVolunteerId(volunteerId: string): void {
  if (!uuidSchema.safeParse(volunteerId).success) throw new HttpError(400, 'VALIDATION_ERROR', 'Volunteer ID must be a UUID.');
}

function assertValidWindow(startAt: Date, endAt: Date): void {
  if (!(startAt instanceof Date) || !(endAt instanceof Date) || !Number.isFinite(startAt.getTime())
    || !Number.isFinite(endAt.getTime()) || !(startAt < endAt)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A valid availability start and end window is required.');
  }
}

// Internal read projection for Team 3. Contact and authentication fields stay out of this port.
export async function getVolunteerById(volunteerId: string, client?: PoolClient): Promise<VolunteerIdentity | null> {
  assertValidVolunteerId(volunteerId);
  const row = await volunteerRepository.findVolunteerIdentityById(volunteerId, client);
  return row ? { id: row.id, personId: row.person_id, status: row.status } : null;
}

// This is an eligibility hint. Team 3 must recheck and reserve in its own transaction.
export async function listEligibleVolunteers(
  query: EligibleVolunteersQuery, client?: PoolClient
): Promise<EligibleVolunteer[]> {
  assertValidWindow(query.startAt, query.endAt);
  if (query.teamId && !uuidSchema.safeParse(query.teamId).success) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Team ID must be a UUID.');
  }
  const rows = await volunteerRepository.listEligibleVolunteerRows(query.startAt, query.endAt, query.teamId, client);
  return rows.filter(row => row.status === 'ACTIVE')
    .map(row => ({ id: row.id, personId: row.person_id, status: 'ACTIVE', isAvailable: true }));
}

export async function assertVolunteerAssignable(
  input: AssertVolunteerAssignableInput, client?: PoolClient
): Promise<VolunteerWindowAvailability> {
  assertValidVolunteerId(input.volunteerId);
  assertValidWindow(input.startAt, input.endAt);
  const volunteer = await getVolunteerAvailabilityForWindow(input.volunteerId, input.startAt, input.endAt, client);
  if (!volunteer) throw new HttpError(404, 'NOT_FOUND', 'Volunteer not found.');
  if (volunteer.status !== 'ACTIVE') throw new HttpError(409, 'RESOURCE_CONFLICT', 'Volunteer is not active.');
  if (!volunteer.isAvailable) throw new HttpError(409, 'RESOURCE_CONFLICT', 'Volunteer availability does not cover the requested window.');
  return volunteer;
}

export async function listAdminVolunteers(actor: AppUser, query: ListVolunteersQuery): Promise<{ items: Volunteer[]; nextCursor: string | null }> {
  requireAdmin(actor);
  const result = await volunteerRepository.listVolunteers(query);
  return { items: result.rows.map(toVolunteer), nextCursor: result.nextCursor };
}

export async function getAdminVolunteer(actor: AppUser, id: string): Promise<Volunteer> {
  requireAdmin(actor);
  const row = await volunteerRepository.findVolunteerById(id);
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Volunteer not found.');
  return toVolunteer(row);
}

export async function getAdminVolunteerDriverDetails(actor: AppUser, id: string): Promise<DriverDetails | null> {
  requireAdmin(actor);
  const volunteer = await volunteerRepository.findVolunteerById(id);
  if (!volunteer) throw new HttpError(404, 'NOT_FOUND', 'Volunteer not found.');
  return getDriverDetailsForPerson(volunteer.person_id);
}

function throwAdminVolunteerConflict(field: 'registrationCode' | 'phoneE164'): never {
  throw new HttpError(409, field === 'registrationCode' ? 'REGISTRATION_CODE_ALREADY_EXISTS' : 'PHONE_ALREADY_EXISTS',
    field === 'registrationCode' ? 'Registration code is already in use.' : 'Phone number is already in use.');
}

function handleAdminVolunteerWriteError(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
    throw new HttpError(409, 'RESOURCE_CONFLICT', 'Volunteer registration, phone or account conflicts with an existing record.');
  }
  throw error;
}

// Ordinary Volunteers now join only through mobile registration followed by Admin approval.
// The former Admin "Add Volunteer" invitation endpoint is retired: it never creates Auth
// identities or Volunteer rows any more. Existing invited Volunteers are unaffected.
export function createAdminVolunteer(actor: AppUser): never {
  requireAdmin(actor);
  throw new HttpError(
    410,
    'ADMIN_VOLUNTEER_CREATION_RETIRED',
    'Volunteers register in the AaharaConnect mobile app and are approved under Volunteer applications. NGO drivers are added from Assign Driver.'
  );
}

function registrationConflict(): HttpError {
  return new HttpError(409, 'VOLUNTEER_REGISTRATION_CONFLICT', 'An account or volunteer record already uses these details.');
}

export async function registerVolunteer(input: CreateSelfRegistrationInput, clientIp: string): Promise<VolunteerRegistrationResult> {
  if (!await consumeVolunteerRegistrationRateLimit(clientIp, input.email)) {
    throw new HttpError(429, 'INVITE_RATE_LIMITED', 'Volunteer registration limit reached. Please wait before trying again.');
  }
  const conflict = await volunteerRepository.findAdminVolunteerConflict(null, input.phoneE164);
  if (conflict) throw registrationConflict();

  let invited: Awaited<ReturnType<typeof inviteSupabaseUserByEmail>>;
  try {
    invited = await inviteSupabaseUserByEmail(input.email, input.name);
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) throw registrationConflict();
    throw error;
  }

  try {
    const applicationInput = {
      email: input.email,
      name: input.name,
      phoneE164: input.phoneE164,
      skills: input.skills,
    };
    await withTransaction(client => volunteerRepository.insertSelfRegisteredVolunteer(invited.authUserId, applicationInput, client));
  } catch {
    // The Auth invitation is an external side effect and cannot be rolled back
    // with the PostgreSQL transaction. Keep the identity and require review.
    console.error(JSON.stringify({ level: 'error', subsystem: 'VolunteerRegistration', code: 'REGISTRATION_REVIEW_REQUIRED' }));
    throw new HttpError(503, 'VOLUNTEER_REGISTRATION_REVIEW_REQUIRED', 'Your invitation may have been sent, but the application needs administrator review before retrying.');
  }

  return {
    status: 'PENDING',
    message: 'Application submitted successfully. Your Volunteer account is awaiting administrator approval.',
  };
}

export async function listPendingVolunteerApplications(
  actor: AppUser,
  query: ListApplicationsQuery
): Promise<{ items: VolunteerApplication[]; nextCursor: string | null }> {
  requireAdmin(actor);
  const result = await volunteerRepository.listPendingVolunteerApplications(query);
  const items = await Promise.all(result.rows.map(async row => ({
    volunteerId: row.volunteer_id,
    email: await getSupabaseUserEmail(row.auth_user_id),
    name: row.name,
    phoneE164: row.phone_e164,
    registrationCode: row.registration_code,
    skills: row.skills,
    applicationId: row.application_id,
    status: row.status,
    submittedAt: row.submitted_at.toISOString(),
  })));
  return { items, nextCursor: result.nextCursor };
}

export async function decideVolunteerApplication(
  actor: AppUser,
  volunteerId: string,
  decision: VolunteerApprovalDecision
): Promise<{ volunteerId: string; status: 'APPROVED' | 'DENIED' }> {
  requireAdmin(actor);
  return withTransaction(async client => {
    const application = await volunteerRepository.findVolunteerApplicationForUpdate(volunteerId, client);
    if (!application) throw new HttpError(404, 'NOT_FOUND', 'Volunteer application not found.');
    if (application.app_user_role !== 'VOLUNTEER') {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'The linked account is not a Volunteer account.');
    }
    if (application.status !== 'PENDING') {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'This volunteer application has already been reviewed.');
    }
    const updated = await volunteerRepository.setVolunteerApplicationDecision(
      volunteerId, decision.status, actor.id, client
    );
    if (!updated) throw new HttpError(409, 'RESOURCE_CONFLICT', 'This volunteer application has already been reviewed.');
    return { volunteerId: updated.volunteer_id, status: updated.status as 'APPROVED' | 'DENIED' };
  });
}

export async function updateAdminVolunteer(actor: AppUser, id: string, input: UpdateAdminVolunteerInput): Promise<Volunteer> {
  requireAdmin(actor);
  try {
    const row = await withTransaction(async client => {
      const current = await volunteerRepository.findVolunteerForAdminUpdate(id, client);
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Volunteer not found.');
      if (input.registrationCode !== undefined || input.phoneE164) {
        const conflict = await volunteerRepository.findAdminVolunteerConflict(
          input.registrationCode ?? current.registration_code,
          input.phoneE164 === undefined ? current.phone_e164 : input.phoneE164,
          id
        );
        if (conflict) throwAdminVolunteerConflict(conflict);
      }
      // Skills describe crew work only. They never create or change driver records: NGO drivers
      // are employees registered from Assign Driver.
      const volunteerChanged = (input.name !== undefined && input.name !== current.name)
        || (input.phoneE164 !== undefined && input.phoneE164 !== current.phone_e164)
        || (input.registrationCode !== undefined && input.registrationCode !== current.registration_code)
        || (input.status !== undefined && input.status !== current.status)
        || (input.skills !== undefined && (input.skills.length !== current.skills.length
          || input.skills.some((skill, index) => skill !== current.skills[index])));
      return volunteerChanged
        ? await volunteerRepository.updateAdminVolunteerRows(current, input, client) : current;
    });
    return toVolunteer(row);
  } catch (error) { handleAdminVolunteerWriteError(error); }
}

function toTeam(row: volunteerRepository.TeamRow): Team {
  return { id: row.id, name: row.name, leaderVolunteerId: row.leader_volunteer_id, memberIds: row.member_ids };
}

export async function listAdminTeams(actor: AppUser, query: ListTeamsQuery): Promise<{ items: Team[]; nextCursor: string | null }> {
  requireAdmin(actor);
  const result = await volunteerRepository.listTeams(query);
  return { items: result.rows.map(toTeam), nextCursor: result.nextCursor };
}

export async function getAdminTeam(actor: AppUser, id: string): Promise<Team> {
  requireAdmin(actor);
  const row = await volunteerRepository.findTeamById(id);
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Team not found.');
  return toTeam(row);
}

async function assertValidTeamMembers(memberIds: string[], leaderVolunteerId: string | null, client: PoolClient): Promise<void> {
  if (leaderVolunteerId && !memberIds.includes(leaderVolunteerId)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'The team leader must be a member.');
  }
  const existing = await volunteerRepository.findExistingVolunteerIds(memberIds, client);
  if (existing.length !== memberIds.length) {
    throw new HttpError(404, 'NOT_FOUND', 'One or more volunteers were not found.');
  }
}

function handleTeamWriteError(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error && ['23505', '23503'].includes(String(error.code))) {
    throw new HttpError(409, 'RESOURCE_CONFLICT', 'Team name or membership conflicts with an existing record.');
  }
  throw error;
}

export async function createAdminTeam(actor: AppUser, input: CreateTeamInput): Promise<Team> {
  requireAdmin(actor);
  try {
    return await withTransaction(async client => {
      await assertValidTeamMembers(input.memberIds, input.leaderVolunteerId, client);
      const id = await volunteerRepository.insertTeam(input.name, input.leaderVolunteerId, client);
      await volunteerRepository.replaceTeamMembers(id, input.memberIds, client);
      const row = await volunteerRepository.findTeamById(id, client);
      if (!row) throw new HttpError(500, 'INTERNAL_ERROR', 'Created team could not be read.');
      return toTeam(row);
    });
  } catch (error) { handleTeamWriteError(error); }
}

export async function updateAdminTeam(actor: AppUser, id: string, input: UpdateTeamInput): Promise<Team> {
  requireAdmin(actor);
  try {
    return await withTransaction(async client => {
      const locked = await volunteerRepository.findTeamForUpdate(id, client);
      if (!locked) throw new HttpError(404, 'NOT_FOUND', 'Team not found.');
      const current = await volunteerRepository.findTeamById(id, client);
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Team not found.');
      const memberIds = input.memberIds ?? current.member_ids;
      const leaderVolunteerId = input.leaderVolunteerId === undefined ? current.leader_volunteer_id : input.leaderVolunteerId;
      await assertValidTeamMembers(memberIds, leaderVolunteerId, client);
      await volunteerRepository.updateTeam(id, input.name ?? current.name, leaderVolunteerId, client);
      if (input.memberIds !== undefined) await volunteerRepository.replaceTeamMembers(id, memberIds, client);
      const row = await volunteerRepository.findTeamById(id, client);
      if (!row) throw new HttpError(500, 'INTERNAL_ERROR', 'Updated team could not be read.');
      return toTeam(row);
    });
  } catch (error) { handleTeamWriteError(error); }
}

export async function deleteAdminTeam(actor: AppUser, id: string): Promise<{ id: string; deleted: true }> {
  requireAdmin(actor);
  return withTransaction(async client => {
    const locked = await volunteerRepository.findTeamForUpdate(id, client);
    if (!locked) throw new HttpError(404, 'NOT_FOUND', 'Team not found.');
    const assignmentCount = await volunteerRepository.countAssignmentsForTeam(id, client);
    if (assignmentCount > 0) {
      throw new HttpError(409, 'RESOURCE_CONFLICT', 'This team is linked to pickup assignments. Reassign or close those assignments before deleting the team.');
    }
    // Remove only membership links. Operational assignments are checked above
    // and are never cascaded or deleted.
    await volunteerRepository.deleteTeamMemberships(id, client);
    const deleted = await volunteerRepository.deleteTeam(id, client);
    if (!deleted) throw new HttpError(409, 'RESOURCE_CONFLICT', 'The team changed while it was being deleted. Refresh and try again.');
    return { id, deleted: true };
  });
}
