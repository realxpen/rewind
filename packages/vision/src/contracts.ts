import type { PhysicalState } from "../../physical-state-protocol/src/index.js";

export type VisionImageFormat = "png" | "jpeg" | "gif" | "webp";

export interface TrackedEntityHint {
  key: string;
  category: string;
  description?: string;
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
