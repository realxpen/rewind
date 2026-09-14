import { buildCheckpoint } from "../../checkpoints/src/service.js";
import type { Checkpoint, SaveCheckpointInput } from "../../checkpoints/src/contracts.js";
import {
  RewindAgentToolService,
  type AgentCheckpointAccess,
  type SpaceObserver,
} from "../../agent-tools/src/index.js";
import { demoReady, messy, partial, restored } from "../../physical-state-protocol/fixtures/studio.js";

export function createPhase9FixtureToolService(): RewindAgentToolService {
  const sequence = [demoReady, messy, messy, partial, restored];
  let observationIndex = 0;

  const observer: SpaceObserver = {
    async inspect(spaceId) {
      const state = sequence[Math.min(observationIndex, sequence.length - 1)]!;
      observationIndex += 1;
      return {
        observationId: `mcp-fixture-${observationIndex}`,
        state: {
          ...structuredClone(state),
          spaceId,
          capturedAt: new Date().toISOString(),
        },
        modelId: "phase9-mcp-fixture",
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

  return new RewindAgentToolService(observer, checkpoints);
}
