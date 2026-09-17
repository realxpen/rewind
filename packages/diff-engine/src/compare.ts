import {
  normalizeState,
  type AttributeValue,
  type PhysicalEntity,
  type PhysicalRelation,
  type PhysicalState,
  type RelationType,
} from "../../physical-state-protocol/src/index.js";
import type { PhysicalDiff } from "./types.js";

const SPATIAL_RELATIONS = new Set<RelationType>([
  "ON", "UNDER", "INSIDE", "LEFT_OF", "RIGHT_OF", "BEHIND", "IN_FRONT_OF", "NEAR", "ATTACHED_TO",
]);

/**
 * Appearance/identity descriptors help perception identify an entity, but they are not
 * restoration state for the MVP. Nova can vary wording for these between observations.
 */
const DESCRIPTIVE_ATTRIBUTES = new Set([
  "color",
  "colour",
  "material",
  "pattern",
  "brand",
  "model",
  "shape",
  "size",
  "species",
]);

const UNKNOWN_CONFIDENCE = 0.6;

function minConfidence(...values: Array<number | undefined>): number {
  const present = values.filter((value): value is number => typeof value === "number");
  return present.length === 0 ? 1 : Math.min(...present);
}

function relationKey(relation: PhysicalRelation): string {
  return `${relation.type}:${relation.target ?? ""}`;
}

function sameRelation(left: PhysicalRelation, right: PhysicalRelation): boolean {
  return relationKey(left) === relationKey(right);
}

function comparableReplacement(expected: PhysicalRelation, actual: PhysicalRelation): boolean {
  const expectedSpatial = SPATIAL_RELATIONS.has(expected.type);
  const actualSpatial = SPATIAL_RELATIONS.has(actual.type);
  if (expectedSpatial !== actualSpatial) return false;
  if (expectedSpatial) {
    return expected.type === actual.type || Boolean(expected.target && expected.target === actual.target);
  }
  return expected.type === actual.type;
}

interface RelationComparison {
  expectedChanged: PhysicalRelation[];
  actualChanged: PhysicalRelation[];
  uncertainExpected: PhysicalRelation[];
}

/**
 * A missing relation by itself is not enough to claim physical movement because a vision
 * model can omit a relation it cannot confidently see. A movement requires contradictory
 * current evidence: the same relation type points somewhere else, or the same target has a
 * different spatial relation. This keeps deterministic comparison conservative without
 * weakening confirmed changes.
 */
function compareRelations(expected: PhysicalEntity, actual: PhysicalEntity): RelationComparison {
  const expectedRelations = expected.relations ?? [];
  const actualRelations = actual.relations ?? [];
  const usedActual = new Set<number>();
  const expectedChanged: PhysicalRelation[] = [];
  const actualChanged: PhysicalRelation[] = [];
  const uncertainExpected: PhysicalRelation[] = [];

  for (const expectedRelation of expectedRelations) {
    if (actualRelations.some(actualRelation => sameRelation(expectedRelation, actualRelation))) continue;
    const replacementIndex = actualRelations.findIndex((actualRelation, index) =>
      !usedActual.has(index) && comparableReplacement(expectedRelation, actualRelation),
    );
    if (replacementIndex >= 0) {
      expectedChanged.push(expectedRelation);
      actualChanged.push(actualRelations[replacementIndex]!);
      usedActual.add(replacementIndex);
    } else {
      uncertainExpected.push(expectedRelation);
    }
  }

  return { expectedChanged, actualChanged, uncertainExpected };
}

interface AttributeComparison {
  expectedChanged: Record<string, AttributeValue>;
  actualChanged: Record<string, AttributeValue>;
  uncertainKeys: string[];
}

/**
 * Only checkpoint attributes are restoration truth. New descriptive keys from a later
 * observation are ignored. If Nova cannot see a checkpoint attribute and omits it, that is
 * uncertainty rather than a physical change; only two observed, differing values become a
 * confirmed ATTRIBUTE_CHANGED result.
 */
function compareAttributes(expected: PhysicalEntity, actual: PhysicalEntity): AttributeComparison {
  const expectedAttributes = expected.attributes ?? {};
  const actualAttributes = actual.attributes ?? {};
  const expectedChanged: Record<string, AttributeValue> = {};
  const actualChanged: Record<string, AttributeValue> = {};
  const uncertainKeys: string[] = [];

  for (const key of Object.keys(expectedAttributes).sort()) {
    if (DESCRIPTIVE_ATTRIBUTES.has(key.toLowerCase())) continue;
    if (!Object.hasOwn(actualAttributes, key)) {
      uncertainKeys.push(key);
      continue;
    }
    const expectedValue = expectedAttributes[key]!;
    const actualValue = actualAttributes[key]!;
    if (expectedValue !== actualValue) {
      expectedChanged[key] = expectedValue;
      actualChanged[key] = actualValue;
    }
  }

  return { expectedChanged, actualChanged, uncertainKeys };
}

function sameCategory(expected: PhysicalEntity, actual: PhysicalEntity): boolean {
  return expected.category === actual.category;
}

