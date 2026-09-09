import type { PhysicalState } from "../../physical-state-protocol/src/index.js";

export interface Checkpoint {
  id: string;
  spaceId: string;
  name: string;
  observationId: string;
  state: PhysicalState;
  stateHash: string;
  createdAt: string;
}

export interface SaveCheckpointInput {
  spaceId: string;
  name: string;
  observationId: string;
  state: PhysicalState;
}

export interface CheckpointSummary {
  id: string;
  spaceId: string;
  name: string;
  observationId: string;
  stateHash: string;
  createdAt: string;
  entityCount: number;
}

export interface CheckpointStore {
  save(checkpoint: Checkpoint): Promise<void>;
  list(spaceId: string): Promise<Checkpoint[]>;
  get(spaceId: string, checkpointId: string): Promise<Checkpoint | undefined>;
}
