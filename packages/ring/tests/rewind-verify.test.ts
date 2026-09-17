import assert from "node:assert/strict";
import { once } from "node:events";
import { createPreviewServer } from "../src/preview-server.js";
import { demoReady } from "../../physical-state-protocol/fixtures/studio.js";
import type { Checkpoint } from "../../checkpoints/src/contracts.js";

const checkpoint: Checkpoint = {
  id: "checkpoint-demo-ready",
  spaceId: "studio",
  name: "Demo Ready",
  observationId: "saved-observation",
  state: demoReady,
  stateHash: "0123456789abcdef",
  createdAt: "2026-09-09T12:00:00.000Z",
};

const preview = createPreviewServer({
  devices: async () => [],
  start: async () => { throw new Error("unused"); },
  stop: async () => {},
  observe: async () => { throw new Error("Phase 6 deterministic fixture test must use controlled demo observation."); },
  getCheckpoint: async (spaceId, checkpointId) => spaceId === checkpoint.spaceId && checkpointId === checkpoint.id ? checkpoint : undefined,
}, { html: "<!doctype html><title>REWIND</title>", js: "" });

preview.server.listen(0, "127.0.0.1");
await once(preview.server, "listening");
const address = preview.server.address();
assert(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
const post = (path: string, data: unknown) => fetch(`${base}/api/${path}`, {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
async function observeScenario(scenario: "messy" | "partial" | "restored") {
  const response = await post("demo/observe", { scenario, spaceId: "studio" });
  assert.equal(response.status, 200);
  return response.json() as Promise<{ observationId: string; observationBasis: string }>;
}

try {
  const first = await observeScenario("messy");
  assert.equal(first.observationBasis, "controlled-demo");
  const start = await post("rewind", {
    spaceId: "studio",
    observationId: first.observationId,
    checkpointId: checkpoint.id,
  });
  assert.equal(start.status, 200);
  const started = await start.json() as {
    rewindSessionId: string;
    state: string;
    plan: { actions: Array<{ status: string }> };
  };
  assert.match(started.rewindSessionId, /^[0-9a-f-]{36}$/);
  assert.equal(started.state, "GUIDING");
  assert.equal(started.plan.actions.length, 6);
  assert(started.plan.actions.every(action => action.status === "PENDING"));

  const second = await observeScenario("partial");
  const progressResponse = await post("rewind/verify", {
    spaceId: "studio",
    observationId: second.observationId,
    rewindSessionId: started.rewindSessionId,
  });
  assert.equal(progressResponse.status, 200);
  const progressed = await progressResponse.json() as {
    state: string;
    progress: { percentage: number; restored: boolean; actions: Array<{ status: string }> };
  };
  assert.equal(progressed.state, "GUIDING");
  assert.equal(progressed.progress.restored, false);
  assert(progressed.progress.percentage > 0 && progressed.progress.percentage < 100);
  assert(progressed.progress.actions.some(action => action.status === "VERIFIED"));
  assert(progressed.progress.actions.some(action => action.status === "PENDING"));

  const third = await observeScenario("restored");
  const restoredResponse = await post("rewind/verify", {
    spaceId: "studio",
    observationId: third.observationId,
    rewindSessionId: started.rewindSessionId,
  });
  assert.equal(restoredResponse.status, 200);
  const final = await restoredResponse.json() as {
    state: string;
    match: { percentage: number; restored: boolean };
    progress: { percentage: number; remainingChanges: number; restored: boolean; actions: Array<{ status: string }> };
  };
  assert.equal(final.state, "RESTORED");
  assert.equal(final.match.percentage, 100);
  assert.equal(final.match.restored, true);
  assert.equal(final.progress.percentage, 100);
  assert.equal(final.progress.remainingChanges, 0);
  assert.equal(final.progress.restored, true);
  assert(final.progress.actions.every(action => action.status === "VERIFIED"));

  const missingSession = await post("rewind/verify", {
    spaceId: "studio",
    observationId: third.observationId,
    rewindSessionId: "missing-session",
  });
  assert.equal(missingSession.status, 404);

  console.log("PASS Phase 6 REWIND verify: controlled messy -> partial -> restored reaches deterministic 100% RESTORED");
} finally {
  preview.server.close();
  preview.server.closeAllConnections();
}
