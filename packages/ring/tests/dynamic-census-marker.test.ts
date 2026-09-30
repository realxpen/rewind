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
      attributes: { present: true, dynamic_subject: true, color: "dark", appearance: "small dark subject" },
    },
    {
      key: "subject.light",
      category: "bird",
      confidence: 0.97,
      attributes: { present: true, dynamic_subject: true, color: "light", appearance: "small light subject" },
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
      attributes: { present: true, dynamic_subject: true, color: "dark", appearance: "small dark subject" },
    },
    {
      key: "census.light",
      category: "bird",
      confidence: 0.97,
      attributes: { present: true, dynamic_subject: true, color: "light", appearance: "small light subject" },
    },
    {
      key: "census.new-red",
      category: "cardinal",
      confidence: 0.98,
      attributes: { present: true, dynamic_subject: true, color: "red", appearance: "bright red subject" },
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

const comparisonState = (state: PhysicalState): PhysicalState => ({
  ...state,
  entities: state.entities.map(entity =>
    isDynamicSubjectEntity(entity) ? { ...entity, category: "dynamic-subject" } : entity),
});
const diffs = compareStates(comparisonState(baseline), comparisonState(merged.state), { evidenceMode: "vision" });
const match = calculateMatch(diffs);
assert(
  diffs.filter(diff => diff.type === "ADDED").length === 1,
  `Expected exactly one ADDED dynamic subject, got ${diffs.filter(diff => diff.type === "ADDED").length}.`,
);
assert(match.percentage < 100 && !match.restored, `A 2→3 dynamic scene must never report restored/100%; got ${match.percentage}%.`);

const plan = buildRestorePlan(diffs);
assert(plan.actions.length === 0, "A dynamic-subject arrival must never generate a manual restore action.");
assert(plan.blockedUnknowns.length === 0, "A dynamic-subject arrival must not block the manual restoration plan.");

console.log("PASS Ring dynamic census: marker-driven 2→3 category drift produces one diff, <100% match, and zero manual actions");