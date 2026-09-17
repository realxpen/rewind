import type { PhysicalEntity, PhysicalRelation } from "../../physical-state-protocol/src/index.js";

export const DIFF_TYPES = ["ADDED", "REMOVED", "MOVED", "ATTRIBUTE_CHANGED", "UNCHANGED", "UNKNOWN"] as const;
export type DiffType = (typeof DIFF_TYPES)[number];

export interface DiffSnapshot {
  entity?: PhysicalEntity;
  relations?: PhysicalRelation[];
  attributes?: PhysicalEntity["attributes"];
}

export interface PhysicalDiff {
  type: DiffType;
  entity: string;
  category: string;
  expected?: DiffSnapshot;
  actual?: DiffSnapshot;
  confidence: number;
  reason: string;
}

export interface MatchResult {
  /** Percentage of confidently comparable entities that match the checkpoint. */
  percentage: number;
  matched: number;
  /** Confirmed changed entities plus uncertain entities. */
  unresolved: number;
  unknown: number;
  /** Added by the reliability scorer; optional for legacy fixtures/callers. */
  confirmedChanges?: number;
  /** Unique semantic entities considered, not raw diff rows. */
  total: number;
  /** Added by the reliability scorer; optional for legacy fixtures/callers. */
  coveragePercentage?: number;
  /** True only when every entity is confidently resolved and unchanged. */
  restored: boolean;
}
