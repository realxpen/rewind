import type { PhysicalState } from "../../physical-state-protocol/src/index.js";

export interface CheckpointView {
  id: string;
  observationId: string;
  state: PhysicalState;
  stateHash: string;
  /**
   * Non-reversible SHA-256 fingerprint of the normalized source image for this view.
   * Raw media is never stored by the checkpoint layer.
   */
  sourceImageHash?: string;
  createdAt: string;
}

export interface Checkpoint {
  id: string;
  spaceId: string;
  name: string;
  observationId: string;
  state: PhysicalState;
  stateHash: string;
  /**
   * Legacy/primary-view fingerprint retained for backward compatibility.
   * New multi-view checkpoints also carry the fingerprint on their primary view.
   */
  sourceImageHash?: string;
  /**
   * Optional for backward compatibility with checkpoints created before H2.
   * Service helpers expose old checkpoints as a synthetic single primary view.
   */
  views?: CheckpointView[];
  createdAt: string;
}

export interface SaveCheckpointInput {
  spaceId: string;
  name: string;
  observationId: string;
  state: PhysicalState;
  sourceImageHash?: string;
}

export interface AddCheckpointViewInput {
  spaceId: string;
  checkpointId: string;
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
  viewCount: number;
  /** Present on summaries produced by photo-aware checkpoint services. */
  exactImageVerificationAvailable?: boolean;
}

export interface CheckpointStore {
  save(checkpoint: Checkpoint): Promise<void>;
  update(checkpoint: Checkpoint): Promise<void>;
  list(spaceId: string): Promise<Checkpoint[]>;
  get(spaceId: string, checkpointId: string): Promise<Checkpoint | undefined>;
}
