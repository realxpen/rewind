import { calculateMatch, type PhysicalDiff } from "../../diff-engine/src/index.js";
import type { RestoreAction, RestorePlan } from "./types.js";

export interface RestoreProgress {
  percentage: number;
  remainingChanges: number;
  unknownChanges: number;
  restored: boolean;
  actions: RestoreAction[];
}

export function updateRestoreProgress(plan: RestorePlan, latestDiffs: PhysicalDiff[]): RestoreProgress {
  const match = calculateMatch(latestDiffs);
  const unresolvedEntities = new Set(
    latestDiffs.filter((diff) => diff.type !== "UNCHANGED").map((diff) => diff.entity),
  );
  const actions = plan.actions.map((action) => ({
    ...action,
    status: action.entityKeys.some((key) => unresolvedEntities.has(key)) ? "PENDING" as const : "VERIFIED" as const,
  }));
  return {
    percentage: match.percentage,
    remainingChanges: match.unresolved,
    unknownChanges: match.unknown,
    restored: match.restored,
    actions,
  };
}
