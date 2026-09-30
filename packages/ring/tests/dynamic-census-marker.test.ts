import { calculateMatch, compareStates } from "../../diff-engine/src/index.js";
import type { PhysicalState } from "../../physical-state-protocol/src/index.js";
import { buildRestorePlan } from "../../restore-engine/src/index.js";
import { isDynamicSubjectEntity, mergeDynamicSubjectCensus } from "../src/tracked-entities.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const spaceId = "dynamic-marker-census";
const baseline: PhysicalState = {
  schemaVersion: "0.1",
  spaceId,
  capturedAt: "2026-09-30T10:00:00.000Z",
  entities: [
    { key: "anchor.main", category: "feeder", confidence: 0.99 },
    {
      key: "subject.dark",
      category: "bird",
      confidence: 0.97,
      attributes: {
        present: true,
        dynamic_subject: true,
        color: "dark",
        appearance: "small dark subject",
        frame_x: 20,
        frame_y: 40,
      },
    },
    {
      key: "subject.light",
      category: "bird",
      confidence: 0.97,
      attributes: {
        present: true,
        dynamic_subject: true,
        color: "light",
        appearance: "small light subject",
        frame_x: 55,
        frame_y: 40,
      },
    },
  ],
};

const tracked: PhysicalState = {
  ...baseline,
  capturedAt: "2026-09-30T10:01:00.000Z",
};

const census: PhysicalState = {
  ...baseline,
  capturedAt: "2026-09-30T10:01:00.000Z",
  entities: [
    baseline.entities[0]!,
    {
      key: "census.dark",
      category: "animal",
      confidence: 0.97,
      attributes: {
        present: true,
        dynamic_subject: true,
        color: "dark",
        appearance: "small dark subject",
        frame_x: 20,
        frame_y: 40,
      },
    },
    {
      key: "census.light",
      category: "bird",
      confidence: 0.97,
      attributes: {
        present: true,
        dynamic_subject: true,
        color: "light",
        appearance: "small light subject",
        frame_x: 55,
        frame_y: 40,
      },
    },
    {
      key: "census.new-red",
      category: "cardinal",
      confidence: 0.98,
      attributes: {
        present: true,
        dynamic_subject: true,
        color: "red",
        appearance: "bright red subject",
        frame_x: 80,
        frame_y: 45,
      },
    },
  ],
};

const merged = mergeDynamicSubjectCensus(tracked, census);
assert(merged.added === 1, `Expected exactly one dynamic surplus despite category drift, got ${merged.added}.`);
const visibleDynamic = merged.state.entities.filter(entity =>
  isDynamicSubjectEntity(entity) && entity.attributes?.present !== false,
);
assert(visibleDynamic.length === 3, `Expected three visible dynamic subjects after census merge, got ${visibleDynamic.length}.`);
assert(
  visibleDynamic.some(entity => entity.attributes?.color === "red" && entity.attributes?.dynamic_subject === true),
  "The visually distinct surplus subject must survive into deterministic comparison.",
);

const arrivalDiffs = compareStates(baseline, merged.state, { evidenceMode: "vision" });
const arrivalMatch = calculateMatch(arrivalDiffs);
assert(
  arrivalDiffs.filter(diff => diff.type === "ADDED").length === 1,
  `Expected exactly one ADDED dynamic subject, got ${arrivalDiffs.filter(diff => diff.type === "ADDED").length}.`,
);
assert(
  arrivalMatch.percentage < 100 && !arrivalMatch.restored,
  `A 2→3 dynamic scene must never report restored/100%; got ${arrivalMatch.percentage}%.`,
);

const arrivalPlan = buildRestorePlan(arrivalDiffs);
assert(arrivalPlan.actions.length === 0, "A dynamic-subject arrival must never generate a manual restore action.");
assert(arrivalPlan.blockedUnknowns.length === 0, "A dynamic-subject arrival must not block the manual restoration plan.");

const movedState: PhysicalState = {
  ...baseline,
  capturedAt: "2026-09-30T10:02:00.000Z",
  entities: baseline.entities.map(entity =>
    entity.key === "subject.light"
      ? {
          ...entity,
          category: "cardinal",
          attributes: {
            ...(entity.attributes ?? {}),
            frame_x: 70,
            frame_y: 45,
          },
        }
      : entity,
  ),
};
const movementDiffs = compareStates(baseline, movedState, { evidenceMode: "vision" });
const movementMatch = calculateMatch(movementDiffs);
assert(
  movementDiffs.some(diff => diff.entity === "subject.light" && diff.type === "MOVED"),
  "A high-confidence dynamic subject displacement must produce MOVED even when the category wording drifts.",
);
assert(
  movementMatch.percentage < 100 && !movementMatch.restored,
  `A moved dynamic subject must reduce match below 100%; got ${movementMatch.percentage}%.`,
);
assert(
  buildRestorePlan(movementDiffs).actions.length === 0,
  "Dynamic-subject movement must affect match without producing a manual move instruction.",
);

const jitterState: PhysicalState = {
  ...baseline,
  capturedAt: "2026-09-30T10:03:00.000Z",
  entities: baseline.entities.map(entity =>
    entity.key === "subject.light"
      ? {
          ...entity,
          attributes: {
            ...(entity.attributes ?? {}),
            frame_x: 60,
            frame_y: 45,
          },
        }
      : entity,
  ),
};
const jitterMatch = calculateMatch(compareStates(baseline, jitterState, { evidenceMode: "vision" }));
assert(
  jitterMatch.percentage === 100 && jitterMatch.restored,
  `Small fixed-camera coordinate jitter should stay matched; got ${jitterMatch.percentage}%.`,
);

console.log("PASS Ring dynamic census: 2→3 arrival + marker/category drift + deterministic movement threshold + zero manual actions");