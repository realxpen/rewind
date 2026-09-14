import assert from "node:assert/strict";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildCheckpoint } from "../../checkpoints/src/service.js";
import type { Checkpoint, SaveCheckpointInput } from "../../checkpoints/src/contracts.js";
import { demoReady, messy, partial, restored } from "../../physical-state-protocol/fixtures/studio.js";
import { RewindAgentToolService, type AgentCheckpointAccess } from "../../agent-tools/src/index.js";
import { InMemorySessionContinuityStore } from "../../agent-orchestrator/src/index.js";
import { RingObservationBridge } from "../../ring/src/observation-bridge.js";
import { createRewindMcpHttpApp } from "../src/http.js";

const stored: Checkpoint[] = [];
const checkpoints: AgentCheckpointAccess = {
  async save(input: SaveCheckpointInput) {
    const checkpoint = buildCheckpoint(input);
    stored.push(checkpoint);
    return checkpoint;
  },
  async list(spaceId: string) {
    return stored.filter(row => row.spaceId === spaceId);
  },
  async get(spaceId: string, checkpointId: string) {
    return stored.find(row => row.spaceId === spaceId && row.id === checkpointId);
  },
};

const bridge = new RingObservationBridge(3_000);
const toolService = new RewindAgentToolService(bridge, checkpoints);
const app = createRewindMcpHttpApp({
  toolService,
  continuity: new InMemorySessionContinuityStore(),
  actorId: "phase9-live-ring-user",
  sessionId: "phase9-live-ring-session",
  defaultSpaceId: "studio",
});

const http = app.listen(0, "127.0.0.1");
await once(http, "listening");
const address = http.address();
assert(address && typeof address === "object");

const client = new Client({ name: "rewind-live-ring-bridge-gate", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`));
const sequence = [demoReady, messy, messy, partial, restored];
let index = 0;

async function answerFreshObservation(): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!bridge.pendingRequest("studio")) {
    if (Date.now() > deadline) throw new Error("MCP tool did not request a fresh Ring observation.");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  const state = sequence[index];
  assert(state, `Missing fixture observation ${index}.`);
  index += 1;
  bridge.publish({
    observationId: `ring-nova-${index}`,
    spaceId: "studio",
    state: structuredClone(state),
    modelId: "amazon.nova-2-lite-v1:0",
    receivedAt: Date.now(),
  });
}

async function callWithFreshObservation(name: string, args: Record<string, unknown>) {
  const call = client.callTool({ name, arguments: args });
  await answerFreshObservation();
  return call;
}

try {
  await client.connect(transport as any);

  const saved = await callWithFreshObservation("save_checkpoint", { name: "Demo Ready", spaceId: "studio" });
  assert.equal(saved.isError, undefined);
  const savedBody = saved.structuredContent as Record<string, unknown>;
  assert.equal(savedBody.name, "Demo Ready");

  const compared = await callWithFreshObservation("compare_checkpoint", { spaceId: "studio", checkpointId: savedBody.id });
  const compareBody = compared.structuredContent as Record<string, unknown>;
  const compareMatch = compareBody.match as Record<string, unknown>;
  assert.equal(compareMatch.restored, false);
  assert(Number(compareMatch.percentage) < 100);

  const started = await callWithFreshObservation("start_rewind", { spaceId: "studio", checkpointId: savedBody.id });
  const startBody = started.structuredContent as Record<string, unknown>;
  assert.equal(startBody.state, "GUIDING");
  assert.equal(typeof startBody.rewindSessionId, "string");

  const partialResult = await callWithFreshObservation("verify_rewind", { spaceId: "studio", rewindSessionId: startBody.rewindSessionId });
  const partialBody = partialResult.structuredContent as Record<string, unknown>;
  const partialMatch = partialBody.match as Record<string, unknown>;
  assert.equal(partialBody.state, "GUIDING");
  assert(Number(partialMatch.percentage) < 100);

  const restoredResult = await callWithFreshObservation("verify_rewind", { spaceId: "studio", rewindSessionId: startBody.rewindSessionId });
  const restoredBody = restoredResult.structuredContent as Record<string, unknown>;
  const restoredMatch = restoredBody.match as Record<string, unknown>;
  assert.equal(restoredBody.state, "RESTORED");
  assert.equal(restoredMatch.percentage, 100);
  assert.equal(restoredMatch.restored, true);
  assert.equal(index, 5);

  console.log("PASS Phase 9 live Ring bridge: every MCP state-changing/read-truth tool waited for a fresh observation and ended 100% RESTORED.");
} finally {
  bridge.cancelAll();
  await client.close();
  http.close();
  http.closeAllConnections();
}
