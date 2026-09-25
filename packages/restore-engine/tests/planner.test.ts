import { demoReady, messy, partial, restored } from "../../physical-state-protocol/fixtures/studio.js";
import { compareStates } from "../../diff-engine/src/index.js";
import { buildRestorePlan, updateRestoreProgress } from "../src/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const initialDiffs = compareStates(demoReady, messy);
const plan = buildRestorePlan(initialDiffs);
assert(plan.actions.length === 6, `Expected six restore actions, got ${plan.actions.length}.`);
assert(plan.actions.some((action) => action.instruction === "Move chair main behind desk main."), "Expected semantic chair restore instruction.");
assert(plan.actions.some((action) => action.instruction === "Turn on lamp left."), "Expected lamp power restore instruction.");
assert(plan.actions.some((action) => action.instruction === "Clear desk main."), "Expected desk clear restore instruction.");

const selfRelationPlan = buildRestorePlan([{
  type: "MOVED",
  entity: "table.coffee",
  category: "table",
  expected: { relations: [{ type: "ON", target: "table.coffee", confidence: 0.95 }] },
  actual: { relations: [{ type: "NEAR", target: "sofa.main", confidence: 0.95 }] },
  confidence: 0.95,
  reason: "regression",
}]);
assert(
  selfRelationPlan.actions[0]?.instruction === "Return table coffee to its checkpoint position.",
  "Self-relations must never generate Move X on X guidance.",
);

const explicitRemovedPlan = buildRestorePlan([{
  type: "REMOVED",
  entity: "notebook.left",
  category: "notebook",
  expected: {
    entity: {
      key: "notebook.left",
      category: "notebook",
      confidence: 0.97,
      attributes: { present: true },
      relations: [{ type: "ON", target: "table.main", confidence: 0.95 }],
    },
  },
  actual: {
    entity: {
      key: "notebook.left",
      category: "notebook",
      confidence: 0.94,
      attributes: { present: false },
    },
  },
  confidence: 0.94,
  reason: "explicit absence",
}]);
assert(
  explicitRemovedPlan.actions[0]?.instruction === "Move notebook left on table main.",
  "Explicit removed movable objects should get object-level restore guidance anchored to the saved relation.",
);

const partialProgress = updateRestoreProgress(plan, compareStates(demoReady, partial));
assert(partialProgress.percentage > 0 && partialProgress.percentage < 100, "Partial fixture should produce intermediate progress.");
assert(!partialProgress.restored, "Partial fixture must not be restored.");

const finalProgress = updateRestoreProgress(plan, compareStates(demoReady, restored));
assert(finalProgress.percentage === 100, `Expected 100% final progress, got ${finalProgress.percentage}%.`);
assert(finalProgress.restored, "Restored fixture should complete restore progress.");
assert(finalProgress.actions.every((action) => action.status === "VERIFIED"), "Every action should be VERIFIED when restored.");

console.log("PASS restore-engine: plan generation + partial progress + 100% verification");
