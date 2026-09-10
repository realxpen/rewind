import assert from "node:assert/strict";
import type { Checkpoint, CheckpointStore } from "../../checkpoints/src/contracts.js";
import { CheckpointService } from "../../checkpoints/src/service.js";
import { demoReady, messy, partial, restored } from "../../physical-state-protocol/fixtures/studio.js";
import type { PhysicalState } from "../../physical-state-protocol/src/index.js";
import {
  AGENT_TOOL_SPECS,
  RewindAgentToolService,
  type AgentObservation,
  type SaveCheckpointToolInput,
  type SpaceObserver,
  type VerifyRewindToolInput,
} from "../src/index.js";

class MemoryCheckpointStore implements CheckpointStore {
  readonly records = new Map<string, Checkpoint>();

  private key(spaceId: string, checkpointId: string) {
    return `${spaceId}:${checkpointId}`;
  }

  async save(checkpoint: Checkpoint): Promise<void> {
    this.records.set(this.key(checkpoint.spaceId, checkpoint.id), structuredClone(checkpoint));
  }

  async list(spaceId: string): Promise<Checkpoint[]> {
    return [...this.records.values()]
      .filter((checkpoint) => checkpoint.spaceId === spaceId)
      .map((checkpoint) => structuredClone(checkpoint));
  }

  async get(spaceId: string, checkpointId: string): Promise<Checkpoint | undefined> {
    const checkpoint = this.records.get(this.key(spaceId, checkpointId));
    return checkpoint ? structuredClone(checkpoint) : undefined;
  }
}

class SequenceObserver implements SpaceObserver {
  private index = 0;

  constructor(private readonly states: PhysicalState[]) {
    if (states.length === 0) throw new Error("At least one observation state is required.");
  }

  async inspect(spaceId: string): Promise<AgentObservation> {
    const state = this.states[Math.min(this.index, this.states.length - 1)]!;
    this.index += 1;
    if (state.spaceId !== spaceId) throw new Error("Unexpected test space.");
    return {
      observationId: `observation-${this.index}`,
      state: structuredClone(state),
      modelId: "test-nova",
      latencyMs: 1,
    };
  }
}

for (const spec of AGENT_TOOL_SPECS) {
  assert.equal(spec.inputSchema.additionalProperties, false, `${spec.name} must reject undeclared model arguments`);
}
const saveSpec = AGENT_TOOL_SPECS.find((spec) => spec.name === "save_checkpoint")!;
assert(!("state" in saveSpec.inputSchema.properties), "agent must not provide checkpoint physical state");
const verifySpec = AGENT_TOOL_SPECS.find((spec) => spec.name === "verify_rewind")!;
assert(!("restored" in verifySpec.inputSchema.properties), "agent must not provide RESTORED truth");
assert(!("match" in verifySpec.inputSchema.properties), "agent must not provide match truth");

const store = new MemoryCheckpointStore();
const checkpoints = new CheckpointService(store);
const tools = new RewindAgentToolService(
  new SequenceObserver([demoReady, messy, partial, restored]),
  checkpoints,
);

const first = await tools.inspectSpace({ spaceId: "studio" });
assert.equal(first.entityCount, demoReady.entities.length);
assert(!("state" in first), "inspect output should expose a semantic summary, not mutable physical-state authority");

// Even if an untrusted caller attempts to smuggle state in at runtime, saveCheckpoint
// ignores it and persists only the latest trusted observation held by the service.
const saved = await tools.saveCheckpoint({
  spaceId: "studio",
  name: "Demo Ready",
  state: messy,
} as unknown as SaveCheckpointToolInput);
const persisted = await store.get("studio", saved.id);
assert(persisted);
assert.deepEqual(persisted.state, demoReady);

const listed = await tools.listCheckpoints({ spaceId: "studio" });
assert.equal(listed.length, 1);
assert.equal(listed[0]!.id, saved.id);

await tools.inspectSpace({ spaceId: "studio" });
const compared = await tools.compareCheckpoint({ spaceId: "studio", checkpointId: saved.id });
assert.equal(compared.match.restored, false);
assert(compared.changeCount > 0);

const started = await tools.startRewind({ spaceId: "studio", checkpointId: saved.id });
assert.equal(started.state, "GUIDING");
assert(started.plan.actions.length > 0);

// Returned plans are defensive copies; caller mutation cannot rewrite server truth.
started.plan.actions.length = 0;
const unchangedStatus = await tools.getRewindStatus({
  spaceId: "studio",
  rewindSessionId: started.rewindSessionId,
});
assert(unchangedStatus.plan.actions.length > 0);

const progressed = await tools.verifyRewind({
  spaceId: "studio",
  rewindSessionId: started.rewindSessionId,
});
assert.equal(progressed.state, "GUIDING");
assert(progressed.match.percentage > 0 && progressed.match.percentage < 100);
assert.equal(progressed.progress?.restored, false);

const completed = await tools.verifyRewind({
  spaceId: "studio",
  rewindSessionId: started.rewindSessionId,
});
assert.equal(completed.state, "RESTORED");
assert.equal(completed.match.percentage, 100);
assert.equal(completed.match.restored, true);
assert.equal(completed.progress?.restored, true);

// A model cannot force RESTORED by adding undeclared runtime properties.
const guardedStore = new MemoryCheckpointStore();
const guarded = new RewindAgentToolService(
  new SequenceObserver([demoReady, messy, messy]),
  new CheckpointService(guardedStore),
);
await guarded.inspectSpace({ spaceId: "studio" });
const guardedCheckpoint = await guarded.saveCheckpoint({ spaceId: "studio", name: "Guarded" });
await guarded.inspectSpace({ spaceId: "studio" });
const guardedStart = await guarded.startRewind({ spaceId: "studio", checkpointId: guardedCheckpoint.id });
const guardedResult = await guarded.verifyRewind({
  spaceId: "studio",
  rewindSessionId: guardedStart.rewindSessionId,
  restored: true,
  match: { percentage: 100, restored: true },
} as unknown as VerifyRewindToolInput);
assert.equal(guardedResult.match.restored, false);
assert.notEqual(guardedResult.state, "RESTORED");

const cancelled = await guarded.cancelRewind({
  spaceId: "studio",
  rewindSessionId: guardedStart.rewindSessionId,
});
assert.equal(cancelled.state, "CANCELLED");

console.log("Phase 8 agent tool trust-boundary test passed.");
