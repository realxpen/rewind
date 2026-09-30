import { calculateMatch, compareStates } from "../../diff-engine/src/index.js";
import type { PhysicalEntity, PhysicalState } from "../../physical-state-protocol/src/index.js";
import { buildRestorePlan } from "../../restore-engine/src/index.js";
import { isDynamicSubjectEntity, mergeDynamicSubjectCensus } from "../src/tracked-entities.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function dynamicEntity(
  key: string,
  color: string,
  frameX: number,
  frameY: number,
  category = "bird",
  confidence = 0.97,
): PhysicalEntity {
  return {
    key,
    category,
    confidence,
    attributes: {
      present: true,
      dynamic_subject: true,
      color,
      appearance: `${color} visible subject`,
      frame_x: frameX,
      frame_y: frameY,
    },
  };
}

function legacyDynamicEntity(entity: PhysicalEntity): PhysicalEntity {
  const attributes = Object.fromEntries(
    Object.entries(entity.attributes ?? {}).filter(([key]) => key !== "dynamic_subject"),
  );
  return {
    ...entity,
    ...(Object.keys(attributes).length ? { attributes } : {}),
  };
}

const spaceId = "dynamic-marker-census";
const anchor: PhysicalEntity = { key: "anchor.main", category: "feeder", confidence: 0.99 };
const dark = dynamicEntity("subject.dark", "dark", 20, 40);
const light = dynamicEntity("subject.light", "light", 55, 40);
const red = dynamicEntity("subject.red", "red", 80, 45, "cardinal", 0.98);

const baseline: PhysicalState = {
  schemaVersion: "0.1",
  spaceId,
  capturedAt: "2026-09-30T10:00:00.000Z",
  entities: [anchor, dark, light],
};

const sameTwoCensus: PhysicalState = {
  ...baseline,
  capturedAt: "2026-09-30T10:01:00.000Z",
  entities: [
    anchor,
    dynamicEntity("census.dark", "dark", 20, 40, "animal"),
    dynamicEntity("census.light", "light", 55, 40),
  ],
};

// 2 -> 2: unchanged dynamic cardinality must be a true match.
const stableTwo = mergeDynamicSubjectCensus({ ...baseline, capturedAt: "2026-09-30T10:01:00.000Z" }, sameTwoCensus);
assert(stableTwo.added === 0, "Stable 2→2 census must not create arrivals.");
const stableTwoDiffs = compareStates(baseline, stableTwo.state, { evidenceMode: "vision" });
const stableTwoMatch = calculateMatch(stableTwoDiffs);
assert(stableTwoMatch.percentage === 100 && stableTwoMatch.restored, `Stable 2→2 must remain 100%; got ${stableTwoMatch.percentage}%.`);

// Backward compatibility: old Ring checkpoints saved before dynamic_subject/census existed
// must be upgraded in memory whenever the current state explicitly uses modern Ring dynamics.
const legacyBaseline: PhysicalState = {
  ...baseline,
  capturedAt: "2026-09-29T10:00:00.000Z",
  entities: [anchor, legacyDynamicEntity(dark), legacyDynamicEntity(light)],
};
const legacyStableDiffs = compareStates(legacyBaseline, stableTwo.state, { evidenceMode: "vision" });
const legacyStableMatch = calculateMatch(legacyStableDiffs);
assert(
  legacyStableDiffs.filter(diff => diff.type === "ADDED" || diff.type === "REMOVED").length === 0,
  "Legacy two-subject checkpoint compared with modern two-subject Ring state must not invent arrivals/departures.",
);
assert(
  legacyStableMatch.percentage === 100 && legacyStableMatch.restored,
  `Legacy 2→2 checkpoint migration must preserve a true match; got ${legacyStableMatch.percentage}%.`,
);

