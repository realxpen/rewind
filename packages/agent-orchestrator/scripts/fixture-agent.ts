import { buildCheckpoint } from "../../checkpoints/src/service.js";
import type { Checkpoint, SaveCheckpointInput } from "../../checkpoints/src/contracts.js";
import { demoReady, messy, partial, restored } from "../../physical-state-protocol/fixtures/studio.js";
import {
  RewindAgentToolService,
  type AgentCheckpointAccess,
  type SpaceObserver,
} from "../../agent-tools/src/index.js";
import {
  AgentCoreSessionContinuityStore,
  InMemorySessionContinuityStore,
  RewindAgentOrchestrator,
  type SessionContinuityStore,
} from "../src/index.js";

const prompt = process.argv.slice(2).join(" ").trim();
if (!prompt) {
  console.error('Usage: npm run agent:fixture -- "Inspect my studio"');
  process.exit(2);
}

const states = [demoReady, messy, partial, restored];
let stateIndex = Number.parseInt(process.env.REWIND_FIXTURE_STATE_INDEX ?? "0", 10);
if (!Number.isInteger(stateIndex) || stateIndex < 0 || stateIndex >= states.length) stateIndex = 0;

const observer: SpaceObserver = {
  async inspect(spaceId) {
    const state = states[stateIndex]!;
    return {
      observationId: `fixture-${stateIndex}-${Date.now()}`,
      state: {
        ...structuredClone(state),
        spaceId,
        capturedAt: new Date().toISOString(),
      },
      modelId: "phase8-fixture",
      latencyMs: 0,
    };
  },
};

const rows: Checkpoint[] = [];
const checkpoints: AgentCheckpointAccess = {
  async save(input: SaveCheckpointInput) {
    const checkpoint = buildCheckpoint(input);
    rows.push(checkpoint);
    return checkpoint;
  },
  async list(spaceId) {
    return rows.filter(row => row.spaceId === spaceId);
  },
  async get(spaceId, checkpointId) {
    return rows.find(row => row.spaceId === spaceId && row.id === checkpointId);
  },
};

function continuityStore(): SessionContinuityStore {
  const memoryId = process.env.REWIND_AGENTCORE_MEMORY_ID?.trim();
  if (!memoryId) {
    console.warn("REWIND_AGENTCORE_MEMORY_ID is not set; using in-memory continuity for this process.");
    return new InMemorySessionContinuityStore();
  }
  return new AgentCoreSessionContinuityStore({
    memoryId,
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
  });
}

const service = new RewindAgentToolService(observer, checkpoints);
const orchestrator = new RewindAgentOrchestrator({
  toolService: service,
  continuity: continuityStore(),
  region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
  modelId: process.env.REWIND_AGENT_MODEL_ID ?? "global.amazon.nova-2-lite-v1:0",
});

const result = await orchestrator.invoke({
  actorId: process.env.REWIND_AGENT_ACTOR_ID ?? "rewind-demo-user",
  sessionId: process.env.REWIND_AGENT_SESSION_ID ?? "rewind-demo-session",
  prompt,
});

console.log(result.text);
console.log("\nSession context:");
console.log(JSON.stringify(result.session, null, 2));
