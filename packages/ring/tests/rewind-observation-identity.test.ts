import assert from "node:assert/strict";
import { once } from "node:events";
import { createPreviewServer } from "../src/preview-server.js";
import type { VisionObservationRequest } from "../../vision/src/contracts.js";
import type { Checkpoint } from "../../checkpoints/src/contracts.js";
import { demoReady, messy } from "../../physical-state-protocol/fixtures/studio.js";

const spaceId = "identity-anchor-space";
const checkpoint: Checkpoint = {
  id: "checkpoint-clean",
  spaceId,
  name: "Clean Setup",
  observationId: "saved-observation",
  state: { ...structuredClone(demoReady), spaceId },
  stateHash: "unit-state-hash",
  createdAt: new Date(0).toISOString(),
};

let observedRequest: VisionObservationRequest | undefined;
const preview = createPreviewServer({
  devices: async () => [],
  start: async () => { throw new Error("not used"); },
  stop: async () => {},
  observe: async request => {
    observedRequest = request;
    return {
      state: { ...structuredClone(demoReady), spaceId: request.context.spaceId, capturedAt: request.context.capturedAt },
      rawText: "unit",
      modelId: "unit-model",
      latencyMs: 1,
    };
  },
  getCheckpoint: async (requestedSpaceId, checkpointId) =>
    requestedSpaceId === spaceId && checkpointId === checkpoint.id ? checkpoint : undefined,
}, { html: "<!doctype html><title>REWIND</title>", js: "/* preview */" });

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
  const currentResponse = await post("demo/observe", { scenario: "messy", spaceId });
  assert.equal(currentResponse.status, 200);
  const current = await currentResponse.json() as { observationId: string };

  const rewindResponse = await post("rewind", {
    spaceId,
    observationId: current.observationId,
    checkpointId: checkpoint.id,
  });
  assert.equal(rewindResponse.status, 200);

  const frame = Buffer.from([255, 216, 255, 217]).toString("base64");
  const observedResponse = await post("observe", {
    image: frame,
    spaceId,
    capturedAt: new Date().toISOString(),
  });
  assert.equal(observedResponse.status, 200);

  const tracked = observedRequest?.context.trackedEntities;
  assert(tracked && tracked.length > 0, "Active Rewind observations must receive checkpoint identity hints.");
  assert.deepEqual(
    tracked.map(entity => [entity.key, entity.category]),
    checkpoint.state.entities.map(entity => [entity.key, entity.category]),
  );

  for (const entity of tracked) {
    const saved = checkpoint.state.entities.find(candidate => candidate.key === entity.key);
    assert(saved);
    if (saved.attributes && Object.keys(saved.attributes).length > 0) {
      assert.deepEqual(Object.keys(entity.observableAttributes ?? {}).sort(), Object.keys(saved.attributes).sort());
    }
  }

  console.log("PASS active Rewind observation identity anchor: server-owned checkpoint keys are supplied to Nova");
} finally {
  preview.server.close();
  preview.server.closeAllConnections();
}
