import assert from "node:assert/strict";
import {
  evidenceCoveragePercent,
  evidenceQualityPercent,
  entitiesInZone,
  groupEntitiesByZone,
  normalizeState,
  parseState,
  validatePhysicalState,
  type PhysicalState,
} from "../src/index.js";

const legacyState: PhysicalState = {
  schemaVersion: "0.1",
  spaceId: " legacy-room ",
  capturedAt: "2026-09-18T09:00:00.000Z",
  entities: [
    {
      key: "desk.main",
      category: "Desk",
      confidence: 0.98,
      attributes: {
        clear: true,
        color: "brown",
      },
    },
  ],
};

const legacyParsed = parseState(legacyState);
assert.equal(legacyParsed.zones, undefined);
assert.equal(legacyParsed.evidence, undefined);

const legacyNormalized = normalizeState(legacyState);
assert.equal(legacyNormalized.spaceId, "legacy-room");
assert.equal(legacyNormalized.entities[0]?.category, "desk");
assert.deepEqual(legacyNormalized.entities[0]?.attributes, { clear: true });
assert.equal(legacyNormalized.zones, undefined);
assert.equal(legacyNormalized.evidence, undefined);

const enrichedState = {
  schemaVersion: "0.1",
  spaceId: "living-room",
  capturedAt: "2026-09-18T09:05:00.000Z",
  entities: [
    {
      key: "table.coffee",
      category: "table",
      confidence: 0.99,
      role: "SURFACE",
      zone: "zone.table",
      importance: "critical",
      attributes: { clear: true },
    },
    {
      key: "remote.main",
      category: "remote",
      confidence: 0.94,
      role: "MOVABLE",
      zone: "zone.table",
      importance: "normal",
      relations: [
        { type: "ON", target: "table.coffee", confidence: 0.93 },
      ],
    },
    {
      key: "sofa.main",
      category: "sofa",
      confidence: 0.97,
      role: "ANCHOR",
      zone: "zone.sofa",
      importance: "critical",
    },
  ],
  zones: [
    {
      key: "zone.sofa",
      kind: "SOFA",
      confidence: 0.96,
      state: {
        clear: true,
        occupied: false,
        clutterLevel: "clear",
      },
    },
    {
      key: "zone.table",
      kind: "TABLE",
      confidence: 0.98,
      state: {
        clear: true,
        clutterLevel: "clear",
      },
    },
  ],
  evidence: {
    coverage: 0.91,
    quality: 0.88,
    source: "nova",
    viewId: " primary ",
  },
} as const;

const enrichedValidation = validatePhysicalState(enrichedState);
assert.equal(enrichedValidation.ok, true);
assert(enrichedValidation.value);

const enrichedNormalized = normalizeState(enrichedState);
assert.deepEqual(enrichedNormalized.zones?.map(zone => zone.key), ["zone.sofa", "zone.table"]);
assert.equal(enrichedNormalized.entities.find(entity => entity.key === "table.coffee")?.role, "SURFACE");
assert.equal(enrichedNormalized.entities.find(entity => entity.key === "remote.main")?.zone, "zone.table");
assert.equal(enrichedNormalized.entities.find(entity => entity.key === "sofa.main")?.importance, "critical");
assert.equal(enrichedNormalized.evidence?.viewId, "primary");
assert.equal(evidenceCoveragePercent(enrichedNormalized.evidence), 91);
assert.equal(evidenceQualityPercent(enrichedNormalized.evidence), 88);
assert.equal(entitiesInZone(enrichedNormalized, "zone.table").length, 2);
assert.equal(groupEntitiesByZone(enrichedNormalized).get("zone.sofa")?.[0]?.key, "sofa.main");

const invalidRole = validatePhysicalState({
  ...enrichedState,
  entities: [
    {
      key: "chair.main",
      category: "chair",
      confidence: 0.9,
      role: "FURNITURE",
    },
  ],
});
assert.equal(invalidRole.ok, false);
assert(invalidRole.issues.some(issue => issue.path.endsWith(".role")));

const invalidZoneReference = validatePhysicalState({
  ...enrichedState,
  entities: [
    {
      key: "chair.main",
      category: "chair",
      confidence: 0.9,
      role: "MOVABLE",
      zone: "zone.missing",
    },
  ],
});
assert.equal(invalidZoneReference.ok, false);
assert(invalidZoneReference.issues.some(issue => issue.message.includes("Unknown zone reference")));

const invalidEvidence = validatePhysicalState({
  ...enrichedState,
  evidence: {
    coverage: 1.2,
    quality: 0.9,
    source: "nova",
  },
});
assert.equal(invalidEvidence.ok, false);
assert(invalidEvidence.issues.some(issue => issue.path === "$.evidence.coverage"));

console.log("PASS PSP hardening foundation: legacy compatibility + roles + zones + evidence metadata");
