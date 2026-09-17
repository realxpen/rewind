import assert from "node:assert/strict";
import { once } from "node:events";
import { createPreviewServer } from "../src/preview-server.js";
import type { Checkpoint, SaveCheckpointInput } from "../../checkpoints/src/contracts.js";
import type { VisionObservationRequest } from "../../vision/src/contracts.js";
import type { PhysicalState } from "../../physical-state-protocol/src/index.js";

const spaceId = "phone-reliability-room";
const capturedAt = "2026-09-17T12:00:00.000Z";
const referenceState: PhysicalState = {
  schemaVersion: "0.1",
  spaceId,
  capturedAt,
  entities: [
    { key: "desk.main", category: "desk", confidence: 0.98 },
    {
      key: "chair.main",
      category: "chair",
      confidence: 0.97,
      relations: [{ type: "LEFT_OF", target: "desk.main", confidence: 0.95 }],
    },
  ],
};
const changedState: PhysicalState = {
  ...referenceState,
  capturedAt: "2026-09-17T12:05:00.000Z",
  entities: [
    { key: "desk.main", category: "desk", confidence: 0.98 },
    {
      key: "chair.main",
      category: "chair",
      confidence: 0.97,
      relations: [{ type: "RIGHT_OF", target: "desk.main", confidence: 0.95 }],
    },
  ],
};

let checkpoint: Checkpoint | undefined;
let observeCalls = 0;
let latestTrackedRequest: VisionObservationRequest | undefined;

const preview = createPreviewServer({
  devices: async () => [],
  start: async () => { throw new Error("not used"); },
  stop: async () => {},
  observe: async request => {
    observeCalls += 1;
    if (request.context.trackedEntities?.length) latestTrackedRequest = request;
    return {
      state: observeCalls === 1 ? structuredClone(referenceState) : structuredClone(changedState),
      rawText: "unit",
      modelId: "unit-nova",
      latencyMs: 5,
    };
  },
  saveCheckpoint: async (input: SaveCheckpointInput) => {
    checkpoint = {
      id: "checkpoint-clean",
      spaceId: input.spaceId,
      name: input.name,
      observationId: input.observationId,
      state: structuredClone(input.state),
      stateHash: "unit-state-hash",
      ...(input.sourceImageHash ? { sourceImageHash: input.sourceImageHash } : {}),
      createdAt: new Date(0).toISOString(),
    };
    return checkpoint;
  },
  listCheckpoints: async () => checkpoint ? [checkpoint] : [],
  getCheckpoint: async (requestedSpaceId, checkpointId) =>
    checkpoint && requestedSpaceId === spaceId && checkpointId === checkpoint.id ? checkpoint : undefined,
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

const referenceImage = Buffer.from([255, 216, 1, 2, 3, 255, 217]).toString("base64");
const changedImage = Buffer.from([255, 216, 9, 8, 7, 255, 217]).toString("base64");

try {
  const first = await post("observe", { image: referenceImage, spaceId, capturedAt });
  assert.equal(first.response.status, 200);
  assert.equal(first.result.exactImageMatch, false);
  assert.equal(first.result.observationBasis, "nova-open");
  assert.equal(observeCalls, 1);

  const saved = await post("checkpoints", {
    spaceId,
    name: "Clean Setup",
    observationId: first.result.observationId,
  });
  assert.equal(saved.response.status, 201);
  assert.equal(saved.result.exactImageVerificationAvailable, true);
  assert(checkpoint?.sourceImageHash, "Photo checkpoints must persist a non-reversible image fingerprint.");

  const same = await post("observe", {
    image: referenceImage,
    spaceId,
    capturedAt: "2026-09-17T12:01:00.000Z",
    checkpointId: checkpoint.id,
  });
  assert.equal(same.response.status, 200);
  assert.equal(same.result.exactImageMatch, true);
  assert.equal(same.result.observationBasis, "exact-image");
  assert.equal(same.result.modelId, "rewind-exact-image-match");
  assert.equal(observeCalls, 1, "Exact re-upload must bypass Nova rather than generating a random second interpretation.");

  const sameDiff = await post("diff", {
    spaceId,
    observationId: same.result.observationId,
    checkpointId: checkpoint.id,
  });
  assert.equal(sameDiff.response.status, 200);
  assert.equal(sameDiff.result.match.percentage, 100);
  assert.equal(sameDiff.result.match.coveragePercentage, 100);
  assert.equal(sameDiff.result.match.restored, true);
  assert.equal(sameDiff.result.changeCount, 0);

  const changed = await post("observe", {
    image: changedImage,
    spaceId,
    capturedAt: "2026-09-17T12:05:00.000Z",
    checkpointId: checkpoint.id,
  });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.result.exactImageMatch, false);
  assert.equal(changed.result.observationBasis, "nova-tracked");
  assert.equal(observeCalls, 2);
  assert.deepEqual(
    latestTrackedRequest?.context.trackedEntities?.map(entity => entity.key),
    referenceState.entities.map(entity => entity.key),
  );
  assert.deepEqual(
    latestTrackedRequest?.context.trackedEntities?.find(entity => entity.key === "chair.main")?.observableRelations?.map(relation => [relation.type, relation.target]),
    [["LEFT_OF", "desk.main"]],
    "Tracked photo comparison must ask Nova to explicitly re-check the checkpoint relation.",
  );

  const changedDiff = await post("diff", {
    spaceId,
    observationId: changed.result.observationId,
    checkpointId: checkpoint.id,
  });
  assert.equal(changedDiff.response.status, 200);
  assert.equal(changedDiff.result.match.restored, false);
  assert(changedDiff.result.changes.some((change: { entity: string; type: string }) => change.entity === "chair.main" && change.type === "MOVED"));

  console.log("PASS photo reliability: exact re-upload = deterministic 100%; fresh tracked photo rechecks relations; explicit physical contradiction = real diff");
} finally {
  preview.server.close();
  preview.server.closeAllConnections();
}
