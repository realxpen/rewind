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

const partialProgress = updateRestoreProgress(plan, compareStates(demoReady, partial));
assert(partialProgress.percentage > 0 && partialProgress.percentage < 100, "Partial fixture should produce intermediate progress.");
assert(!partialProgress.restored, "Partial fixture must not be restored.");

const finalProgress = updateRestoreProgress(plan, compareStates(demoReady, restored));
assert(finalProgress.percentage === 100, `Expected 100% final progress, got ${finalProgress.percentage}%.`);
assert(finalProgress.restored, "Restored fixture should complete restore progress.");
assert(finalProgress.actions.every((action) => action.status === "VERIFIED"), "Every action should be VERIFIED when restored.");

console.log("PASS restore-engine: plan generation + partial progress + 100% verification");