// Identity churn with the same independent count must never become fake arrivals or 100%.
const churnTracked: PhysicalState = {
  ...baseline,
  capturedAt: "2026-09-30T10:01:15.000Z",
  entities: [
    anchor,
    dark,
    light,
    dynamicEntity("tracker.duplicate.dark", "dark", 21, 40, "animal"),
    dynamicEntity("tracker.duplicate.light", "light", 56, 40, "cardinal"),
  ],
};
const churnMerged = mergeDynamicSubjectCensus(churnTracked, sameTwoCensus);
const churnDiffs = compareStates(baseline, churnMerged.state, { evidenceMode: "vision" });
const churnMatch = calculateMatch(churnDiffs);
assert(churnDiffs.filter(diff => diff.type === "ADDED").length === 0, "Same-count identity churn must not leak phantom ADDED rows.");
assert(churnDiffs.some(diff => diff.type === "UNKNOWN" && diff.entity === "rewind.dynamic-census"), "Tracker/census disagreement must surface as census uncertainty.");
assert(churnMatch.percentage < 100 && !churnMatch.restored, "Tracker/census disagreement must never display 100%.");

// 2 -> 3: open census sees one real surplus while tracked pass still covers only saved identities.
const threeCensus: PhysicalState = {
  ...baseline,
  capturedAt: "2026-09-30T10:01:30.000Z",
  entities: [
    anchor,
    dynamicEntity("census.dark", "dark", 20, 40, "animal"),
    dynamicEntity("census.light", "light", 55, 40),
    dynamicEntity("census.new-red", "red", 80, 45, "cardinal", 0.98),
  ],
};
const arrivalMerged = mergeDynamicSubjectCensus({ ...baseline, capturedAt: "2026-09-30T10:01:30.000Z" }, threeCensus);
assert(arrivalMerged.added === 1, `Expected one census surplus for 2→3, got ${arrivalMerged.added}.`);
const arrivalDiffs = compareStates(baseline, arrivalMerged.state, { evidenceMode: "vision" });
const arrivalMatch = calculateMatch(arrivalDiffs);
assert(arrivalDiffs.filter(diff => diff.type === "ADDED").length === 1, `2→3 must produce exactly one ADDED subject; got ${arrivalDiffs.filter(diff => diff.type === "ADDED").length}.`);
assert(arrivalMatch.percentage < 100 && !arrivalMatch.restored, `2→3 must never report restored/100%; got ${arrivalMatch.percentage}%.`);
assert(buildRestorePlan(arrivalDiffs).actions.length === 0, "Dynamic arrival must never generate a manual restore action.");
assert(buildRestorePlan(arrivalDiffs).blockedUnknowns.length === 0, "Dynamic arrival/census uncertainty must not block manual restoration work.");

const legacyArrivalDiffs = compareStates(legacyBaseline, arrivalMerged.state, { evidenceMode: "vision" });
assert(
  legacyArrivalDiffs.filter(diff => diff.type === "ADDED").length === 1,
  `Legacy 2→3 checkpoint migration must produce exactly one arrival; got ${legacyArrivalDiffs.filter(diff => diff.type === "ADDED").length}.`,
);
assert(
  calculateMatch(legacyArrivalDiffs).percentage < 100,
  "Legacy 2→3 checkpoint migration must never collapse to 100%.",
);

// 2 -> 3 where checkpoint-guided tracking itself already saw the extra: census must not duplicate it.
const trackedThree: PhysicalState = {
  ...baseline,
  capturedAt: "2026-09-30T10:01:45.000Z",
  entities: [anchor, dark, light, red],
};
const alreadyTrackedArrival = mergeDynamicSubjectCensus(trackedThree, threeCensus);
assert(alreadyTrackedArrival.added === 0, "A surplus already represented by tracked perception must not be appended twice.");
const alreadyTrackedDiffs = compareStates(baseline, alreadyTrackedArrival.state, { evidenceMode: "vision" });
assert(alreadyTrackedDiffs.filter(diff => diff.type === "ADDED").length === 1, "Tracked 2→3 must still resolve to one deterministic arrival.");
assert(calculateMatch(alreadyTrackedDiffs).percentage < 100, "Tracked 2→3 must stay below 100%.");

