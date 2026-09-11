import assert from "node:assert/strict";
import { AgentCoreSessionContinuityStore } from "../src/agentcore-memory.js";

const events: Array<Record<string, unknown>> = [];
const fakeClient = {
  async send(command: unknown) {
    const input = (command as { input?: Record<string, unknown> }).input ?? {};
    if (Array.isArray(input.payload)) {
      assert.equal(input.extractionMode, "SKIP");
      events.push({
        eventTimestamp: input.eventTimestamp,
        payload: input.payload,
      });
      return { event: { eventId: `event-${events.length}` } };
    }
    return { events };
  },
};

const store = new AgentCoreSessionContinuityStore({
  memoryId: "RewindMemory-1234567890",
  region: "us-east-1",
  client: fakeClient,
});

const actorId = "demo-user";
const sessionId = "phase8-session";
await store.saveContext({
  actorId,
  sessionId,
  activeSpaceId: "studio",
  activeCheckpointId: "checkpoint-1",
  activeCheckpointName: "Demo Ready",
  activeRewindSessionId: "rewind-1",
  lastDeterministicState: "GUIDING",
  updatedAt: "2026-09-11T08:00:00.000Z",
});
await store.appendTurn(actorId, sessionId, {
  role: "user",
  text: "Rewind my studio",
  createdAt: "2026-09-11T08:01:00.000Z",
});
await store.appendTurn(actorId, sessionId, {
  role: "assistant",
  text: "Move the chair behind the desk.",
  createdAt: "2026-09-11T08:01:01.000Z",
});

const context = await store.loadContext(actorId, sessionId);
assert.equal(context.activeSpaceId, "studio");
assert.equal(context.activeCheckpointId, "checkpoint-1");
assert.equal(context.activeRewindSessionId, "rewind-1");
assert.equal(context.lastDeterministicState, "GUIDING");

const turns = await store.loadTurns(actorId, sessionId);
assert.deepEqual(turns.map(turn => [turn.role, turn.text]), [
  ["user", "Rewind my studio"],
  ["assistant", "Move the chair behind the desk."],
]);

assert.equal(events.length, 3);
console.log("AgentCore continuity adapter gate passed.");
