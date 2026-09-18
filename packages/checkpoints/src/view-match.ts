import { normalizeState, type PhysicalEntity, type PhysicalState } from "../../physical-state-protocol/src/index.js";
import type { Checkpoint, CheckpointView } from "./contracts.js";
import { checkpointViews } from "./service.js";

export interface CheckpointViewMatch {
  view: CheckpointView;
  score: number;
  exactKeyOverlap: number;
  categoryOverlap: number;
}

function entityWeight(entity: PhysicalEntity): number {
  if (entity.role === "ANCHOR") return 3;
  if (entity.role === "SURFACE") return 2;
  if (entity.importance === "critical") return 2;
  return 1;
}

function multisetCounts(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function categoryOverlapScore(left: PhysicalState, right: PhysicalState): number {
  const leftCounts = multisetCounts(left.entities.map(entity => entity.category));
  const rightCounts = multisetCounts(right.entities.map(entity => entity.category));
  let overlap = 0;
  for (const [category, count] of leftCounts) {
    overlap += Math.min(count, rightCounts.get(category) ?? 0);
  }
  return overlap;
}

export function scoreCheckpointView(view: CheckpointView, currentInput: PhysicalState | unknown): CheckpointViewMatch {
  const expected = normalizeState(view.state);
  const current = normalizeState(currentInput);
  if (expected.spaceId !== current.spaceId) {
    throw new Error(`Cannot select a checkpoint view across different spaces: ${expected.spaceId} vs ${current.spaceId}.`);
  }

  const currentByKey = new Map(current.entities.map(entity => [entity.key, entity]));
  let exactKeyOverlap = 0;
  let weightedKeyScore = 0;
  let totalExpectedWeight = 0;

  for (const entity of expected.entities) {
    const weight = entityWeight(entity);
    totalExpectedWeight += weight;
    const currentEntity = currentByKey.get(entity.key);
    if (currentEntity && currentEntity.category === entity.category) {
      exactKeyOverlap += 1;
      weightedKeyScore += weight;
    }
  }

  const categoryOverlap = categoryOverlapScore(expected, current);
  const keyRatio = totalExpectedWeight === 0 ? 0 : weightedKeyScore / totalExpectedWeight;
  const categoryRatio = expected.entities.length === 0
    ? 0
    : Math.min(1, categoryOverlap / expected.entities.length);

  // Stable keys/anchors are more trustworthy than category counts, while category overlap
  // lets a different camera angle still select the right semantic view before tracked Nova.
  const score = Math.round(((keyRatio * 0.7) + (categoryRatio * 0.3)) * 1000) / 1000;

  return { view, score, exactKeyOverlap, categoryOverlap };
}

export function selectBestCheckpointView(
  checkpoint: Checkpoint,
  currentInput: PhysicalState | unknown,
): CheckpointViewMatch {
  const matches = checkpointViews(checkpoint)
    .map(view => scoreCheckpointView(view, currentInput))
    .sort((left, right) =>
      right.score - left.score ||
      right.exactKeyOverlap - left.exactKeyOverlap ||
      right.categoryOverlap - left.categoryOverlap ||
      left.view.createdAt.localeCompare(right.view.createdAt),
    );

  const best = matches[0];
  if (!best) throw new Error("Checkpoint has no semantic views.");
  return best;
}

export function findCheckpointViewByImageHash(
  checkpoint: Checkpoint,
  sourceImageHash: string,
): CheckpointView | undefined {
  return checkpointViews(checkpoint).find(view => view.sourceImageHash === sourceImageHash);
}
