import type { CheckpointService } from "../../checkpoints/src/service.js";
import {
  RewindAgentToolService,
  type AgentCheckpointAccess,
  type AgentObservation,
  type SpaceObserver,
} from "../../agent-tools/src/index.js";
import {
  AgentCoreSessionContinuityStore,
  InMemorySessionContinuityStore,
  RewindAgentOrchestrator,
  type RewindAgentInvocationResult,
  type SessionContinuityStore,
} from "../../agent-orchestrator/src/index.js";
import type { PhysicalState } from "../../physical-state-protocol/src/index.js";

export interface LiveRingAgentObservation {
  observationId: string;
  spaceId: string;
  state: PhysicalState;
  modelId?: string;
  latencyMs?: number;
}

export interface LiveRingAgentInput extends LiveRingAgentObservation {
  prompt: string;
}

export interface LiveRingAgentOptions {
  checkpoints: CheckpointService;
  region?: string;
  modelId?: string;
  memoryId?: string;
  actorId?: string;
  sessionId?: string;
}

export interface LiveRingAgentRuntime {
  usingAgentCore: boolean;
  actorId: string;
  sessionId: string;
  invoke(input: LiveRingAgentInput): Promise<RewindAgentInvocationResult>;
}

/**
 * Bridges trusted Ring/Nova observations into the Phase 8 agent boundary.
 *
 * The browser never submits semantic state to Strands. preview-server resolves an
 * observationId that it created after Nova validation, then hands that trusted
 * state to this runtime. RewindAgentToolService remains the only tool authority.
 */
export function createLiveRingAgentRuntime(options: LiveRingAgentOptions): LiveRingAgentRuntime {
  const latest = new Map<string, AgentObservation>();

  const observer: SpaceObserver = {
    async inspect(spaceId) {
      const observation = latest.get(spaceId);
      if (!observation) {
        throw new Error("No fresh trusted Ring observation is available for this space.");
      }
      return structuredClone(observation);
    },
  };

  const checkpointAccess: AgentCheckpointAccess = {
    save: input => options.checkpoints.save(input),
    list: spaceId => options.checkpoints.list(spaceId),
    get: (spaceId, checkpointId) => options.checkpoints.get(spaceId, checkpointId),
  };

  const memoryId = options.memoryId?.trim();
  const continuity: SessionContinuityStore = memoryId
    ? new AgentCoreSessionContinuityStore({
        memoryId,
        region: options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
      })
    : new InMemorySessionContinuityStore();

  const toolService = new RewindAgentToolService(observer, checkpointAccess);
  const actorId = options.actorId ?? process.env.REWIND_AGENT_ACTOR_ID ?? "rewind-demo-user";
  const sessionId = options.sessionId ?? process.env.REWIND_AGENT_SESSION_ID ?? "rewind-ring-live";

  return {
    usingAgentCore: Boolean(memoryId),
    actorId,
    sessionId,
    async invoke(input) {
      if (input.state.spaceId !== input.spaceId) {
        throw new Error("Trusted observation does not belong to the requested space.");
      }

      const observation: AgentObservation = {
        observationId: input.observationId,
        state: structuredClone(input.state),
      };
      if (input.modelId !== undefined) observation.modelId = input.modelId;
      if (input.latencyMs !== undefined) observation.latencyMs = input.latencyMs;
      latest.set(input.spaceId, observation);

      const orchestrator = new RewindAgentOrchestrator({
        toolService,
        continuity,
        region: options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
        modelId: options.modelId ?? process.env.REWIND_AGENT_MODEL_ID ?? "global.amazon.nova-2-lite-v1:0",
        defaultSpaceId: input.spaceId,
      });

      return orchestrator.invoke({ actorId, sessionId, prompt: input.prompt });
    },
  };
}
