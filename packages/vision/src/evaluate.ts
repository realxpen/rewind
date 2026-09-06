import { normalizeState } from "../../physical-state-protocol/src/index.js";
import type {
  PhysicalEntity,
  PhysicalRelation,
  PhysicalState,
} from "../../physical-state-protocol/src/index.js";
import type { VisionStateEvaluation } from "./contracts.js";

function percent(numerator: number, denominator: number): number {
  return denominator === 0 ? 100 : Math.round((numerator / denominator) * 10000) / 100;
}

function relationKey(relation: PhysicalRelation): string {
  return `${relation.type}:${relation.target ?? ""}`;
}

function relationSet(entity: PhysicalEntity): Set<string> {
  return new Set((entity.relations ?? []).map(relationKey));
}

export function evaluateVisionState(
  expectedInput: PhysicalState,
  actualInput: PhysicalState,
): VisionStateEvaluation {
  const expected = normalizeState(expectedInput);
  const actual = normalizeState(actualInput);

  const actualByKey = new Map(actual.entities.map((entity) => [entity.key, entity]));
  const expectedKeys = new Set(expected.entities.map((entity) => entity.key));

  let recognizedEntityCount = 0;
  let trustedEntityCount = 0;
  let expectedRelationCount = 0;
  let matchedRelationCount = 0;
  let expectedAttributeCount = 0;
  let matchedAttributeCount = 0;

  for (const expectedEntity of expected.entities) {
    const actualEntity = actualByKey.get(expectedEntity.key);
    if (
      actualEntity &&
      actualEntity.category === expectedEntity.category &&
      actualEntity.confidence >= 0.60
    ) {
      recognizedEntityCount += 1;
    }
    if (
      actualEntity &&
      actualEntity.category === expectedEntity.category &&
      actualEntity.confidence >= 0.80
    ) {
      trustedEntityCount += 1;
    }

    const expectedRelations = relationSet(expectedEntity);
    expectedRelationCount += expectedRelations.size;
    if (actualEntity) {
      const actualRelations = relationSet(actualEntity);
      for (const relation of expectedRelations) {
        if (actualRelations.has(relation)) matchedRelationCount += 1;
      }
    }

    const expectedAttributes = expectedEntity.attributes ?? {};
    expectedAttributeCount += Object.keys(expectedAttributes).length;
    if (actualEntity) {
      const actualAttributes = actualEntity.attributes ?? {};
      for (const [name, value] of Object.entries(expectedAttributes)) {
        if (Object.is(actualAttributes[name], value)) matchedAttributeCount += 1;
      }
    }
  }

  const falsePositiveKeys = actual.entities
    .map((entity) => entity.key)
    .filter((key) => !expectedKeys.has(key))
    .sort();

  return {
    expectedEntityCount: expected.entities.length,
    recognizedEntityCount,
    trustedEntityCount,
    entityRecall: percent(recognizedEntityCount, expected.entities.length),
    trustedEntityRecall: percent(trustedEntityCount, expected.entities.length),
    expectedRelationCount,
    matchedRelationCount,
    relationRecall: percent(matchedRelationCount, expectedRelationCount),
    expectedAttributeCount,
    matchedAttributeCount,
    attributeRecall: percent(matchedAttributeCount, expectedAttributeCount),
    falsePositiveKeys,
  };
}
