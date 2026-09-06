import type { PhysicalEntity, PhysicalRelation, PhysicalState } from "./types.js";
import { parseState } from "./validate.js";

function normalizeRelation(relation: PhysicalRelation): PhysicalRelation {
  const normalized: PhysicalRelation = { type: relation.type };
  if (relation.target !== undefined) normalized.target = relation.target.trim();
  if (relation.confidence !== undefined) normalized.confidence = relation.confidence;
  return normalized;
}

function relationKey(relation: PhysicalRelation): string {
  return `${relation.type}:${relation.target ?? ""}`;
}

function normalizeEntity(entity: PhysicalEntity): PhysicalEntity {
  const attributes = entity.attributes
    ? Object.fromEntries(Object.entries(entity.attributes).sort(([a], [b]) => a.localeCompare(b)))
    : undefined;

  const relations = entity.relations
    ? [...entity.relations].map(normalizeRelation).sort((a, b) => relationKey(a).localeCompare(relationKey(b)))
    : undefined;

  const normalized: PhysicalEntity = {
    key: entity.key.trim(),
    category: entity.category.trim().toLowerCase(),
    confidence: entity.confidence,
  };
  if (attributes && Object.keys(attributes).length > 0) normalized.attributes = attributes;
  if (relations && relations.length > 0) normalized.relations = relations;
  return normalized;
}

export function normalizeState(input: PhysicalState | unknown): PhysicalState {
  const state = parseState(input);
  return {
    ...state,
    spaceId: state.spaceId.trim(),
    entities: [...state.entities].map(normalizeEntity).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

export function validateCheckpoint(input: unknown): boolean {
  try {
    normalizeState(input);
    return true;
  } catch {
    return false;
  }
}
