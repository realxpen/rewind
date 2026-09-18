import {
  ENTITY_IMPORTANCE_LEVELS,
  ENTITY_ROLES,
  OBSERVATION_SOURCES,
  PSP_SCHEMA_VERSION,
  RELATION_TYPES,
  ZONE_CLUTTER_LEVELS,
  ZONE_KINDS,
  type AttributeValue,
  type ObservationEvidence,
  type PhysicalEntity,
  type PhysicalRelation,
  type PhysicalState,
  type PhysicalZone,
  type PhysicalZoneState,
  type ValidationIssue,
  type ValidationResult,
} from "./types.js";

const relationSet = new Set<string>(RELATION_TYPES);
const entityRoleSet = new Set<string>(ENTITY_ROLES);
const entityImportanceSet = new Set<string>(ENTITY_IMPORTANCE_LEVELS);
const zoneKindSet = new Set<string>(ZONE_KINDS);
const zoneClutterLevelSet = new Set<string>(ZONE_CLUTTER_LEVELS);
const observationSourceSet = new Set<string>(OBSERVATION_SOURCES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAttributeValue(value: unknown): value is AttributeValue {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function validConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validatePhysicalState(input: unknown): ValidationResult<PhysicalState> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: "$", message: "State must be an object." }] };
  }

  if (input.schemaVersion !== PSP_SCHEMA_VERSION) {
    issues.push({ path: "$.schemaVersion", message: `Expected schemaVersion ${PSP_SCHEMA_VERSION}.` });
  }
  if (typeof input.spaceId !== "string" || input.spaceId.trim() === "") {
    issues.push({ path: "$.spaceId", message: "spaceId must be a non-empty string." });
  }
  if (typeof input.capturedAt !== "string" || Number.isNaN(Date.parse(input.capturedAt))) {
    issues.push({ path: "$.capturedAt", message: "capturedAt must be an ISO-compatible timestamp." });
  }
  if (!Array.isArray(input.entities)) {
    issues.push({ path: "$.entities", message: "entities must be an array." });
    return { ok: false, issues };
  }

  const keys = new Set<string>();
  const entities: PhysicalEntity[] = [];

  input.entities.forEach((raw, index) => {
    const path = `$.entities[${index}]`;
    if (!isRecord(raw)) {
      issues.push({ path, message: "Entity must be an object." });
      return;
    }

    const key = raw.key;
    const category = raw.category;
    const confidence = raw.confidence;

    if (typeof key !== "string" || key.trim() === "") {
      issues.push({ path: `${path}.key`, message: "key must be a non-empty string." });
    } else if (keys.has(key)) {
      issues.push({ path: `${path}.key`, message: `Duplicate entity key: ${key}.` });
    } else {
      keys.add(key);
    }

    if (typeof category !== "string" || category.trim() === "") {
      issues.push({ path: `${path}.category`, message: "category must be a non-empty string." });
    }
    if (!validConfidence(confidence)) {
      issues.push({ path: `${path}.confidence`, message: "confidence must be between 0 and 1." });
    }

    if (raw.role !== undefined && (typeof raw.role !== "string" || !entityRoleSet.has(raw.role))) {
      issues.push({ path: `${path}.role`, message: "Unknown entity role." });
    }
    if (raw.zone !== undefined && (typeof raw.zone !== "string" || raw.zone.trim() === "")) {
      issues.push({ path: `${path}.zone`, message: "zone must be a non-empty string when present." });
    }
    if (
      raw.importance !== undefined &&
      (typeof raw.importance !== "string" || !entityImportanceSet.has(raw.importance))
    ) {
      issues.push({ path: `${path}.importance`, message: "Unknown entity importance level." });
    }

    let attributes: Record<string, AttributeValue> | undefined;
    if (raw.attributes !== undefined) {
      if (!isRecord(raw.attributes)) {
        issues.push({ path: `${path}.attributes`, message: "attributes must be an object." });
      } else {
        attributes = {};
        for (const [name, value] of Object.entries(raw.attributes)) {
          if (!isAttributeValue(value)) {
            issues.push({
              path: `${path}.attributes.${name}`,
              message: "Attribute values must be string, number, boolean, or null.",
            });
          } else {
            attributes[name] = value;
          }
        }
      }
    }

    let relations: PhysicalRelation[] | undefined;
    if (raw.relations !== undefined) {
      if (!Array.isArray(raw.relations)) {
        issues.push({ path: `${path}.relations`, message: "relations must be an array." });
      } else {
        relations = [];
        raw.relations.forEach((relationRaw, relationIndex) => {
          const relationPath = `${path}.relations[${relationIndex}]`;
          if (!isRecord(relationRaw)) {
            issues.push({ path: relationPath, message: "Relation must be an object." });
            return;
          }
          if (typeof relationRaw.type !== "string" || !relationSet.has(relationRaw.type)) {
            issues.push({ path: `${relationPath}.type`, message: "Unknown relation type." });
            return;
          }
          if (
            relationRaw.target !== undefined &&
            (typeof relationRaw.target !== "string" || relationRaw.target.trim() === "")
          ) {
            issues.push({
              path: `${relationPath}.target`,
              message: "target must be a non-empty string when present.",
            });
          }
          if (relationRaw.confidence !== undefined && !validConfidence(relationRaw.confidence)) {
            issues.push({
              path: `${relationPath}.confidence`,
              message: "confidence must be between 0 and 1.",
            });
          }

          const relation: PhysicalRelation = {
            type: relationRaw.type as PhysicalRelation["type"],
          };
          if (typeof relationRaw.target === "string") relation.target = relationRaw.target;
          if (typeof relationRaw.confidence === "number") relation.confidence = relationRaw.confidence;
          relations?.push(relation);
        });
      }
    }

    if (
      typeof key === "string" &&
      key.trim() !== "" &&
      typeof category === "string" &&
      category.trim() !== "" &&
      validConfidence(confidence)
    ) {
      const entity: PhysicalEntity = { key, category, confidence };
      if (attributes !== undefined) entity.attributes = attributes;
      if (relations !== undefined) entity.relations = relations;
      if (typeof raw.role === "string" && entityRoleSet.has(raw.role)) {
        entity.role = raw.role as NonNullable<PhysicalEntity["role"]>;
      }
      if (typeof raw.zone === "string" && raw.zone.trim() !== "") entity.zone = raw.zone;
      if (typeof raw.importance === "string" && entityImportanceSet.has(raw.importance)) {
        entity.importance = raw.importance as NonNullable<PhysicalEntity["importance"]>;
      }
      entities.push(entity);
    }
  });

  let zones: PhysicalZone[] | undefined;
  const zoneKeys = new Set<string>();

  if (input.zones !== undefined) {
    if (!Array.isArray(input.zones)) {
      issues.push({ path: "$.zones", message: "zones must be an array when present." });
    } else {
      zones = [];
      input.zones.forEach((raw, index) => {
        const path = `$.zones[${index}]`;
        if (!isRecord(raw)) {
          issues.push({ path, message: "Zone must be an object." });
          return;
        }

        const key = raw.key;
        const kind = raw.kind;
        const confidence = raw.confidence;

        if (typeof key !== "string" || key.trim() === "") {
          issues.push({ path: `${path}.key`, message: "key must be a non-empty string." });
        } else if (zoneKeys.has(key)) {
          issues.push({ path: `${path}.key`, message: `Duplicate zone key: ${key}.` });
        } else {
          zoneKeys.add(key);
        }

        if (typeof kind !== "string" || !zoneKindSet.has(kind)) {
          issues.push({ path: `${path}.kind`, message: "Unknown zone kind." });
        }
        if (!validConfidence(confidence)) {
          issues.push({ path: `${path}.confidence`, message: "confidence must be between 0 and 1." });
        }

        let state: PhysicalZoneState | undefined;
        if (raw.state !== undefined) {
          if (!isRecord(raw.state)) {
            issues.push({ path: `${path}.state`, message: "state must be an object when present." });
          } else {
            state = {};
            if (raw.state.clear !== undefined) {
              if (typeof raw.state.clear !== "boolean") {
                issues.push({ path: `${path}.state.clear`, message: "clear must be boolean." });
              } else {
                state.clear = raw.state.clear;
              }
            }
            if (raw.state.occupied !== undefined) {
              if (typeof raw.state.occupied !== "boolean") {
                issues.push({ path: `${path}.state.occupied`, message: "occupied must be boolean." });
              } else {
                state.occupied = raw.state.occupied;
              }
            }
            if (raw.state.clutterLevel !== undefined) {
              if (
                typeof raw.state.clutterLevel !== "string" ||
                !zoneClutterLevelSet.has(raw.state.clutterLevel)
              ) {
                issues.push({
                  path: `${path}.state.clutterLevel`,
                  message: "Unknown zone clutter level.",
                });
              } else {
                state.clutterLevel = raw.state.clutterLevel as NonNullable<PhysicalZoneState["clutterLevel"]>;
              }
            }
          }
        }

        if (
          typeof key === "string" &&
          key.trim() !== "" &&
          typeof kind === "string" &&
          zoneKindSet.has(kind) &&
          validConfidence(confidence)
        ) {
          const zone: PhysicalZone = {
            key,
            kind: kind as PhysicalZone["kind"],
            confidence,
          };
          if (state !== undefined) zone.state = state;
          zones?.push(zone);
        }
      });
    }
  }

  if (zones !== undefined) {
    for (const entity of entities) {
      if (entity.zone && !zoneKeys.has(entity.zone)) {
        issues.push({
          path: `$.entities[${entities.indexOf(entity)}].zone`,
          message: `Unknown zone reference: ${entity.zone}.`,
        });
      }
    }
  }

  let evidence: ObservationEvidence | undefined;
  if (input.evidence !== undefined) {
    if (!isRecord(input.evidence)) {
      issues.push({ path: "$.evidence", message: "evidence must be an object when present." });
    } else {
      const coverage = input.evidence.coverage;
      const quality = input.evidence.quality;
      const source = input.evidence.source;

      if (!validConfidence(coverage)) {
        issues.push({ path: "$.evidence.coverage", message: "coverage must be between 0 and 1." });
      }
      if (!validConfidence(quality)) {
        issues.push({ path: "$.evidence.quality", message: "quality must be between 0 and 1." });
      }
      if (typeof source !== "string" || !observationSourceSet.has(source)) {
        issues.push({ path: "$.evidence.source", message: "Unknown observation source." });
      }
      if (
        input.evidence.viewId !== undefined &&
        (typeof input.evidence.viewId !== "string" || input.evidence.viewId.trim() === "")
      ) {
        issues.push({
          path: "$.evidence.viewId",
          message: "viewId must be a non-empty string when present.",
        });
      }

      if (
        validConfidence(coverage) &&
        validConfidence(quality) &&
        typeof source === "string" &&
        observationSourceSet.has(source)
      ) {
        evidence = {
          coverage,
          quality,
          source: source as ObservationEvidence["source"],
        };
        if (typeof input.evidence.viewId === "string" && input.evidence.viewId.trim() !== "") {
          evidence.viewId = input.evidence.viewId;
        }
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  const value: PhysicalState = {
    schemaVersion: PSP_SCHEMA_VERSION,
    spaceId: input.spaceId as string,
    capturedAt: input.capturedAt as string,
    entities,
  };
  if (zones !== undefined) value.zones = zones;
  if (evidence !== undefined) value.evidence = evidence;

  return {
    ok: true,
    issues: [],
    value,
  };
}

export function parseState(input: unknown): PhysicalState {
  const result = validatePhysicalState(input);
  if (!result.ok || !result.value) {
    const detail = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`Invalid Physical State Protocol document: ${detail}`);
  }
  return result.value;
}
