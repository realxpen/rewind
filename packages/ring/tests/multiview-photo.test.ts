import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { createPreviewServer } from "../src/preview-server.js";
import type { Checkpoint } from "../../checkpoints/src/contracts.js";
import type { PhysicalState } from "../../physical-state-protocol/src/index.js";
import type { VisionObservationRequest } from "../../vision/src/contracts.js";

const spaceId = "multiview-room";
const primaryState: PhysicalState = {
  schemaVersion: "0.1",
  spaceId,
  capturedAt: "2026-09-18T10:00:00.000Z",
  entities: [
    { key: "sofa.main", category: "sofa", confidence: 0.98, role: "ANCHOR" },
    { key: "table.coffee", category: "table", confidence: 0.97, role: "SURFACE" },
  ],
};
const deskState: PhysicalState = {
  schemaVersion: "0.1",
  spaceId,
  capturedAt: "2026-09-18T10:01:00.000Z",
  entities: [
    { key: "desk.main", category: "desk", confidence: 0.99, role: "ANCHOR" },
    { key: "chair.desk", category: "chair", confidence: 0.96, role: "MOVABLE" },
    { key: "monitor.main", category: "monitor", confidence: 0.95, importance: "critical" },
  ],
};
const openDeskScan: PhysicalState = {
  schemaVersion: "0.1",
  spaceId,
  capturedAt: "2026-09-18T10:10:00.000Z",
  entities: [
    { key: "desk.main", category: "desk", confidence: 0.96 },
    { key: "chair.desk", category: "chair", confidence: 0.94 },
    { key: "cup.extra", category: "cup", confidence: 0.9 },
  ],
};
const trackedDeskState: PhysicalState = {
  ...deskState,
  capturedAt: "2026-09-18T10:10:00.000Z",
};

const primaryImage = Buffer.from([255, 216, 1, 1, 1, 255, 217]);
const deskImage = Buffer.from([255, 216, 2, 2, 2, 255, 217]);
const changedDeskImage = Buffer.from([255, 216, 3, 3, 3, 255, 217]);
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

const checkpoint: Checkpoint = {
  id: "checkpoint-multiview",
  spaceId,
  name: "Whole room",
  observationId: "obs-primary",
  state: primaryState,
  stateHash: "primary-state-hash",
  sourceImageHash: hash(primaryImage),
  createdAt: "2026-09-18T10:00:00.000Z",
  views: [
    {
      id: "primary",
      observationId: "obs-primary",
      state: primaryState,
      stateHash: "primary-state-hash",
      sourceImageHash: hash(primaryImage),
      createdAt: "2026-09-18T10:00:00.000Z",
    },
    {
      id: "desk-angle",
      observationId: "obs-desk",
      state: deskState,
      stateHash: "desk-state-hash",
      sourceImageHash: hash(deskImage),
      createdAt: "2026-09-18T10:01:00.000Z",
    },
  ],
};

let preScanCalls = 0;
let trackedCalls = 0;
let trackedRequest: VisionObservationRequest | undefined;

const preview = createPreviewServer({
  devices: async () => [],
  start: async () => { throw new Error("not used"); },
  stop: async () => {},
  observeUnpublished: async () => {
    preScanCalls += 1;
    return { state: structuredClone(openDeskScan), rawText: "open", modelId: "unit-open", latencyMs: 2 };
  },
  observe: async request => {
    trackedCalls += 1;
    trackedRequest = request;
    return { state: structuredClone(trackedDeskState), rawText: "tracked", modelId: "unit-tracked", latencyMs: 3 };
  },
  listCheckpoints: async () => [checkpoint],
  getCheckpoint: async (requestedSpaceId, checkpointId) =>
    requestedSpaceId === spaceId && checkpointId === checkpoint.id ? checkpoint : undefined,
}, { html: "<!doctype html><title>REWIND</title>", js: "/* preview */" });

preview.server.listen(0, "127.0.0.1");
await once(preview.server, "listening");
const address = preview.server.address();
assert(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
const post = async (path: string, data: unknown) => {
  const response = await fetch(`${base}/api/${path}`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return { response, result };
};

try {
  const summaryResponse = await fetch(`${base}/api/checkpoints?spaceId=${spaceId}`, {
    headers: { Origin: base },
  });
  const summaries = await summaryResponse.json();
  assert.equal(summaryResponse.status, 200);
  assert.equal(summaries[0].viewCount, 2);

  const selected = await post("observe", {
    image: changedDeskImage.toString("base64"),
    spaceId,
    capturedAt: "2026-09-18T10:10:00.000Z",
    checkpointId: checkpoint.id,
  });
  assert.equal(selected.response.status, 200);
  assert.equal(selected.result.observationBasis, "nova-tracked");
  assert.equal(selected.result.checkpointViewId, "desk-angle");
  assert(selected.result.viewSelectionScore > 0);
  assert.equal(preScanCalls, 1);
  assert.equal(trackedCalls, 1);
  assert.deepEqual(
    trackedRequest?.context.trackedEntities?.map(entity => entity.key),
    ["desk.main", "chair.desk", "monitor.main"],
    "Second tracked pass must use the selected semantic view rather than the primary checkpoint view.",
  );

  const diff = await post("diff", {
    spaceId,
    observationId: selected.result.observationId,
    checkpointId: checkpoint.id,
  });
  assert.equal(diff.response.status, 200);
  assert.equal(diff.result.checkpointViewId, "desk-angle");
  assert.equal(diff.result.match.restored, true);
  assert.equal(diff.result.match.percentage, 100);

  const exactSecondView = await post("observe", {
    image: deskImage.toString("base64"),
    spaceId,
    capturedAt: "2026-09-18T10:11:00.000Z",
    checkpointId: checkpoint.id,
  });
  assert.equal(exactSecondView.response.status, 200);
  assert.equal(exactSecondView.result.exactImageMatch, true);
  assert.equal(exactSecondView.result.checkpointViewId, "desk-angle");
  assert.equal(preScanCalls, 1, "Exact match against any stored view must bypass the view-selection scan.");
  assert.equal(trackedCalls, 1, "Exact match against any stored view must bypass Nova.");

  console.log("PASS multi-view photo: semantic pre-scan selects the best view; diff and exact-image verification use that view");
} finally {
  preview.server.close();
  preview.server.closeAllConnections();
}
