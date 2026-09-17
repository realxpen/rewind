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

// Vision-mode regression: a model returning another relation that can coexist with the
// checkpoint relation must not manufacture a MOVED result. LEFT_OF does not prove NEAR is
// false, so a missing NEAR becomes uncertainty rather than fake restoration guidance.
const relationNoiseCheckpoint: PhysicalState = {
  schemaVersion: "0.1",
  spaceId: "vision-relation-noise",
  capturedAt: "2026-09-17T12:00:00.000Z",
  entities: [
    { key: "cabinet.main", category: "cabinet", confidence: 0.99 },
    { key: "backpack.main", category: "backpack", confidence: 0.98, relations: [{ type: "NEAR", target: "cabinet.main", confidence: 0.95 }] },
  ],
};
const relationNoiseCurrent: PhysicalState = {
  ...relationNoiseCheckpoint,
  capturedAt: "2026-09-17T12:01:00.000Z",
  entities: [
    { key: "cabinet.main", category: "cabinet", confidence: 0.99 },
    { key: "backpack.main", category: "backpack", confidence: 0.96, relations: [{ type: "LEFT_OF", target: "cabinet.main", confidence: 0.92 }] },
  ],
};
const relationNoiseDiffs = compareStates(relationNoiseCheckpoint, relationNoiseCurrent, { evidenceMode: "vision" });
assert(
  relationNoiseDiffs.some(diff => diff.entity === "backpack.main" && diff.type === "UNKNOWN") &&
  !relationNoiseDiffs.some(diff => diff.entity === "backpack.main" && diff.type === "MOVED"),
  "Coexisting visual relation noise must not become a fake MOVED result.",
);

// If the expected relation is still explicitly re-observed, extra coexisting relations are
// harmless and the tracked entity remains unchanged.
const relationPreservedCurrent: PhysicalState = {
  ...relationNoiseCheckpoint,
  capturedAt: "2026-09-17T12:02:00.000Z",
  entities: [
    { key: "cabinet.main", category: "cabinet", confidence: 0.99 },
    {
      key: "backpack.main",
      category: "backpack",
      confidence: 0.97,
      relations: [
        { type: "NEAR", target: "cabinet.main", confidence: 0.95 },
        { type: "LEFT_OF", target: "cabinet.main", confidence: 0.91 },
      ],
    },
  ],
};
const relationPreservedDiffs = compareStates(relationNoiseCheckpoint, relationPreservedCurrent, { evidenceMode: "vision" });
assert(
  relationPreservedDiffs.some(diff => diff.entity === "backpack.main" && diff.type === "UNCHANGED"),
  "Re-observed checkpoint relation must remain unchanged even when another true relation is also present.",
);

// Explicit physical contradictions still produce a real movement in vision mode.
const supportCheckpoint: PhysicalState = {
  schemaVersion: "0.1",
  spaceId: "vision-support-change",
  capturedAt: "2026-09-17T12:03:00.000Z",
  entities: [
    { key: "nightstand.main", category: "nightstand", confidence: 0.99 },
    { key: "desk.main", category: "desk", confidence: 0.99 },
    { key: "candle.main", category: "candle", confidence: 0.98, relations: [{ type: "ON", target: "nightstand.main", confidence: 0.96 }] },
  ],
};
const supportCurrent: PhysicalState = {
  ...supportCheckpoint,
  capturedAt: "2026-09-17T12:04:00.000Z",
  entities: [
    { key: "nightstand.main", category: "nightstand", confidence: 0.99 },
    { key: "desk.main", category: "desk", confidence: 0.99 },
    { key: "candle.main", category: "candle", confidence: 0.97, relations: [{ type: "ON", target: "desk.main", confidence: 0.95 }] },
  ],
};
assert(
  compareStates(supportCheckpoint, supportCurrent, { evidenceMode: "vision" })
    .some(diff => diff.entity === "candle.main" && diff.type === "MOVED"),
  "ON relation changing to another support must still be a confirmed MOVED result.",
);

