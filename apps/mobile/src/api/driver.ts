import type { AssignmentTransition, DriverJob, DriverSelfProfile, Page } from '@aaharaconnect/shared';
import { getCurrentAccessToken } from './auth';
import { apiRequest } from './client';

// Signed-in NGO employee driver. The API checks the DRIVER role and that each job is this driver's.
async function authHeaders() {
  return { Authorization: `Bearer ${await getCurrentAccessToken()}` };
}

export async function getOwnDriverProfile(): Promise<DriverSelfProfile> {
  return apiRequest<DriverSelfProfile>('drivers/me', { headers: await authHeaders() });
}

export async function listDriverJobs(): Promise<DriverJob[]> {
  const page = await apiRequest<Page<DriverJob>>('assignments/driver', { headers: await authHeaders() });
  return page.items;
}

export type DriverAction = Extract<AssignmentTransition['action'], 'ACCEPT' | 'REJECT' | 'START' | 'ARRIVE' | 'COLLECT' | 'DELIVER'>;

export async function updateDriverJob(job: Pick<DriverJob, 'assignmentId' | 'version'>, action: DriverAction, reason?: string): Promise<void> {
  await apiRequest(`assignments/${encodeURIComponent(job.assignmentId)}/status`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: { action, expectedVersion: job.version, ...(reason ? { reason } : {}) },
  });
}

const terminal = new Set<DriverJob['status']>(['DELIVERED', 'REJECTED', 'CANCELLED', 'FAILED']);
export const isClosedJob = (job: DriverJob) => terminal.has(job.status);

/**
 * The one next step the driver can take, following the shared assignment state machine.
 * Driver acceptance is recorded separately from the crew; the trip starts once a crew volunteer
 * has accepted too. Returns null when the driver is waiting on someone else or the job is closed.
 */
export function nextDriverStep(job: DriverJob): { action: DriverAction; label: string } | { waiting: string } | null {
  if (isClosedJob(job)) return null;
  if (job.driverAcceptance === 'PENDING') return { action: 'ACCEPT', label: 'Accept assignment' };
  if (job.status === 'PENDING') return job.crew.length > 0
    ? { waiting: 'Waiting for a crew volunteer to accept.' }
    : { action: 'START', label: 'Start journey to pickup' };
  if (job.status === 'ACCEPTED') return { action: 'START', label: 'Start journey to pickup' };
  if (job.status === 'EN_ROUTE') return { action: 'ARRIVE', label: 'Check in at pickup' };
  if (job.status === 'ARRIVED_AT_DONOR') return { action: 'COLLECT', label: 'Confirm food collected' };
  if (job.status === 'FOOD_COLLECTED') return { action: 'DELIVER', label: 'Confirm food delivered' };
  return null;
}

/** Where "Show on Maps" should take the driver right now: the donor before collection, then the delivery point. */
export function currentDestination(job: DriverJob): { label: string; address: string } | null {
  if (isClosedJob(job) || job.driverAcceptance !== 'ACCEPTED') return null;
  if (job.status === 'FOOD_COLLECTED') return job.deliveryAddress.trim() ? { label: 'delivery destination', address: job.deliveryAddress } : null;
  return job.pickupAddress.trim() ? { label: 'pickup', address: job.pickupAddress } : null;
}
