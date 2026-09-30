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
const DYNAMIC_CENSUS_KEY = "rewind.dynamic-census";
const DYNAMIC_CENSUS_CONFIDENCE = 0.95;
const TRUSTED_DYNAMIC_CENSUS_CONFIDENCE = 0.6;

function isDynamicSubject(entity: PhysicalEntity): boolean {
  const category = entity.category.trim().toLowerCase();
  if (HUMAN_CATEGORIES.has(category)) return false;
  return entity.attributes?.dynamic_subject === true;
}

function isDynamicCensus(entity: PhysicalEntity): boolean {
  return entity.key === DYNAMIC_CENSUS_KEY
    || entity.category === "dynamic-census"
    || entity.attributes?.dynamic_census === true;
}

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

function visibleDynamicCount(state: PhysicalState): number {
  return state.entities.filter(entity =>
    isDynamicSubject(entity)
    && entity.attributes?.present !== false
    && entity.confidence >= 0.85,
  ).length;
}

function explicitDynamicCensus(state: PhysicalState): PhysicalEntity | undefined {
  return state.entities.find(isDynamicCensus);
}

function censusCount(entity: PhysicalEntity | undefined): number | undefined {
  const value = entity?.attributes?.dynamic_count;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function withDerivedDynamicCensus(state: PhysicalState, required: boolean): PhysicalState {
  if (!required || explicitDynamicCensus(state)) return state;
  return {
    ...state,
    entities: [
      ...state.entities,
      {
        key: DYNAMIC_CENSUS_KEY,
        category: "dynamic-census",
        confidence: DYNAMIC_CENSUS_CONFIDENCE,
        attributes: {
          present: true,
          dynamic_census: true,
          dynamic_count: visibleDynamicCount(state),
        },
      },
    ],
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

function dynamicMovementDiff(expected: PhysicalEntity, actual: PhysicalEntity): PhysicalDiff | undefined {
  if (!isDynamicSubject(expected) || !isDynamicSubject(actual)) return undefined;
  if (expected.attributes?.present === false || actual.attributes?.present === false) return undefined;
  const confidence = Math.min(expected.confidence, actual.confidence);
  if (confidence < DYNAMIC_POSITION_MIN_CONFIDENCE) return undefined;
  const expectedX = normalizedCoordinate(expected, "frame_x");
  const expectedY = normalizedCoordinate(expected, "frame_y");
  const actualX = normalizedCoordinate(actual, "frame_x");
  const actualY = normalizedCoordinate(actual, "frame_y");
  if (expectedX === undefined || expectedY === undefined || actualX === undefined || actualY === undefined) return undefined;
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

function isDynamicPopulationDiff(diff: PhysicalDiff): boolean {
  if (diff.type !== "ADDED" && diff.type !== "REMOVED") return false;
  const entity = diff.actual?.entity ?? diff.expected?.entity;
  return Boolean(entity && isDynamicSubject(entity));
}

function syntheticPopulationDiff(type: "ADDED" | "REMOVED", index: number, confidence: number): PhysicalDiff {
  const entity: PhysicalEntity = {
    key: type === "ADDED" ? `dynamic.arrival.${index}` : `dynamic.departure.${index}`,
    category: "dynamic-subject",
    confidence,
    attributes: { present: type === "ADDED", dynamic_subject: true },
  };
  return type === "ADDED"
    ? {
        type,
        entity: entity.key,
        category: entity.category,
        actual: { entity },
        confidence,
        reason: "Independent live-scene census found an additional non-human dynamic subject that checkpoint identity tracking did not fully represent.",
      }
    : {
        type,
        entity: entity.key,
        category: entity.category,
        expected: { entity: { ...entity, attributes: { present: true, dynamic_subject: true } } },
        actual: { entity: { ...entity, attributes: { present: false, dynamic_subject: true } } },
        confidence,
        reason: "Independent live-scene census found fewer non-human dynamic subjects than the saved checkpoint, so at least one saved subject left the scene.",
      };
}

function censusUncertainty(
  checkpointCensus: PhysicalEntity | undefined,
  currentCensus: PhysicalEntity | undefined,
  expectedCount: number,
  actualCount: number,
  confidence: number,
): PhysicalDiff {
  return {
    type: "UNKNOWN",
    entity: DYNAMIC_CENSUS_KEY,
    category: "dynamic-census",
    ...(checkpointCensus ? { expected: { entity: checkpointCensus, attributes: { dynamic_count: expectedCount } } } : {}),
    ...(currentCensus ? { actual: { entity: currentCensus, attributes: { dynamic_count: actualCount } } } : {}),
    confidence,
    reason: "Checkpoint-guided identity tracking and the independent live-scene census disagree about dynamic-subject cardinality. REWIND will not report 100% until the count is resolved.",
  };
}

function reconcileDynamicPopulation(
  diffs: PhysicalDiff[],
  checkpoint: PhysicalState,
  current: PhysicalState,
): PhysicalDiff[] {
  const checkpointCensus = explicitDynamicCensus(checkpoint);
  const currentCensus = explicitDynamicCensus(current);
  const expectedCount = censusCount(checkpointCensus);
  const actualCount = censusCount(currentCensus);
  let result = diffs.filter(diff => diff.entity !== DYNAMIC_CENSUS_KEY);
  if (expectedCount === undefined || actualCount === undefined) return result;

  const confidence = Math.min(
    checkpointCensus?.confidence ?? DYNAMIC_CENSUS_CONFIDENCE,
    currentCensus?.confidence ?? DYNAMIC_CENSUS_CONFIDENCE,
  );
  const targetDelta = actualCount - expectedCount;
  const population = result.filter(isDynamicPopulationDiff);
  const added = population.filter(diff => diff.type === "ADDED");
  const removed = population.filter(diff => diff.type === "REMOVED");
  const net = added.length - removed.length;
  let unresolvedCardinality = false;

  if (net > targetDelta) {
    let gap = net - targetDelta;
    const removableAdded = [...added].sort((a, b) => a.confidence - b.confidence || a.entity.localeCompare(b.entity));
    for (const diff of removableAdded) {
      if (gap <= 0) break;
      result = result.filter(candidate => candidate !== diff);
      gap -= 1;
    }
    while (gap > 0) {
      if (confidence < TRUSTED_DYNAMIC_CENSUS_CONFIDENCE) {
        unresolvedCardinality = true;
        break;
      }
      result.push(syntheticPopulationDiff("REMOVED", gap, confidence));
      gap -= 1;
    }
  } else if (net < targetDelta) {
    let gap = targetDelta - net;
    const removableRemoved = [...removed].sort((a, b) => a.confidence - b.confidence || a.entity.localeCompare(b.entity));
    for (const diff of removableRemoved) {
      if (gap <= 0) break;
      result = result.filter(candidate => candidate !== diff);
      gap -= 1;
    }
    while (gap > 0) {
      if (confidence < TRUSTED_DYNAMIC_CENSUS_CONFIDENCE) {
        unresolvedCardinality = true;
        break;
      }
      result.push(syntheticPopulationDiff("ADDED", gap, confidence));
      gap -= 1;
    }
  }

  if (confidence < TRUSTED_DYNAMIC_CENSUS_CONFIDENCE || unresolvedCardinality) {
    result.push(censusUncertainty(checkpointCensus, currentCensus, expectedCount, actualCount, confidence));
  }
  return result;
}

export function compareStates(
  checkpointInput: PhysicalState | unknown,
  currentInput: PhysicalState | unknown,
  options: CompareStatesOptions = {},
): PhysicalDiff[] {
  let checkpoint = normalizeForDynamicComparison(checkpointInput);
  let current = normalizeForDynamicComparison(currentInput);
  const needsDynamicCensus = checkpoint.entities.some(entity => isDynamicSubject(entity) || isDynamicCensus(entity))
    || current.entities.some(entity => isDynamicSubject(entity) || isDynamicCensus(entity));
  checkpoint = withDerivedDynamicCensus(checkpoint, needsDynamicCensus);
  current = withDerivedDynamicCensus(current, needsDynamicCensus);

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
    diffs = diffs.filter(diff => diff.entity !== key || !["UNCHANGED", "UNKNOWN"].includes(diff.type));
    diffs.push(movement);
  }

  diffs = reconcileDynamicPopulation(diffs, checkpoint, current);
  return diffs.sort((left, right) => left.entity.localeCompare(right.entity) || left.type.localeCompare(right.type));
}
