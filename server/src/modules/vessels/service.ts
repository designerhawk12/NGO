import type { PoolClient } from 'pg';
import { HttpError } from '../../middleware/errorHandler';
import type {
  CreateVessel,
  CreateVesselLog,
  IssueVessel,
  ListVesselsQuery,
  ReturnVessel,
  UpdateVessel,
  VesselsSummary,
} from '@aaharaconnect/shared';
import * as vesselRepo from './repository';

export async function listVessels(params: ListVesselsQuery, client?: PoolClient) {
  return vesselRepo.listVessels(params, client);
}

export async function getVesselById(id: string, client?: PoolClient) {
  const vessel = await vesselRepo.findVesselById(id, client);
  if (!vessel) {
    throw new HttpError(404, 'NOT_FOUND', 'Vessel not found.');
  }
  return vessel;
}

export async function createVessel(input: CreateVessel, client?: PoolClient) {
  // Validate capacity
  if (input.capacityValue <= 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Capacity value must be greater than zero.');
  }

  // Check unique code
  const existing = await vesselRepo.findVesselByCode(input.vesselCode, client);
  if (existing) {
    throw new HttpError(409, 'RESOURCE_CONFLICT', `A vessel with code '${input.vesselCode}' already exists.`);
  }

  const vessel = await vesselRepo.createVessel(input, client);
  if (!vessel) {
    throw new HttpError(500, 'INTERNAL_ERROR', 'Failed to retrieve vessel after creation.');
  }
  return vessel;
}

export async function updateVessel(
  id: string,
  patch: UpdateVessel,
  client?: PoolClient
) {
  const existing = await vesselRepo.findVesselById(id, client);
  if (!existing) {
    throw new HttpError(404, 'NOT_FOUND', 'Vessel not found.');
  }

  if (patch.capacityValue !== undefined && patch.capacityValue <= 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Capacity value must be greater than zero.');
  }

  if (patch.vesselCode && patch.vesselCode !== existing.vesselCode) {
    const codeConflict = await vesselRepo.findVesselByCode(patch.vesselCode, client);
    if (codeConflict && codeConflict.id !== id) {
      throw new HttpError(409, 'RESOURCE_CONFLICT', `A vessel with code '${patch.vesselCode}' already exists.`);
    }
  }

  const updated = await vesselRepo.updateVessel(id, patch, client);
  if (!updated) {
    throw new HttpError(404, 'NOT_FOUND', 'Vessel not found.');
  }
  return updated;
}

export async function deleteVessel(id: string, client?: PoolClient) {
  const existing = await vesselRepo.findVesselById(id, client);
  if (!existing) {
    throw new HttpError(404, 'NOT_FOUND', 'Vessel not found.');
  }
  return vesselRepo.deleteVessel(id, client);
}

export async function getVesselsSummary(client?: PoolClient): Promise<VesselsSummary> {
  return vesselRepo.getVesselsSummary(client);
}

export async function issueVessel(
  input: IssueVessel,
  actorUserId?: string,
  client?: PoolClient
) {
  return vesselRepo.issueVessel(input, actorUserId, client);
}

export async function issueVesselForAssignment(
  input: IssueVessel & { vehicleId: string },
  actorUserId: string,
  client: PoolClient
) {
  return vesselRepo.issueVessel(input, actorUserId, client);
}

export async function returnVessel(
  vesselId: string,
  input: ReturnVessel,
  actorUserId?: string,
  client?: PoolClient
) {
  return vesselRepo.returnVessel(vesselId, input, actorUserId, client);
}

export async function addVesselLog(
  vesselId: string,
  input: CreateVesselLog,
  actorUserId?: string,
  client?: PoolClient
) {
  await getVesselById(vesselId, client);
  return vesselRepo.addVesselLog(vesselId, input, actorUserId, client);
}

export async function listVesselLogs(vesselId: string, client?: PoolClient) {
  await getVesselById(vesselId, client);
  return vesselRepo.listVesselLogs(vesselId, client);
}