// 3 -> 2: clear explicit absence becomes one REMOVED/left-scene change.
const baselineThree: PhysicalState = {
  ...baseline,
  capturedAt: "2026-09-30T10:02:00.000Z",
  entities: [anchor, dark, light, red],
};
const redAbsent: PhysicalEntity = {
  ...red,
  attributes: { ...(red.attributes ?? {}), present: false },
};
const trackedDeparture: PhysicalState = {
  ...baselineThree,
  capturedAt: "2026-09-30T10:02:30.000Z",
  entities: [anchor, dark, light, redAbsent],
};
const departureMerged = mergeDynamicSubjectCensus(trackedDeparture, sameTwoCensus);
const departureDiffs = compareStates(baselineThree, departureMerged.state, { evidenceMode: "vision" });
assert(departureDiffs.filter(diff => diff.type === "REMOVED").length === 1, "Clear 3→2 must produce exactly one REMOVED subject.");
assert(calculateMatch(departureDiffs).percentage < 100, "3→2 departure must reduce the match below 100%.");
assert(buildRestorePlan(departureDiffs).actions.length === 0, "Dynamic departure must never generate a manual return instruction.");

// If tracked perception still claims three while independent census sees two, never claim restored.
const uncertainDeparture = mergeDynamicSubjectCensus({ ...baselineThree, capturedAt: "2026-09-30T10:02:45.000Z" }, sameTwoCensus);
const uncertainDepartureDiffs = compareStates(baselineThree, uncertainDeparture.state, { evidenceMode: "vision" });
assert(uncertainDepartureDiffs.some(diff => diff.entity === "rewind.dynamic-census" && diff.type === "UNKNOWN"), "3→2 tracker/census disagreement must surface as UNKNOWN.");
assert(calculateMatch(uncertainDepartureDiffs).percentage < 100, "Uncertain 3→2 must never collapse to 100%.");

// Movement: same identity, meaningful fixed-camera displacement.
const movedState: PhysicalState = {
  ...baseline,
  capturedAt: "2026-09-30T10:03:00.000Z",
  entities: baseline.entities.map(entity =>
    entity.key === "subject.light"
      ? { ...entity, category: "cardinal", attributes: { ...(entity.attributes ?? {}), frame_x: 70, frame_y: 45 } }
      : entity,
  ),
};
const movementDiffs = compareStates(baseline, movedState, { evidenceMode: "vision" });
const movementMatch = calculateMatch(movementDiffs);
assert(movementDiffs.some(diff => diff.entity === "subject.light" && diff.type === "MOVED"), "Meaningful dynamic displacement must produce MOVED despite category wording drift.");
assert(movementMatch.percentage < 100 && !movementMatch.restored, `Moved dynamic subject must reduce match below 100%; got ${movementMatch.percentage}%.`);
assert(buildRestorePlan(movementDiffs).actions.length === 0, "Dynamic movement must never generate a manual move instruction.");

// Small fixed-camera coordinate noise must not create movement.
const jitterState: PhysicalState = {
  ...baseline,
  capturedAt: "2026-09-30T10:04:00.000Z",
  entities: baseline.entities.map(entity =>
    entity.key === "subject.light"
      ? { ...entity, attributes: { ...(entity.attributes ?? {}), frame_x: 60, frame_y: 45 } }
      : entity,
  ),
};
const jitterMatch = calculateMatch(compareStates(baseline, jitterState, { evidenceMode: "vision" }));
assert(jitterMatch.percentage === 100 && jitterMatch.restored, `Small coordinate jitter should remain 100%; got ${jitterMatch.percentage}%.`);

console.log("PASS Ring dynamic reliability matrix: modern + legacy 2→2 stable, churn guarded, modern + legacy 2→3 arrival, 3→2 departure/uncertainty, movement, jitter, zero living-subject actions");
