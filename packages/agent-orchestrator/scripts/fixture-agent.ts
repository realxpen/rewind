import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
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

const states = [demoReady, messy, partial, restored];
const sceneNames = ["Demo Ready", "Messy", "Partial", "Restored"] as const;
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
  console.log("AgentCore Memory continuity enabled.");
  return new AgentCoreSessionContinuityStore({
    memoryId,
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
  });
}

const actorId = process.env.REWIND_AGENT_ACTOR_ID ?? "rewind-demo-user";
const sessionId = process.env.REWIND_AGENT_SESSION_ID ?? "rewind-demo-session";
const defaultSpaceId = process.env.REWIND_DEFAULT_SPACE_ID ?? "studio";
const service = new RewindAgentToolService(observer, checkpoints);
const orchestrator = new RewindAgentOrchestrator({
  toolService: service,
  continuity: continuityStore(),
  region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
  modelId: process.env.REWIND_AGENT_MODEL_ID ?? "global.amazon.nova-2-lite-v1:0",
  defaultSpaceId,
});

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  const normalized = message.toLowerCase();
  const authFailure = normalized.includes("session has expired")
    || normalized.includes("expiredtoken")
    || normalized.includes("token has expired")
    || normalized.includes("reauthenticate")
    || normalized.includes("credential") && normalized.includes("expired");

  if (!authFailure) return message;

  const profile = process.env.AWS_PROFILE?.trim() || "rewind-dev";
  return [
    "AWS session expired before Strands could call Nova 2 Lite.",
    `Reauthenticate in another terminal with: aws login --profile ${profile}`,
    `Then verify it with: aws sts get-caller-identity --profile ${profile}`,
    `Before restarting the fixture, export AWS_PROFILE=${profile} AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 AWS_SDK_LOAD_CONFIG=1`,
  ].join("\n");
}

async function invoke(prompt: string): Promise<void> {
  const result = await orchestrator.invoke({ actorId, sessionId, prompt });
  console.log(`\nREWIND: ${result.text}\n`);
  console.log(`Session: ${result.session.activeSpaceId ?? "no-space"} · ${result.session.activeCheckpointName ?? "no-checkpoint"} · ${result.session.lastDeterministicState ?? "no-state"}`);
}

const oneShot = process.argv.slice(2).join(" ").trim();
if (oneShot) {
  await invoke(oneShot);
} else {
  console.log("REWIND Phase 8 conversational fixture");
  console.log("Natural language goes to Strands + Nova 2 Lite.");
  console.log(`Default REWIND space: ${defaultSpaceId}`);
  console.log("Fixture scene commands are local test controls, not agent tools:");
  console.log("  /scene 0  Demo Ready");
  console.log("  /scene 1  Messy");
  console.log("  /scene 2  Partial");
  console.log("  /scene 3  Restored");
  console.log("  /context  show current fixture scene");
  console.log("  /exit     quit\n");
  console.log(`Fixture scene: ${stateIndex} — ${sceneNames[stateIndex]}`);

  const terminal = createInterface({ input, output });
  try {
    while (true) {
      const line = (await terminal.question("You: ")).trim();
      if (!line) continue;
      if (line === "/exit" || line === "/quit") break;
      if (line === "/context") {
        console.log(`Fixture scene: ${stateIndex} — ${sceneNames[stateIndex]}`);
        continue;
      }
      const scene = line.match(/^\/scene\s+([0-3])$/);
      if (scene) {
        stateIndex = Number(scene[1]);
        console.log(`Fixture scene changed to ${stateIndex} — ${sceneNames[stateIndex]}`);
        continue;
      }
      try {
        await invoke(line);
      } catch (error) {
        console.error(`REWIND error: ${friendlyError(error)}`);
      }
    }
  } finally {
    terminal.close();
  }
}
