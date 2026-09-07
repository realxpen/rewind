import type { PhysicalState } from "../../physical-state-protocol/src/index.js";
import {
  calculateMatch,
  compareStates,
  type DiffType,
  type MatchResult,
  type PhysicalDiff,
} from "../../diff-engine/src/index.js";

export const REQUIRED_DEMO_CHANGES = [
  { entity: "chair.main", type: "MOVED" },
  { entity: "headphones.main", type: "MOVED" },
  { entity: "backpack.black", type: "MOVED" },
  { entity: "tripod.camera", type: "REMOVED" },
  { entity: "desk.main", type: "ATTRIBUTE_CHANGED" },
  { entity: "lamp.left", type: "ATTRIBUTE_CHANGED" },
] as const satisfies ReadonlyArray<{ entity: string; type: DiffType }>;

export interface ChangedSceneGateResult {
  diffs: PhysicalDiff[];
  match: MatchResult;
  recognizedRequiredChanges: number;
  requiredChangeCount: number;
  missedRequiredChanges: Array<{ entity: string; type: DiffType }>;
  falseRestored: boolean;
  passed: boolean;
}

export function evaluateChangedSceneGate(
  checkpoint: PhysicalState,
  current: PhysicalState,
  minimumRecognizedChanges = 5,
): ChangedSceneGateResult {
  const diffs = compareStates(checkpoint, current);
  const match = calculateMatch(diffs);

  const missedRequiredChanges = REQUIRED_DEMO_CHANGES.filter(
    (required) =>
      !diffs.some(
        (diff) =>
          diff.entity === required.entity && diff.type === required.type,
      ),
  ).map((item) => ({ entity: item.entity, type: item.type }));

  const recognizedRequiredChanges =
    REQUIRED_DEMO_CHANGES.length - missedRequiredChanges.length;
  const falseRestored = match.restored;

  return {
    diffs,
    match,
    recognizedRequiredChanges,
    requiredChangeCount: REQUIRED_DEMO_CHANGES.length,
    missedRequiredChanges,
    falseRestored,
    passed:
      recognizedRequiredChanges >= minimumRecognizedChanges && !falseRestored,
  };
}
