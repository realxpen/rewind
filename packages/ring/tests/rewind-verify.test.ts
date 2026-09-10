import assert from "node:assert/strict";
import { once } from "node:events";
import { createPreviewServer } from "../src/preview-server.js";
import { demoReady, messy, partial, restored } from "../../physical-state-protocol/fixtures/studio.js";
import type { PhysicalState } from "../../physical-state-protocol/src/index.js";
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

let currentState: PhysicalState = messy;
const preview = createPreviewServer({
  devices: async () => [],
  start: async () => { throw new Error("unused"); },
  stop: async () => {},
  observe: async request => ({
    state: { ...currentState, spaceId: request.context.spaceId, capturedAt: request.context.capturedAt },
    rawText: "private",
    modelId: "test-model",
    latencyMs: 1,
  }),
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
async function observe(capturedAt: string) {
  const response = await post("observe", {
    image: Buffer.from([255, 216, 255, 217]).toString("base64"),
    spaceId: "studio",
    capturedAt,
  });
  assert.equal(response.status, 200);
  return response.json() as Promise<{ observationId: string }>;
}

try {
  const first = await observe("2026-09-09T13:00:00.000Z");
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

  currentState = partial;
  const second = await observe("2026-09-09T13:05:00.000Z");
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

  currentState = restored;
  const third = await observe("2026-09-09T13:10:00.000Z");
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

  console.log("PASS Phase 6 REWIND verify: messy -> partial -> restored reaches deterministic 100% RESTORED");
} finally {
  preview.server.close();
  preview.server.closeAllConnections();
}
