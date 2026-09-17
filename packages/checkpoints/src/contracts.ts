import type { PhysicalState } from "../../physical-state-protocol/src/index.js";

export interface Checkpoint {
  id: string;
  spaceId: string;
  name: string;
  observationId: string;
  state: PhysicalState;
  stateHash: string;
  /**
   * SHA-256 of the normalized JPEG used to create this checkpoint.
   * This is non-reversible evidence that allows REWIND to prove an exact
   * re-upload without retaining the photo itself.
   */
  sourceImageHash?: string;
  createdAt: string;
}

export interface SaveCheckpointInput {
  spaceId: string;
  name: string;
  observationId: string;
  state: PhysicalState;
  sourceImageHash?: string;
}

export interface CheckpointSummary {
  id: string;
  spaceId: string;
  name: string;
  observationId: string;
  stateHash: string;
  createdAt: string;
  entityCount: number;
  exactImageVerificationAvailable: boolean;
}

export interface CheckpointStore {
  save(checkpoint: Checkpoint): Promise<void>;
  list(spaceId: string): Promise<Checkpoint[]>;
  get(spaceId: string, checkpointId: string): Promise<Checkpoint | undefined>;
}
