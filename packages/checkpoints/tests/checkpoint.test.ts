import assert from "node:assert/strict";
import type { Checkpoint, CheckpointStore } from "../src/contracts.js";
import { CheckpointService, hashPhysicalState, summarizeCheckpoint } from "../src/service.js";

class MemoryStore implements CheckpointStore {
  private readonly items: Checkpoint[] = [];
  async save(checkpoint: Checkpoint) { this.items.push(checkpoint); }
  async list(spaceId: string) { return this.items.filter(item => item.spaceId === spaceId); }
  async get(spaceId: string, checkpointId: string) { return this.items.find(item => item.spaceId === spaceId && item.id === checkpointId); }
}

const state = {
  schemaVersion: "0.1" as const,
  spaceId: "studio",
  capturedAt: "2026-09-09T10:00:00.000Z",
  entities: [{ key: "chair.main", category: "chair", confidence: 0.95 }],
};

const service = new CheckpointService(new MemoryStore());
const checkpoint = await service.save({
  spaceId: "studio",
  name: "Demo Ready",
  observationId: "obs-1",
  state,
});

assert.equal(checkpoint.name, "Demo Ready");
assert.equal(checkpoint.stateHash, hashPhysicalState(state));
assert.equal((await service.list("studio")).length, 1);
assert.equal((await service.get("studio", checkpoint.id))?.id, checkpoint.id);
assert.equal(summarizeCheckpoint(checkpoint).entityCount, 1);
await assert.rejects(() => service.save({ ...checkpoint, name: "<>" }));

console.log("PASS checkpoints: save + list + get + stable state hash");
