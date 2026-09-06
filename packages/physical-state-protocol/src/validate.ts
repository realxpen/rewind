import {
  PSP_SCHEMA_VERSION,
  RELATION_TYPES,
  type AttributeValue,
  type PhysicalEntity,
  type PhysicalRelation,
  type PhysicalState,
  type ValidationIssue,
  type ValidationResult,
} from "./types.js";

const relationSet = new Set<string>(RELATION_TYPES);

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

    let attributes: Record<string, AttributeValue> | undefined;
    if (raw.attributes !== undefined) {
      if (!isRecord(raw.attributes)) {
        issues.push({ path: `${path}.attributes`, message: "attributes must be an object." });
      } else {
        attributes = {};
        for (const [name, value] of Object.entries(raw.attributes)) {
          if (!isAttributeValue(value)) {
            issues.push({ path: `${path}.attributes.${name}`, message: "Attribute values must be string, number, boolean, or null." });
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
          if (relationRaw.target !== undefined && (typeof relationRaw.target !== "string" || relationRaw.target.trim() === "")) {
            issues.push({ path: `${relationPath}.target`, message: "target must be a non-empty string when present." });
          }
          if (relationRaw.confidence !== undefined && !validConfidence(relationRaw.confidence)) {
            issues.push({ path: `${relationPath}.confidence`, message: "confidence must be between 0 and 1." });
          }

          const relation: PhysicalRelation = { type: relationRaw.type as PhysicalRelation["type"] };
          if (typeof relationRaw.target === "string") relation.target = relationRaw.target;
          if (typeof relationRaw.confidence === "number") relation.confidence = relationRaw.confidence;
          relations?.push(relation);
        });
      }
    }

    if (
      typeof key === "string" && key.trim() !== "" &&
      typeof category === "string" && category.trim() !== "" &&
      validConfidence(confidence)
    ) {
      const entity: PhysicalEntity = { key, category, confidence };
      if (attributes !== undefined) entity.attributes = attributes;
      if (relations !== undefined) entity.relations = relations;
      entities.push(entity);
    }
  });

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    issues: [],
    value: {
      schemaVersion: PSP_SCHEMA_VERSION,
      spaceId: input.spaceId as string,
      capturedAt: input.capturedAt as string,
      entities,
    },
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
