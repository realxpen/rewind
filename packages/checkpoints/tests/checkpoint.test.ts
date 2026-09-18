import assert from "node:assert/strict";
import type { Checkpoint, CheckpointStore } from "../src/contracts.js";
import {
  CheckpointService,
  checkpointViews,
  hashPhysicalState,
  summarizeCheckpoint,
} from "../src/service.js";

class MemoryStore implements CheckpointStore {
  private readonly items: Checkpoint[] = [];

  async save(checkpoint: Checkpoint) {
    this.items.push(structuredClone(checkpoint));
  }

  async update(checkpoint: Checkpoint) {
    const index = this.items.findIndex(item => item.spaceId === checkpoint.spaceId && item.id === checkpoint.id);
    if (index < 0) throw new Error("Checkpoint not found.");
    this.items[index] = structuredClone(checkpoint);
  }

  async list(spaceId: string) {
    return this.items.filter(item => item.spaceId === spaceId).map(item => structuredClone(item));
  }

  async get(spaceId: string, checkpointId: string) {
    const item = this.items.find(item => item.spaceId === spaceId && item.id === checkpointId);
    return item ? structuredClone(item) : undefined;
  }
}

const state = {
  schemaVersion: "0.1" as const,
  spaceId: "studio",
  capturedAt: "2026-09-09T10:00:00.000Z",
  entities: [{ key: "chair.main", category: "chair", confidence: 0.95 }],
};

const secondViewState = {
  schemaVersion: "0.1" as const,
  spaceId: "studio",
  capturedAt: "2026-09-09T10:05:00.000Z",
  entities: [
    { key: "chair.main", category: "chair", confidence: 0.96 },
    { key: "desk.main", category: "desk", confidence: 0.97 },
  ],
};

const store = new MemoryStore();
const service = new CheckpointService(store);
const sourceImageHash = "a".repeat(64);
const checkpoint = await service.save({
  spaceId: "studio",
  name: "Demo Ready",
  observationId: "obs-1",
  state,
  sourceImageHash,
});

assert.equal(checkpoint.name, "Demo Ready");
assert.equal(checkpoint.stateHash, hashPhysicalState(state));
assert.equal(checkpoint.sourceImageHash, sourceImageHash);
assert.equal(checkpoint.views?.length, 1);
assert.equal(checkpoint.views?.[0]?.id, "primary");
assert.equal(checkpointViews(checkpoint).length, 1);
assert.equal((await service.list("studio")).length, 1);
assert.equal((await service.get("studio", checkpoint.id))?.id, checkpoint.id);
assert.equal(summarizeCheckpoint(checkpoint).entityCount, 1);
assert.equal(summarizeCheckpoint(checkpoint).viewCount, 1);
assert.equal(summarizeCheckpoint(checkpoint).exactImageVerificationAvailable, true);

const secondImageHash = "b".repeat(64);
const multiview = await service.addView({
  spaceId: "studio",
  checkpointId: checkpoint.id,
  observationId: "obs-1b",
  state: secondViewState,
  sourceImageHash: secondImageHash,
});
assert.equal(multiview.views?.length, 2);
assert.equal(summarizeCheckpoint(multiview).viewCount, 2);
assert.equal((await service.get("studio", checkpoint.id))?.views?.length, 2);
assert.equal(multiview.views?.[1]?.stateHash, hashPhysicalState(secondViewState));

await assert.rejects(() => service.addView({
  spaceId: "studio",
  checkpointId: checkpoint.id,
  observationId: "obs-duplicate",
  state: secondViewState,
  sourceImageHash: secondImageHash,
}), /already been saved/i);

const controlled = await service.save({
  spaceId: "studio",
  name: "Demo Ready (Controlled)",
  observationId: "obs-2",
  state,
});
assert.equal(controlled.name, "Demo Ready (Controlled)");
assert.equal(summarizeCheckpoint(controlled).exactImageVerificationAvailable, false);
assert.equal(summarizeCheckpoint(controlled).viewCount, 1);
assert.equal((await service.list("studio")).length, 2);

const legacy: Checkpoint = {
  id: "legacy",
  spaceId: "studio",
  name: "Legacy",
  observationId: "legacy-obs",
  state,
  stateHash: hashPhysicalState(state),
  sourceImageHash,
  createdAt: "2026-09-01T00:00:00.000Z",
};
assert.equal(checkpointViews(legacy).length, 1);
assert.equal(checkpointViews(legacy)[0]?.id, "legacy-primary");
assert.equal(summarizeCheckpoint(legacy).viewCount, 1);
assert.equal(summarizeCheckpoint(legacy).exactImageVerificationAvailable, true);

await assert.rejects(() => service.save({ ...checkpoint, name: "<>" }));
await assert.rejects(() => service.save({
  spaceId: "studio",
  name: "Bad Fingerprint",
  observationId: "obs-3",
  state,
  sourceImageHash: "not-a-sha256",
}));

console.log("PASS checkpoints: backward-compatible save/list/get + multi-view semantic memory + photo fingerprints");
