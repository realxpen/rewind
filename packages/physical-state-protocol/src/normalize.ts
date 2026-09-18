import type {
  AttributeValue,
  ObservationEvidence,
  PhysicalEntity,
  PhysicalRelation,
  PhysicalState,
  PhysicalZone,
} from "./types.js";
import { parseState } from "./validate.js";
import { sortZones } from "./zones.js";

const ACTIONABLE_ATTRIBUTES = new Set(["clear", "powered"]);
const TRANSIENT_LIVING_CATEGORIES = new Set(["person", "human", "bird", "animal", "pet"]);

function normalizeRelation(relation: PhysicalRelation): PhysicalRelation {
  const normalized: PhysicalRelation = { type: relation.type };
  if (relation.target !== undefined) normalized.target = relation.target.trim();
  if (relation.confidence !== undefined) normalized.confidence = relation.confidence;
  return normalized;
}

function relationKey(relation: PhysicalRelation): string {
  return `${relation.type}:${relation.target ?? ""}`;
}

function normalizeAttributes(
  attributes: Record<string, AttributeValue> | undefined,
): Record<string, AttributeValue> | undefined {
  if (!attributes) return undefined;
  const entries = Object.entries(attributes)
    .filter(([key]) => ACTIONABLE_ATTRIBUTES.has(key.trim().toLowerCase()))
    .map(([key, value]) => [key.trim().toLowerCase(), value] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeEntity(entity: PhysicalEntity): PhysicalEntity {
  const attributes = normalizeAttributes(entity.attributes);
  const relations = entity.relations
    ? [...entity.relations]
        .map(normalizeRelation)
        .sort((a, b) => relationKey(a).localeCompare(relationKey(b)))
    : undefined;

  const normalized: PhysicalEntity = {
    key: entity.key.trim(),
    category: entity.category.trim().toLowerCase(),
    confidence: entity.confidence,
  };
  if (attributes) normalized.attributes = attributes;
  if (relations && relations.length > 0) normalized.relations = relations;
  if (entity.role !== undefined) normalized.role = entity.role;
  if (entity.zone !== undefined) normalized.zone = entity.zone.trim();
  if (entity.importance !== undefined) normalized.importance = entity.importance;
  return normalized;
}

function normalizeZone(zone: PhysicalZone): PhysicalZone {
  const normalized: PhysicalZone = {
    key: zone.key.trim(),
    kind: zone.kind,
    confidence: zone.confidence,
  };

  if (zone.state !== undefined) {
    const state: NonNullable<PhysicalZone["state"]> = {};
    if (zone.state.clear !== undefined) state.clear = zone.state.clear;
    if (zone.state.occupied !== undefined) state.occupied = zone.state.occupied;
    if (zone.state.clutterLevel !== undefined) state.clutterLevel = zone.state.clutterLevel;
    normalized.state = state;
  }

  return normalized;
}

function normalizeEvidence(evidence: ObservationEvidence): ObservationEvidence {
  const normalized: ObservationEvidence = {
    coverage: evidence.coverage,
    quality: evidence.quality,
    source: evidence.source,
  };
  if (evidence.viewId !== undefined) normalized.viewId = evidence.viewId.trim();
  return normalized;
}

export function normalizeState(input: PhysicalState | unknown): PhysicalState {
  const state = parseState(input);

  const normalized: PhysicalState = {
    schemaVersion: state.schemaVersion,
    spaceId: state.spaceId.trim(),
    capturedAt: state.capturedAt,
    entities: [...state.entities]
      .map(normalizeEntity)
      .filter((entity) => !TRANSIENT_LIVING_CATEGORIES.has(entity.category))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };

  if (state.zones !== undefined) {
    normalized.zones = sortZones(state.zones.map(normalizeZone));
  }
  if (state.evidence !== undefined) {
    normalized.evidence = normalizeEvidence(state.evidence);
  }

  return normalized;
}

export function validateCheckpoint(input: unknown): boolean {
  try {
    normalizeState(input);
    return true;
  } catch {
    return false;
  }
}
