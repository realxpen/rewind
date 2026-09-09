import assert from "node:assert/strict";
import { once } from "node:events";
import { createPreviewServer } from "../src/preview-server.js";
import { demoReady, messy } from "../../physical-state-protocol/fixtures/studio.js";
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
  observe: async request => ({
    state: { ...messy, spaceId: request.context.spaceId, capturedAt: request.context.capturedAt },
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

try {
  const frame = {
    image: Buffer.from([255, 216, 255, 217]).toString("base64"),
    spaceId: "studio",
    capturedAt: "2026-09-09T13:00:00.000Z",
  };
  const observed = await post("observe", frame);
  assert.equal(observed.status, 200);
  const observation = await observed.json() as { observationId: string };

  const response = await post("rewind", {
    spaceId: "studio",
    observationId: observation.observationId,
    checkpointId: checkpoint.id,
  });
  assert.equal(response.status, 200);
  const result = await response.json() as {
    checkpoint: { name: string };
    state: string;
    match: { restored: boolean };
    plan: {
      actions: Array<{ instruction: string; sourceTypes: string[]; status: string }>;
      blockedUnknowns: string[];
    };
  };

  assert.equal(result.checkpoint.name, "Demo Ready");
  assert.equal(result.state, "GUIDING");
  assert.equal(result.match.restored, false);
  assert.equal(result.plan.actions.length, 6);
  assert.equal(result.plan.blockedUnknowns.length, 0);
  assert(result.plan.actions.every(action => action.status === "PENDING"));
  assert(result.plan.actions.every(action => action.instruction.length > 0));
  assert(result.plan.actions.some(action => action.sourceTypes.includes("REMOVED")));
  assert(result.plan.actions.some(action => action.sourceTypes.includes("ATTRIBUTE_CHANGED")));

  const missing = await post("rewind", {
    spaceId: "studio",
    observationId: observation.observationId,
    checkpointId: "missing-checkpoint",
  });
  assert.equal(missing.status, 404);

  console.log("PASS Phase 6 REWIND: changed scene -> deterministic human restoration plan with six pending actions");
} finally {
  preview.server.close();
  preview.server.closeAllConnections();
}