export function compareStates(checkpointInput: PhysicalState | unknown, currentInput: PhysicalState | unknown): PhysicalDiff[] {
  const checkpoint = normalizeState(checkpointInput);
  const current = normalizeState(currentInput);
  if (checkpoint.spaceId !== current.spaceId) {
    throw new Error(`Cannot compare different spaces: ${checkpoint.spaceId} vs ${current.spaceId}.`);
  }

  const expectedByKey = new Map(checkpoint.entities.map((entity) => [entity.key, entity]));
  const actualByKey = new Map(current.entities.map((entity) => [entity.key, entity]));
  const keys = [...new Set([...expectedByKey.keys(), ...actualByKey.keys()])].sort();
  const diffs: PhysicalDiff[] = [];

  for (const key of keys) {
    const expected = expectedByKey.get(key);
    const actual = actualByKey.get(key);

    if (!expected && actual) {
      diffs.push({
        type: actual.confidence < UNKNOWN_CONFIDENCE ? "UNKNOWN" : "ADDED",
        entity: key,
        category: actual.category,
        actual: { entity: actual },
        confidence: actual.confidence,
        reason: actual.confidence < UNKNOWN_CONFIDENCE ? "Observed entity confidence is below the trusted threshold." : "A clearly observed extra entity exists in the current state but not the checkpoint.",
      });
      continue;
    }

    if (expected && !actual) {
      diffs.push({
        type: expected.confidence < UNKNOWN_CONFIDENCE ? "UNKNOWN" : "REMOVED",
        entity: key,
        category: expected.category,
        expected: { entity: expected },
        confidence: expected.confidence,
        reason: expected.confidence < UNKNOWN_CONFIDENCE ? "Checkpoint entity confidence is below the trusted threshold." : "The tracked checkpoint entity is absent from the current observation.",
      });
      continue;
    }

    if (!expected || !actual) continue;

    const confidence = minConfidence(expected.confidence, actual.confidence);
    if (confidence < UNKNOWN_CONFIDENCE || !sameCategory(expected, actual)) {
      diffs.push({
        type: "UNKNOWN",
        entity: key,
        category: expected.category,
        expected: { entity: expected },
        actual: { entity: actual },
        confidence,
        reason: confidence < UNKNOWN_CONFIDENCE ? "Entity confidence is below the trusted threshold." : "Stable key resolved to conflicting categories.",
      });
      continue;
    }

    const relations = compareRelations(expected, actual);
    const attributes = compareAttributes(expected, actual);
    let emittedConfirmed = false;

    const spatialExpected = relations.expectedChanged.filter(relation => SPATIAL_RELATIONS.has(relation.type));
    const spatialActual = relations.actualChanged.filter(relation => SPATIAL_RELATIONS.has(relation.type));
    if (spatialExpected.length || spatialActual.length) {
      const relationConfidence = minConfidence(
        ...spatialExpected.map(relation => relation.confidence),
        ...spatialActual.map(relation => relation.confidence),
        confidence,
      );
      diffs.push({
        type: relationConfidence < UNKNOWN_CONFIDENCE ? "UNKNOWN" : "MOVED",
        entity: key,
        category: expected.category,
        expected: { relations: spatialExpected },
        actual: { relations: spatialActual },
        confidence: relationConfidence,
        reason: relationConfidence < UNKNOWN_CONFIDENCE
          ? "Contradictory spatial evidence is below the trusted threshold."
          : "Current spatial evidence contradicts the checkpoint relation.",
      });
      emittedConfirmed = relationConfidence >= UNKNOWN_CONFIDENCE;
    }

    const stateExpected = relations.expectedChanged.filter(relation => !SPATIAL_RELATIONS.has(relation.type));
    const stateActual = relations.actualChanged.filter(relation => !SPATIAL_RELATIONS.has(relation.type));
    const hasAttributeChanges = Object.keys(attributes.expectedChanged).length > 0;
    if (hasAttributeChanges || stateExpected.length || stateActual.length) {
      const attributeConfidence = minConfidence(
        ...stateExpected.map(relation => relation.confidence),
        ...stateActual.map(relation => relation.confidence),
        confidence,
      );
      diffs.push({
        type: attributeConfidence < UNKNOWN_CONFIDENCE ? "UNKNOWN" : "ATTRIBUTE_CHANGED",
        entity: key,
        category: expected.category,
        expected: { attributes: attributes.expectedChanged, relations: stateExpected },
        actual: { attributes: attributes.actualChanged, relations: stateActual },
        confidence: attributeConfidence,
        reason: attributeConfidence < UNKNOWN_CONFIDENCE
          ? "Contradictory attribute/state evidence is below the trusted threshold."
          : "A checkpoint attribute or non-spatial state relation has a confidently different current value.",
      });
      emittedConfirmed = emittedConfirmed || attributeConfidence >= UNKNOWN_CONFIDENCE;
    }

    const uncertainRelations = relations.uncertainExpected.filter(relation => (relation.confidence ?? confidence) >= UNKNOWN_CONFIDENCE);
    if (!emittedConfirmed && (uncertainRelations.length > 0 || attributes.uncertainKeys.length > 0)) {
      diffs.push({
        type: "UNKNOWN",
        entity: key,
        category: expected.category,
        expected: { relations: uncertainRelations },
        actual: {},
        confidence,
        reason: [
          uncertainRelations.length ? `${uncertainRelations.length} checkpoint relation(s) were not confidently re-observed.` : "",
          attributes.uncertainKeys.length ? `Checkpoint attribute(s) ${attributes.uncertainKeys.join(", ")} were not visibly resolved.` : "",
        ].filter(Boolean).join(" "),
      });
      continue;
    }

    if (!emittedConfirmed && !diffs.some(diff => diff.entity === key)) {
      diffs.push({
        type: "UNCHANGED",
        entity: key,
        category: expected.category,
        expected: { entity: expected },
        actual: { entity: actual },
        confidence,
        reason: "Entity matches all confidently comparable checkpoint state.",
      });
    }
  }

  return diffs;
}
