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

const EXCLUSIVE_TARGET_RELATIONS = new Set<RelationType>([
  "ON", "UNDER", "INSIDE", "ATTACHED_TO",
]);

const OPPOSITE_RELATIONS = new Map<RelationType, RelationType>([
  ["LEFT_OF", "RIGHT_OF"],
  ["RIGHT_OF", "LEFT_OF"],
  ["BEHIND", "IN_FRONT_OF"],
  ["IN_FRONT_OF", "BEHIND"],
  ["ON", "UNDER"],
  ["UNDER", "ON"],
  ["OPEN", "CLOSED"],
  ["CLOSED", "OPEN"],
  ["ON_STATE", "OFF_STATE"],
  ["OFF_STATE", "ON_STATE"],
  ["CLEAR", "OCCUPIED"],
  ["OCCUPIED", "CLEAR"],
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
const VISION_ADDED_CONFIDENCE = 0.85;

export type ComparisonEvidenceMode = "strict" | "vision";
export interface CompareStatesOptions {
  /**
   * strict: deterministic fixtures/known semantic states; any replacement relation can be
   * treated as contradictory. vision: current state came from perception, so coexisting or
   * omitted relations must not become fake physical moves/removals.
   */
  evidenceMode?: ComparisonEvidenceMode;
}

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

function sameTarget(left: PhysicalRelation, right: PhysicalRelation): boolean {
  return Boolean(left.target && right.target && left.target === right.target);
}

function visionContradiction(expected: PhysicalRelation, actual: PhysicalRelation): boolean {
  const expectedSpatial = SPATIAL_RELATIONS.has(expected.type);
  const actualSpatial = SPATIAL_RELATIONS.has(actual.type);
  if (expectedSpatial !== actualSpatial) return false;

  // Explicit directional/state opposites on the same target (or both targetless) are real
  // contradictory evidence. Example LEFT_OF vs RIGHT_OF, OPEN vs CLOSED.
  if (OPPOSITE_RELATIONS.get(expected.type) === actual.type) {
    if (!expected.target && !actual.target) return true;
    return sameTarget(expected, actual);
  }

  // Support/container/attachment relations are single-placement facts for this MVP.
  // Seeing the same exclusive relation to another target is evidence of movement.
  if (
    expected.type === actual.type &&
    EXCLUSIVE_TARGET_RELATIONS.has(expected.type) &&
    expected.target && actual.target && expected.target !== actual.target
  ) {
    return true;
  }

  // NEAR and directional relations can coexist with many other true relations. A model
  // returning LEFT_OF instead of NEAR, for example, does not prove NEAR became false.
  return false;
}

function comparableReplacement(
  expected: PhysicalRelation,
  actual: PhysicalRelation,
  evidenceMode: ComparisonEvidenceMode,
): boolean {
  const expectedSpatial = SPATIAL_RELATIONS.has(expected.type);
  const actualSpatial = SPATIAL_RELATIONS.has(actual.type);
  if (expectedSpatial !== actualSpatial) return false;
  if (evidenceMode === "vision") return visionContradiction(expected, actual);
  // Strict mode is reserved for deterministic semantic states/fixtures where omission noise
  // is not present and a replacement relation really represents changed state.
  if (expectedSpatial) return actualSpatial;
  return expected.type === actual.type;
}

interface RelationComparison {
  expectedChanged: PhysicalRelation[];
  actualChanged: PhysicalRelation[];
  uncertainExpected: PhysicalRelation[];
}

/**
 * A missing relation by itself is not enough to claim physical movement in vision mode.
 * Nova can omit a valid relation or emit another coexisting relation. A visual movement must
 * therefore have genuinely contradictory current evidence. Strict mode preserves the
 * deterministic fixture behavior used by the controlled demo.
 */
function compareRelations(
  expected: PhysicalEntity,
  actual: PhysicalEntity,
  evidenceMode: ComparisonEvidenceMode,
): RelationComparison {
  const expectedRelations = expected.relations ?? [];
  const actualRelations = actual.relations ?? [];
  const usedActual = new Set<number>();
  const expectedChanged: PhysicalRelation[] = [];
  const actualChanged: PhysicalRelation[] = [];
  const uncertainExpected: PhysicalRelation[] = [];

  for (const expectedRelation of expectedRelations) {
    if (actualRelations.some(actualRelation => sameRelation(expectedRelation, actualRelation))) continue;
    const replacementIndex = actualRelations.findIndex((actualRelation, index) =>
      !usedActual.has(index) && comparableReplacement(expectedRelation, actualRelation, evidenceMode),
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

export function compareStates(
  checkpointInput: PhysicalState | unknown,
  currentInput: PhysicalState | unknown,
  options: CompareStatesOptions = {},
): PhysicalDiff[] {
  const checkpoint = normalizeState(checkpointInput);
  const current = normalizeState(currentInput);
  const evidenceMode = options.evidenceMode ?? "strict";
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
      const threshold = evidenceMode === "vision" ? VISION_ADDED_CONFIDENCE : UNKNOWN_CONFIDENCE;
      diffs.push({
        type: actual.confidence < threshold ? "UNKNOWN" : "ADDED",
        entity: key,
        category: actual.category,
        actual: { entity: actual },
        confidence: actual.confidence,
        reason: actual.confidence < threshold
          ? "Extra visual entity is not confident enough to become a restoration change."
          : "A clearly observed extra entity exists in the current state but not the checkpoint.",
      });
      continue;
    }

    if (expected && !actual) {
      // A vision model failing to emit an entity is not proof that the physical object was
      // removed. This is especially important for small/ambiguous checkpoint entities that
      // may have been over-segmented or misclassified in the original image (for example a
      // lamp base interpreted as a candle). Only strict semantic sources may turn omission
      // into a deterministic REMOVED change.
      if (evidenceMode === "vision") {
        diffs.push({
          type: "UNKNOWN",
          entity: key,
          category: expected.category,
          expected: { entity: expected },
          actual: {},
          confidence: expected.confidence,
          reason: "Tracked checkpoint entity was not re-observed. Vision omission alone cannot prove that the physical object was removed.",
        });
      } else {
        diffs.push({
          type: expected.confidence < UNKNOWN_CONFIDENCE ? "UNKNOWN" : "REMOVED",
          entity: key,
          category: expected.category,
          expected: { entity: expected },
          confidence: expected.confidence,
          reason: expected.confidence < UNKNOWN_CONFIDENCE
            ? "Checkpoint entity confidence is below the trusted threshold."
            : "The tracked checkpoint entity is absent from the current semantic state.",
        });
      }
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

    const relations = compareRelations(expected, actual, evidenceMode);
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
