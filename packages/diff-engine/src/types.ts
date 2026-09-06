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
  percentage: number;
  matched: number;
  unresolved: number;
  unknown: number;
  total: number;
  restored: boolean;
}
