import assert from "node:assert/strict";
import { AgentCoreSessionContinuityStore } from "../src/agentcore-memory.js";

const memoryId = process.env.REWIND_AGENTCORE_MEMORY_ID?.trim();
if (!memoryId) {
  console.error("REWIND_AGENTCORE_MEMORY_ID is required.");
  process.exit(2);
}

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const actorId = process.env.REWIND_AGENT_ACTOR_ID?.trim() || "rewind-agentcore-smoke";
const sessionId = process.env.REWIND_AGENT_SESSION_ID?.trim() || `smoke-${Date.now()}`;
const now = new Date().toISOString();

const writer = new AgentCoreSessionContinuityStore({ memoryId, region });
await writer.saveContext({
  actorId,
  sessionId,
  activeSpaceId: "studio",
  activeCheckpointId: "smoke-checkpoint",
  activeCheckpointName: "Demo Ready",
  lastDeterministicState: "DIFF_READY",
  updatedAt: now,
});
await writer.appendTurn(actorId, sessionId, {
  role: "user",
  text: "AgentCore smoke user turn",
  createdAt: now,
});
await writer.appendTurn(actorId, sessionId, {
  role: "assistant",
  text: "AgentCore smoke assistant turn",
  createdAt: new Date(Date.now() + 1).toISOString(),
});

// Construct a fresh adapter instance so the read cannot come from local process memory.
const reader = new AgentCoreSessionContinuityStore({ memoryId, region });
let loadedContext;
let loadedTurns;
for (let attempt = 0; attempt < 12; attempt += 1) {
  loadedContext = await reader.loadContext(actorId, sessionId);
  loadedTurns = await reader.loadTurns(actorId, sessionId, 10);
  if (loadedContext.activeCheckpointName === "Demo Ready" && loadedTurns.length >= 2) break;
  await new Promise(resolve => setTimeout(resolve, 500));
}

assert.equal(loadedContext?.activeSpaceId, "studio");
assert.equal(loadedContext?.activeCheckpointId, "smoke-checkpoint");
assert.equal(loadedContext?.activeCheckpointName, "Demo Ready");
assert.equal(loadedContext?.lastDeterministicState, "DIFF_READY");
assert(loadedTurns && loadedTurns.some(turn => turn.role === "user" && turn.text === "AgentCore smoke user turn"));
assert(loadedTurns && loadedTurns.some(turn => turn.role === "assistant" && turn.text === "AgentCore smoke assistant turn"));

console.log("PASS AgentCore live continuity: remote context + conversation events survived a fresh store instance.");
console.log(`Memory: ${memoryId}`);
console.log(`Actor: ${actorId}`);
console.log(`Session: ${sessionId}`);
