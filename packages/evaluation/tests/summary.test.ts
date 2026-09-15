import assert from "node:assert/strict";
import { summarizeEvaluation, type EvaluationTrial } from "../src/summary.js";

const trials: EvaluationTrial[] = [
  {
    id: "trial-1",
    recordedAt: "2026-09-15T10:00:00.000Z",
    source: "controlled-demo",
    outcome: "PASS",
    expectedObjects: 8,
    correctObjects: 8,
    expectedDiffs: 6,
    correctDiffs: 6,
    latencyMs: 1200,
    novaFailures: 0,
    ringFailures: 0,
    toolFailures: 0,
    verificationFailures: 0,
    verificationRestored: true,
  },
  {
    id: "trial-2",
    recordedAt: "2026-09-15T10:05:00.000Z",
    source: "live-ring",
    outcome: "FAIL",
    expectedObjects: 4,
    correctObjects: 3,
    expectedDiffs: 2,
    correctDiffs: 1,
    latencyMs: 2800,
    novaFailures: 1,
    ringFailures: 0,
    toolFailures: 0,
    verificationFailures: 1,
    verificationRestored: false,
  },
];

const summary = summarizeEvaluation(trials);
assert.equal(summary.trials, 2);
assert.equal(summary.passes, 1);
assert.equal(summary.passRate, 0.5);
assert.equal(summary.liveRingTrials, 1);
assert.equal(summary.controlledDemoTrials, 1);
assert.equal(summary.objectAccuracy, 11 / 12);
assert.equal(summary.diffAccuracy, 7 / 8);
assert.equal(summary.averageLatencyMs, 2000);
assert.equal(summary.verificationSuccessRate, 0.5);
assert.equal(summary.novaFailures, 1);
assert.equal(summary.ringFailures, 0);
assert.equal(summary.toolFailures, 0);
assert.equal(summary.verificationFailures, 1);

console.log("PASS Phase 11 evaluation summary: accuracy + latency + failure aggregation");
