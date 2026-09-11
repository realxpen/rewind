import assert from "node:assert/strict";
import {
  detectCriticalIntent,
  operationSatisfied,
  renderCompareResult,
  renderRewindResult,
} from "../src/critical-intent.js";

const checkpoint = {
  id: "checkpoint-1",
  spaceId: "studio",
  name: "Demo Ready",
  observationId: "observation-1",
  createdAt: "2026-09-11T00:00:00.000Z",
  entityCount: 8,
  stateHash: "hash",
};

assert.equal(detectCriticalIntent("What changed?"), "compare_checkpoint");
assert.equal(detectCriticalIntent("Rewind my studio"), "start_rewind");
assert.equal(detectCriticalIntent("Check again"), "verify_rewind");
assert.equal(detectCriticalIntent("heck again"), "verify_rewind");
assert.equal(detectCriticalIntent("Inspect my studio"), undefined);
assert.equal(operationSatisfied("verify_rewind", ["inspect_space", "verify_rewind"]), true);
assert.equal(operationSatisfied("verify_rewind", ["get_rewind_status"]), false);

const compareText = renderCompareResult({
  checkpoint,
  match: { percentage: 25, restored: false, matched: 2, unresolved: 6, unknown: 0, total: 8 },
  changeCount: 1,
  changes: [{
    type: "MOVED",
    entity: "chair.main",
    category: "chair",
    reason: "Expected BEHIND desk.main but found LEFT_OF desk.main.",
    confidence: 0.96,
  }],
});
assert.match(compareText, /25% match/);
assert.doesNotMatch(compareText, /RESTORED/);

const guidingText = renderRewindResult({
  rewindSessionId: "rewind-1",
  checkpoint,
  state: "GUIDING",
  match: { percentage: 63, restored: false, matched: 5, unresolved: 3, unknown: 0, total: 8 },
  plan: {
    actions: [{
      id: "action-1",
      entityKeys: ["lamp.left"],
      instruction: "Turn on lamp left",
      verificationHint: "Confirm lamp left is powered on.",
      confidence: 0.96,
      sourceTypes: ["ATTRIBUTE_CHANGED"],
      status: "PENDING",
    }],
    blockedUnknowns: [],
  },
  changeCount: 3,
  changes: [],
}, "verify_rewind");
assert.match(guidingText, /63% match/);
assert.doesNotMatch(guidingText, /RESTORED/);

const restoredText = renderRewindResult({
  rewindSessionId: "rewind-1",
  checkpoint,
  state: "RESTORED",
  match: { percentage: 100, restored: true, matched: 8, unresolved: 0, unknown: 0, total: 8 },
  plan: { actions: [], blockedUnknowns: [] },
  changeCount: 0,
  changes: [],
}, "verify_rewind");
assert.match(restoredText, /RESTORED — 100%/);

console.log("Phase 8 critical-intent truth guard passed.");
