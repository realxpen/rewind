import assert from "node:assert/strict";
import { buildCheckpoint } from "../../checkpoints/src/service.js";
import type { Checkpoint, SaveCheckpointInput } from "../../checkpoints/src/contracts.js";
import { demoReady, messy, partial, restored } from "../../physical-state-protocol/fixtures/studio.js";
import { RewindAgentToolService, type AgentCheckpointAccess, type SpaceObserver } from "../../agent-tools/src/index.js";
import { InMemorySessionContinuityStore } from "../src/session.js";
import { RewindToolController } from "../src/controller.js";

const stored: Checkpoint[] = [];
const checkpoints: AgentCheckpointAccess = {
  async save(input: SaveCheckpointInput) {
    const checkpoint = buildCheckpoint(input);
    stored.push(checkpoint);
    return checkpoint;
  },
  async list(spaceId: string) {
    return stored.filter(checkpoint => checkpoint.spaceId === spaceId);
  },
  async get(spaceId: string, checkpointId: string) {
    return stored.find(checkpoint => checkpoint.spaceId === spaceId && checkpoint.id === checkpointId);
  },
};

const sequence = [demoReady, messy, partial, restored];
let observationIndex = 0;
const observer: SpaceObserver = {
  async inspect(spaceId: string) {
    const state = sequence[Math.min(observationIndex, sequence.length - 1)]!;
    observationIndex += 1;
    return {
      observationId: `observation-${observationIndex}`,
      state: { ...state, spaceId },
    };
  },
};

const continuity = new InMemorySessionContinuityStore();
const service = new RewindAgentToolService(observer, checkpoints);
const actorId = "demo-user";
const sessionId = "phase8-continuity";

// A configured default space lets natural-language agents call inspect_space
// without exposing internal space identifiers to the user.
const first = await RewindToolController.create(service, continuity, actorId, sessionId, "studio");
const inspected = await first.inspectSpace({});
assert.equal(inspected.spaceId, "studio");
assert.equal(inspected.entityCount, demoReady.entities.length);
const saved = await first.saveCheckpoint({ name: "Demo Ready" });
assert.equal(saved.name, "Demo Ready");
assert.equal(first.snapshot().activeCheckpointId, saved.id);

// Recreate the controller to simulate a later invocation/process boundary.
const resumed = await RewindToolController.create(service, continuity, actorId, sessionId);
assert.equal(resumed.snapshot().activeSpaceId, "studio");
assert.equal(resumed.snapshot().activeCheckpointId, saved.id);

await resumed.inspectSpace({});
const compared = await resumed.compareCheckpoint({});
assert.equal(compared.match.restored, false);
assert(compared.changeCount > 0);

const started = await resumed.startRewind({});
assert.equal(started.state, "GUIDING");
assert.equal(started.match.restored, false);
assert(started.plan.actions.length > 0);
const rewindSessionId = started.rewindSessionId;

// Recreate again; the active Rewind session identifier comes from continuity,
// while the actual restore session/truth remains in the deterministic service.
const verifying = await RewindToolController.create(service, continuity, actorId, sessionId);
assert.equal(verifying.snapshot().activeRewindSessionId, rewindSessionId);

const progressed = await verifying.verifyRewind({});
assert.equal(progressed.state, "GUIDING");
assert.equal(progressed.match.restored, false);
assert(progressed.match.percentage > started.match.percentage);
assert(progressed.match.percentage < 100);

const finished = await verifying.verifyRewind({});
assert.equal(finished.state, "RESTORED");
assert.equal(finished.match.restored, true);
assert.equal(finished.match.percentage, 100);

const finalContext = await continuity.loadContext(actorId, sessionId);
assert.equal(finalContext.activeSpaceId, "studio");
assert.equal(finalContext.activeCheckpointId, saved.id);
assert.equal(finalContext.activeRewindSessionId, rewindSessionId);
assert.equal(finalContext.lastDeterministicState, "RESTORED");

console.log("Phase 8 continuity gate passed.");
