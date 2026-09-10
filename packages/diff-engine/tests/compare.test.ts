import { demoReady, messy, restored } from "../../physical-state-protocol/fixtures/studio.js";
import type { PhysicalState } from "../../physical-state-protocol/src/index.js";
import { calculateMatch, compareStates } from "../src/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const diffs = compareStates(demoReady, messy);
const changed = diffs.filter((diff) => diff.type !== "UNCHANGED");
const summary = changed.map((diff) => `${diff.entity}:${diff.type}`).sort();

assert(changed.length === 6, `Expected six demo changes, got ${changed.length}: ${summary.join(", ")}`);
assert(summary.includes("chair.main:MOVED"), "Expected chair to be MOVED.");
assert(summary.includes("headphones.main:MOVED"), "Expected headphones to be MOVED.");
assert(summary.includes("backpack.black:MOVED"), "Expected backpack to be MOVED.");
assert(summary.includes("tripod.camera:REMOVED"), "Expected tripod to be REMOVED.");
assert(summary.includes("desk.main:ATTRIBUTE_CHANGED"), "Expected desk to have ATTRIBUTE_CHANGED.");
assert(summary.includes("lamp.left:ATTRIBUTE_CHANGED"), "Expected lamp to have ATTRIBUTE_CHANGED.");

const restoredDiffs = compareStates(demoReady, restored);
const restoredMatch = calculateMatch(restoredDiffs);
assert(restoredMatch.restored, "Restored fixture should be 100% restored.");
assert(restoredMatch.percentage === 100, `Expected 100% match, got ${restoredMatch.percentage}%.`);

const withAdded: PhysicalState = {
  ...demoReady,
  capturedAt: "2026-09-06T09:30:00.000Z",
  entities: [...demoReady.entities, { key: "bottle.water", category: "bottle", confidence: 0.93, relations: [{ type: "ON", target: "desk.main" }] }],
};
assert(compareStates(demoReady, withAdded).some((diff) => diff.entity === "bottle.water" && diff.type === "ADDED"), "Expected added bottle to be ADDED.");

const uncertain: PhysicalState = {
  ...demoReady,
  capturedAt: "2026-09-06T09:31:00.000Z",
  entities: demoReady.entities.map((entity) => entity.key === "chair.main" ? { ...entity, confidence: 0.4 } : entity),
};
assert(compareStates(demoReady, uncertain).some((diff) => diff.entity === "chair.main" && diff.type === "UNKNOWN"), "Low-confidence chair should be UNKNOWN.");

const appearanceCheckpoint: PhysicalState = {
  schemaVersion: "0.1",
  spaceId: "appearance-test",
  capturedAt: "2026-09-10T08:00:00.000Z",
  entities: [{ key: "bird.1", category: "bird", confidence: 1, attributes: { color: "red", material: "feather" } }],
};
const appearanceCurrent: PhysicalState = {
  ...appearanceCheckpoint,
  capturedAt: "2026-09-10T08:01:00.000Z",
  entities: [{ key: "bird.1", category: "bird", confidence: 1, attributes: { color: "red_and_black", material: "feathers" } }],
};
const appearanceDiffs = compareStates(appearanceCheckpoint, appearanceCurrent);
const appearanceMatch = calculateMatch(appearanceDiffs);
assert(appearanceDiffs.every((diff) => diff.type === "UNCHANGED"), "Appearance descriptors must not become restoration actions.");
assert(appearanceMatch.restored && appearanceMatch.percentage === 100, "Appearance-only wording drift must not block restoration.");

console.log("PASS diff-engine: six demo changes + ADDED + UNKNOWN + 100% restored + appearance noise ignored");
