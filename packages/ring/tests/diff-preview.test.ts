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
  listCheckpoints: async spaceId => spaceId === "studio" ? [checkpoint] : [],
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

  const diffResponse = await post("diff", {
    spaceId: "studio",
    observationId: observation.observationId,
    checkpointId: checkpoint.id,
  });
  assert.equal(diffResponse.status, 200);
  const result = await diffResponse.json() as {
    checkpoint: { name: string };
    changeCount: number;
    match: { restored: boolean; percentage: number };
    changes: Array<{ type: string; entity: string }>;
  };

  assert.equal(result.checkpoint.name, "Demo Ready");
  assert.equal(result.changeCount, 6);
  assert.equal(result.match.restored, false);
  assert(result.match.percentage < 100);
  assert.deepEqual(result.changes.map(change => `${change.entity}:${change.type}`).sort(), [
    "backpack.black:MOVED",
    "chair.main:MOVED",
    "desk.main:ATTRIBUTE_CHANGED",
    "headphones.main:MOVED",
    "lamp.left:ATTRIBUTE_CHANGED",
    "tripod.camera:REMOVED",
  ].sort());

  const missing = await post("diff", {
    spaceId: "studio",
    observationId: observation.observationId,
    checkpointId: "missing-checkpoint",
  });
  assert.equal(missing.status, 404);

  const staleObservation = await post("diff", {
    spaceId: "studio",
    observationId: "missing-observation",
    checkpointId: checkpoint.id,
  });
  assert.equal(staleObservation.status, 400);

  console.log("PASS Phase 5 diff preview: checkpoint + current observation -> six semantic changes + no false RESTORED");
} finally {
  preview.server.close();
  preview.server.closeAllConnections();
}
