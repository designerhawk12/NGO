import type { PoolClient } from 'pg';
import { issueVesselForAssignment } from './service';

export interface VesselAssignmentPort {
  issueForAssignment(
    input: {
      vesselIds: string[];
      pickupId: string;
      vehicleId: string;
      actorUserId: string;
    },
    client: PoolClient
  ): Promise<void>;
}

export class DefaultVesselAssignmentPort implements VesselAssignmentPort {
  async issueForAssignment(
    input: {
      vesselIds: string[];
      pickupId: string;
      vehicleId: string;
      actorUserId: string;
    },
    client: PoolClient
  ): Promise<void> {
    for (const vesselId of input.vesselIds) {
      await issueVesselForAssignment({
        vesselId,
        pickupId: input.pickupId,
        vehicleId: input.vehicleId,
        issuedNotes: `Issued for pickup ${input.pickupId.slice(0, 8)}`,
      }, input.actorUserId, client);
    }
  }
}