// A checkpoint entity that a later vision pass simply fails to emit must never become a
// deterministic REMOVED action. This protects against over-segmentation/misclassification in
// the saved image (for example, a lamp base interpreted as a candle). Strict semantic sources
// retain deterministic removal behavior.
const omittedVisionCurrent: PhysicalState = {
  ...supportCheckpoint,
  capturedAt: "2026-09-17T12:05:00.000Z",
  entities: supportCheckpoint.entities.filter(entity => entity.key !== "candle.main"),
};
const omittedVisionDiffs = compareStates(supportCheckpoint, omittedVisionCurrent, { evidenceMode: "vision" });
const omittedVisionMatch = calculateMatch(omittedVisionDiffs);
assert(
  omittedVisionDiffs.some(diff => diff.entity === "candle.main" && diff.type === "UNKNOWN") &&
  !omittedVisionDiffs.some(diff => diff.entity === "candle.main" && diff.type === "REMOVED"),
  "Vision omission must be UNKNOWN, never a confirmed REMOVED restoration action.",
);
assert(omittedVisionMatch.percentage === 100, "Uncertain omission must not reduce match percentage for comparable evidence.");
assert(omittedVisionMatch.coveragePercentage < 100, "Uncertain omission must reduce evidence coverage instead.");
assert(!omittedVisionMatch.restored, "Uncertain omission must prevent an unsupported exact-restored declaration.");
assert(
  compareStates(supportCheckpoint, omittedVisionCurrent, { evidenceMode: "strict" })
    .some(diff => diff.entity === "candle.main" && diff.type === "REMOVED"),
  "Strict deterministic semantic sources must still detect real removals.",
);

const appearanceCheckpoint: PhysicalState = {
  schemaVersion: "0.1",
  spaceId: "appearance-test",
  capturedAt: "2026-09-10T08:00:00.000Z",
  entities: [{ key: "bird.1", category: "bird", confidence: 1, attributes: { color: "red", material: "feather", species: null } }],
};
const appearanceCurrent: PhysicalState = {
  ...appearanceCheckpoint,
  capturedAt: "2026-09-10T08:01:00.000Z",
  entities: [{ key: "bird.1", category: "bird", confidence: 1, attributes: { color: "red_and_black", material: "feathers", species: "cardinal" } }],
};
const appearanceDiffs = compareStates(appearanceCheckpoint, appearanceCurrent);
const appearanceMatch = calculateMatch(appearanceDiffs);
assert(appearanceDiffs.length === 0, "Transient living entities must be excluded from restoration truth.");
assert(appearanceMatch.restored && appearanceMatch.percentage === 100, "Transient bird changes must not block restoration.");

const birdFeederCheckpoint: PhysicalState = {
  schemaVersion: "0.1",
  spaceId: "bird-feeder-test",
  capturedAt: "2026-09-15T09:00:00.000Z",
  entities: [
    { key: "bird_feeder_1", category: "bird_feeder", confidence: 1 },
    { key: "bird_1", category: "bird", confidence: 1, relations: [{ type: "ON", target: "bird_feeder_1", confidence: 1 }] },
  ],
};
const birdFeederCurrent: PhysicalState = {
  ...birdFeederCheckpoint,
  capturedAt: "2026-09-15T09:01:00.000Z",
  entities: [
    { key: "bird_feeder_1", category: "bird_feeder", confidence: 1 },
    { key: "bird_1", category: "bird", confidence: 1, relations: [{ type: "INSIDE", target: "bird_feeder_1", confidence: 1 }] },
  ],
};
const birdFeederDiffs = compareStates(birdFeederCheckpoint, birdFeederCurrent);
assert(birdFeederDiffs.length === 1 && birdFeederDiffs[0]?.entity === "bird_feeder_1" && birdFeederDiffs[0]?.type === "UNCHANGED", "Bird motion must not create a restore action while the feeder remains tracked.");

console.log("PASS diff-engine: deterministic demo + conservative vision relations/removals + confirmed support moves + transient noise ignored");
