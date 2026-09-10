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
 * restoration state for the MVP. Nova can vary wording for these between observations
 * (for example `red` vs `red_and_black`). Treating that as a restore action would tell
 * the user to physically recolor an object, which is unsafe/nonsensical guidance.
 *
 * Mutable state attributes such as `powered` and `clear` remain comparable.
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
]);

const UNKNOWN_CONFIDENCE = 0.6;

function minConfidence(...values: Array<number | undefined>): number {
  const present = values.filter((value): value is number => typeof value === "number");
  return present.length === 0 ? 1 : Math.min(...present);
}

function relationKey(relation: PhysicalRelation): string {
  return `${relation.type}:${relation.target ?? ""}`;
}

function relationSet(entity: PhysicalEntity): Set<string> {
  return new Set((entity.relations ?? []).map(relationKey));
}

function changedRelations(expected: PhysicalEntity, actual: PhysicalEntity): { expected: PhysicalRelation[]; actual: PhysicalRelation[] } {
  const expectedSet = relationSet(expected);
  const actualSet = relationSet(actual);
  return {
    expected: (expected.relations ?? []).filter((relation) => !actualSet.has(relationKey(relation))),
    actual: (actual.relations ?? []).filter((relation) => !expectedSet.has(relationKey(relation))),
  };
}

function changedAttributes(expected: PhysicalEntity, actual: PhysicalEntity): { expected: Record<string, AttributeValue>; actual: Record<string, AttributeValue> } {
  const keys = new Set([...Object.keys(expected.attributes ?? {}), ...Object.keys(actual.attributes ?? {})]);
  const expectedChanged: Record<string, AttributeValue> = {};
  const actualChanged: Record<string, AttributeValue> = {};
  for (const key of [...keys].sort()) {
    if (DESCRIPTIVE_ATTRIBUTES.has(key.toLowerCase())) continue;
    const expectedValue = expected.attributes?.[key] ?? null;
    const actualValue = actual.attributes?.[key] ?? null;
    if (expectedValue !== actualValue) {
      expectedChanged[key] = expectedValue;
      actualChanged[key] = actualValue;
    }
  }
  return { expected: expectedChanged, actual: actualChanged };
}

function hasSpatialRelation(relations: PhysicalRelation[]): boolean {
  return relations.some((relation) => SPATIAL_RELATIONS.has(relation.type));
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
        reason: actual.confidence < UNKNOWN_CONFIDENCE ? "Observed entity confidence is below the trusted threshold." : "Entity exists in current state but not checkpoint.",
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
        reason: expected.confidence < UNKNOWN_CONFIDENCE ? "Checkpoint entity confidence is below the trusted threshold." : "Checkpoint entity is missing from current state.",
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

    const relations = changedRelations(expected, actual);
    const attributes = changedAttributes(expected, actual);
    let emitted = false;

    if (hasSpatialRelation(relations.expected) || hasSpatialRelation(relations.actual)) {
      const relationConfidence = minConfidence(
        ...relations.expected.map((relation) => relation.confidence),
        ...relations.actual.map((relation) => relation.confidence),
        confidence,
      );
      diffs.push({
        type: relationConfidence < UNKNOWN_CONFIDENCE ? "UNKNOWN" : "MOVED",
        entity: key,
        category: expected.category,
        expected: { relations: relations.expected },
        actual: { relations: relations.actual },
        confidence: relationConfidence,
        reason: relationConfidence < UNKNOWN_CONFIDENCE ? "Spatial relation confidence is below the trusted threshold." : "Semantic spatial relations differ from checkpoint.",
      });
      emitted = true;
    }

    const stateRelationsExpected = relations.expected.filter((relation) => !SPATIAL_RELATIONS.has(relation.type));
    const stateRelationsActual = relations.actual.filter((relation) => !SPATIAL_RELATIONS.has(relation.type));
    const hasAttributeChanges = Object.keys(attributes.expected).length > 0;
    if (hasAttributeChanges || stateRelationsExpected.length > 0 || stateRelationsActual.length > 0) {
      const attributeConfidence = minConfidence(
        ...stateRelationsExpected.map((relation) => relation.confidence),
        ...stateRelationsActual.map((relation) => relation.confidence),
        confidence,
      );
      diffs.push({
        type: attributeConfidence < UNKNOWN_CONFIDENCE ? "UNKNOWN" : "ATTRIBUTE_CHANGED",
        entity: key,
        category: expected.category,
        expected: { attributes: attributes.expected, relations: stateRelationsExpected },
        actual: { attributes: attributes.actual, relations: stateRelationsActual },
        confidence: attributeConfidence,
        reason: attributeConfidence < UNKNOWN_CONFIDENCE ? "Attribute/state confidence is below the trusted threshold." : "Entity attributes or non-spatial state relations differ from checkpoint.",
      });
      emitted = true;
    }

    if (!emitted) {
      diffs.push({
        type: "UNCHANGED",
        entity: key,
        category: expected.category,
        expected: { entity: expected },
        actual: { entity: actual },
        confidence,
        reason: "Entity matches checkpoint.",
      });
    }
  }

  return diffs;
}
