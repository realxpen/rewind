import assert from "node:assert/strict";
import {
  demoReady,
  messy,
  restored,
} from "../../physical-state-protocol/fixtures/studio.js";
import { evaluateChangedSceneGate } from "../src/index.js";

const changed = evaluateChangedSceneGate(demoReady, messy);
assert.equal(changed.recognizedRequiredChanges, 6);
assert.equal(changed.requiredChangeCount, 6);
assert.equal(changed.missedRequiredChanges.length, 0);
assert.equal(changed.falseRestored, false);
assert.equal(changed.passed, true);

const restoredGate = evaluateChangedSceneGate(demoReady, restored);
assert.equal(restoredGate.recognizedRequiredChanges, 0);
assert.equal(restoredGate.falseRestored, true);
assert.equal(restoredGate.passed, false);

console.log("PASS vision matrix gate: 6/6 canonical changes + false-restored guard");
