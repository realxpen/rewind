import {
  normalizeState,
  type AttributeValue,
  type PhysicalEntity,
  type PhysicalState,
} from "../../physical-state-protocol/src/index.js";
import {
  compareStates as compareBaseStates,
  type CompareStatesOptions,
} from "./compare.js";
import type { PhysicalDiff } from "./types.js";

export type { CompareStatesOptions, ComparisonEvidenceMode } from "./compare.js";

const LEGACY_TRANSIENT_DYNAMIC_CATEGORIES = new Set(["bird", "animal", "pet"]);
const HUMAN_CATEGORIES = new Set(["person", "human"]);
const DYNAMIC_POSITION_KEYS = ["frame_x", "frame_y"] as const;
const DYNAMIC_MOVEMENT_THRESHOLD = 8;
const DYNAMIC_POSITION_MIN_CONFIDENCE = 0.75;

function isDynamicSubject(entity: PhysicalEntity): boolean {
  const category = entity.category.trim().toLowerCase();
  if (HUMAN_CATEGORIES.has(category)) return false;
  return entity.attributes?.dynamic_subject === true;
}

/**
 * Preserve the historical global comparison rule: unmarked living subjects are transient.
 * Ring/live perception explicitly opts non-human subjects into deterministic comparison by
 * emitting dynamic_subject=true. This keeps global restoration truth unchanged while allowing
 * species-specific live categories such as "cardinal" to participate without noun hardcoding.
 */
function normalizeForDynamicComparison(input: PhysicalState | unknown): PhysicalState {
  const state = normalizeState(input, { preserveDynamicSubjects: true });
  return {
    ...state,
    entities: state.entities.filter(entity => {
      const category = entity.category.trim().toLowerCase();
      if (HUMAN_CATEGORIES.has(category)) return false;
      if (LEGACY_TRANSIENT_DYNAMIC_CATEGORIES.has(category) && entity.attributes?.dynamic_subject !== true) {
        return false;
      }
      return true;
    }),
  };
}

function normalizedCoordinate(entity: PhysicalEntity, key: (typeof DYNAMIC_POSITION_KEYS)[number]): number | undefined {
  const value = entity.attributes?.[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : undefined;
}

function withoutDynamicPosition(attributes: PhysicalEntity["attributes"]): PhysicalEntity["attributes"] {
  if (!attributes) return undefined;
  const clean = Object.fromEntries(
    Object.entries(attributes).filter(([key]) => !DYNAMIC_POSITION_KEYS.includes(key as (typeof DYNAMIC_POSITION_KEYS)[number])),
  ) as Record<string, AttributeValue>;
  return Object.keys(clean).length ? clean : undefined;
}

function comparisonState(state: PhysicalState): PhysicalState {
  return {
    ...state,
    entities: state.entities.map(entity => {
      if (!isDynamicSubject(entity)) return entity;
      const attributes = withoutDynamicPosition(entity.attributes);
      const { attributes: _attributes, ...withoutAttributes } = entity;
      return attributes
        ? { ...withoutAttributes, category: "dynamic-subject", attributes }
        : { ...withoutAttributes, category: "dynamic-subject" };
    }),
  };
}

function originalCategory(
  key: string,
  checkpointByKey: Map<string, PhysicalEntity>,
  currentByKey: Map<string, PhysicalEntity>,
  fallback: string,
): string {
  const entity = checkpointByKey.get(key) ?? currentByKey.get(key);
  return entity && isDynamicSubject(entity) ? entity.category : fallback;
}

function dynamicMovementDiff(
  expected: PhysicalEntity,
  actual: PhysicalEntity,
): PhysicalDiff | undefined {
  if (!isDynamicSubject(expected) || !isDynamicSubject(actual)) return undefined;
  if (expected.attributes?.present === false || actual.attributes?.present === false) return undefined;

  const confidence = Math.min(expected.confidence, actual.confidence);
  if (confidence < DYNAMIC_POSITION_MIN_CONFIDENCE) return undefined;

  const expectedX = normalizedCoordinate(expected, "frame_x");
  const expectedY = normalizedCoordinate(expected, "frame_y");
  const actualX = normalizedCoordinate(actual, "frame_x");
  const actualY = normalizedCoordinate(actual, "frame_y");
  if (expectedX === undefined || expectedY === undefined || actualX === undefined || actualY === undefined) {
    return undefined;
  }

  const displacement = Math.hypot(actualX - expectedX, actualY - expectedY);
  if (displacement < DYNAMIC_MOVEMENT_THRESHOLD) return undefined;

  return {
    type: "MOVED",
    entity: expected.key,
    category: expected.category,
    expected: { entity: expected, attributes: { frame_x: expectedX, frame_y: expectedY } },
    actual: { entity: actual, attributes: { frame_x: actualX, frame_y: actualY } },
    confidence,
    reason: `Dynamic subject moved ${displacement.toFixed(1)} normalized frame units, exceeding the ${DYNAMIC_MOVEMENT_THRESHOLD}-unit fixed-camera noise threshold.`,
  };
}

/**
 * Core deterministic comparison with an additional fixed-camera movement signal for
 * explicitly marked non-human dynamic subjects. Nova supplies normalized current position;
 * this function alone decides whether displacement is large enough to count as MOVED.
 *
 * Marked dynamic subjects are canonicalized to one comparison category so wording drift
 * such as bird -> animal -> species-specific noun cannot hide or manufacture changes.
 */
export function compareStates(
  checkpointInput: PhysicalState | unknown,
  currentInput: PhysicalState | unknown,
  options: CompareStatesOptions = {},
): PhysicalDiff[] {
  const checkpoint = normalizeForDynamicComparison(checkpointInput);
  const current = normalizeForDynamicComparison(currentInput);

  const checkpointByKey = new Map(checkpoint.entities.map(entity => [entity.key, entity]));
  const currentByKey = new Map(current.entities.map(entity => [entity.key, entity]));

  let diffs = compareBaseStates(comparisonState(checkpoint), comparisonState(current), options)
    .map(diff => ({
      ...diff,
      category: originalCategory(diff.entity, checkpointByKey, currentByKey, diff.category),
    }));

  for (const [key, expected] of checkpointByKey) {
    const actual = currentByKey.get(key);
    if (!actual) continue;
    const movement = dynamicMovementDiff(expected, actual);
    if (!movement) continue;

    const existing = diffs.filter(diff => diff.entity === key);
    if (existing.some(diff => ["ADDED", "REMOVED", "MOVED"].includes(diff.type))) continue;

    // Position is direct current-state evidence. Replace relation-omission uncertainty or
    // an UNCHANGED row for this subject rather than double-counting one semantic entity.
    diffs = diffs.filter(diff => diff.entity !== key || !["UNCHANGED", "UNKNOWN"].includes(diff.type));
    diffs.push(movement);
  }

  return diffs.sort((left, right) => left.entity.localeCompare(right.entity) || left.type.localeCompare(right.type));
}
