import type { PhysicalState, RelationType } from "../../physical-state-protocol/src/index.js";

export type VisionImageFormat = "png" | "jpeg" | "gif" | "webp";

export interface TrackedRelationHint {
  type: RelationType;
  target?: string;
  description?: string;
}

export interface TrackedEntityHint {
  key: string;
  category: string;
  description?: string;
  observableAttributes?: Record<string, string>;
  /** Checkpoint relations to explicitly re-check in the current image. */
  observableRelations?: TrackedRelationHint[];
}

export interface ObservationContext {
  spaceId: string;
  capturedAt: string;
  trackedEntities?: TrackedEntityHint[];
}

export interface VisionObservationRequest {
  imageBytes: Uint8Array;
  format: VisionImageFormat;
  context: ObservationContext;
}

export interface VisionTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface VisionObservation {
  state: PhysicalState;
  rawText: string;
  modelId: string;
  latencyMs: number;
  usage?: VisionTokenUsage;
}

export interface VisionStateEvaluation {
  expectedEntityCount: number;
  recognizedEntityCount: number;
  trustedEntityCount: number;
  entityRecall: number;
  trustedEntityRecall: number;
  expectedRelationCount: number;
  matchedRelationCount: number;
  relationRecall: number;
  expectedAttributeCount: number;
  matchedAttributeCount: number;
  attributeRecall: number;
  falsePositiveKeys: string[];
}
