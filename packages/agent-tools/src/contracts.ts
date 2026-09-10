import type { Checkpoint, CheckpointSummary, SaveCheckpointInput } from "../../checkpoints/src/contracts.js";
import type { MatchResult, PhysicalDiff } from "../../diff-engine/src/index.js";
import type { PhysicalState } from "../../physical-state-protocol/src/index.js";
import type {
  RestorePlan,
  RestoreProgress,
  RestoreSessionState,
} from "../../restore-engine/src/index.js";

export const AGENT_TOOL_NAMES = [
  "inspect_space",
  "save_checkpoint",
  "list_checkpoints",
  "compare_checkpoint",
  "start_rewind",
  "verify_rewind",
  "get_rewind_status",
  "cancel_rewind",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

/**
 * The observation provider owns perception. Agent tools receive semantic PSP state only;
 * they never receive or persist raw Ring media.
 */
export interface AgentObservation {
  observationId: string;
  state: PhysicalState;
  modelId?: string;
  latencyMs?: number;
}

export interface SpaceObserver {
  inspect(spaceId: string): Promise<AgentObservation>;
}

/** Narrow checkpoint dependency so DynamoDB remains canonical truth. */
export interface AgentCheckpointAccess {
  save(input: SaveCheckpointInput): Promise<Checkpoint>;
  list(spaceId: string): Promise<Checkpoint[]>;
  get(spaceId: string, checkpointId: string): Promise<Checkpoint | undefined>;
}

export interface AgentEntitySummary {
  key: string;
  category: string;
  confidence: number;
}

export interface InspectSpaceInput {
  spaceId: string;
}

export interface InspectSpaceResult {
  observationId: string;
  spaceId: string;
  capturedAt: string;
  entityCount: number;
  entities: AgentEntitySummary[];
}

export interface SaveCheckpointToolInput {
  spaceId: string;
  name: string;
}

export interface ListCheckpointsToolInput {
  spaceId: string;
}

export interface CompareCheckpointToolInput {
  spaceId: string;
  checkpointId: string;
}

export interface CompareCheckpointResult {
  checkpoint: CheckpointSummary;
  match: MatchResult;
  changeCount: number;
  changes: PhysicalDiff[];
}

export interface StartRewindToolInput {
  spaceId: string;
  checkpointId: string;
}

export interface VerifyRewindToolInput {
  spaceId: string;
  rewindSessionId: string;
}

export interface RewindToolResult {
  rewindSessionId: string;
  checkpoint: CheckpointSummary;
  state: RestoreSessionState;
  match: MatchResult;
  plan: RestorePlan;
  changeCount: number;
  changes: PhysicalDiff[];
  progress?: RestoreProgress;
}

export interface GetRewindStatusToolInput {
  spaceId: string;
  rewindSessionId: string;
}

export interface CancelRewindToolInput {
  spaceId: string;
  rewindSessionId: string;
}
