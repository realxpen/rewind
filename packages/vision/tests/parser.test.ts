import assert from "node:assert/strict";
import {
  parseNovaPhysicalState,
  VisionContractError,
} from "../src/index.js";

const context = {
  spaceId: "studio",
  capturedAt: "2026-09-06T10:30:00.000Z",
  trackedEntities: [
    { key: "desk.main", category: "desk" },
    { key: "chair.main", category: "chair" },
  ],
};

const candidate = {
  schemaVersion: "0.1",
  spaceId: "studio",
  capturedAt: "2026-09-06T10:30:00.000Z",
  entities: [
    {
      key: "chair.main",
      category: "Chair",
      confidence: 0.94,
      relations: [{ type: "BEHIND", target: "desk.main", confidence: 0.91 }],
    },
    {
      key: "desk.main",
      category: "Desk",
      confidence: 0.98,
      attributes: { clear: true },
    },
  ],
};

const parsed = parseNovaPhysicalState(JSON.stringify(candidate), context);
assert.equal(parsed.entities[0]?.key, "chair.main");
assert.equal(parsed.entities[0]?.category, "chair");
assert.equal(parsed.entities[1]?.key, "desk.main");

const fenced = parseNovaPhysicalState(
  `\`\`\`json\n${JSON.stringify(candidate)}\n\`\`\``,
  context,
);
assert.deepEqual(fenced, parsed);

const lowConfidence = structuredClone(candidate);
lowConfidence.entities[0].confidence = 0.42;
const lowParsed = parseNovaPhysicalState(JSON.stringify(lowConfidence), context);
assert.equal(lowParsed.entities[0]?.confidence, 0.42);

const mismatched = { ...candidate, spaceId: "other-room" };
assert.throws(
  () => parseNovaPhysicalState(JSON.stringify(mismatched), context),
  (error: unknown) =>
    error instanceof VisionContractError && error.code === "SPACE_MISMATCH",
);

const invalidRelation = structuredClone(candidate);
invalidRelation.entities[0].relations = [
  { type: "TELEPORTED_TO", target: "desk.main", confidence: 0.9 },
];
assert.throws(
  () => parseNovaPhysicalState(JSON.stringify(invalidRelation), context),
  (error: unknown) =>
    error instanceof VisionContractError && error.code === "SCHEMA_REJECTED",
);

console.log("PASS vision parser: JSON extraction + Zod + PSP validation + UNKNOWN-ready confidence");
