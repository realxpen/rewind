import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { RewindToolController } from "./controller.js";

const spaceId = z.string().min(1).max(80).optional().describe("REWIND space ID. Omit only when the session already has an active space.");
const checkpointId = z.string().min(1).max(120).optional().describe("Opaque REWIND checkpoint ID. Omit only when the session already has an active checkpoint.");
const rewindSessionId = z.string().min(1).max(120).optional().describe("Opaque REWIND session ID. Omit only when the session already has an active Rewind session.");

/**
 * Strands chooses which approved operation to call. The controller resolves only
 * identifiers from AgentCore session context; physical state and restoration truth
 * are still produced exclusively by the deterministic REWIND service.
 */
export function createRewindStrandsTools(controller: RewindToolController) {
  const inspectSpace = tool({
    name: "inspect_space",
    description: "Observe the current physical space through the trusted REWIND perception provider and return a semantic summary. Never invent observations.",
    inputSchema: z.object({ spaceId }).strict(),
    callback: async input => controller.inspectSpace(input),
  });

  const saveCheckpoint = tool({
    name: "save_checkpoint",
    description: "Save the latest trusted semantic observation as a named checkpoint. The model cannot provide physical state.",
    inputSchema: z.object({
      spaceId,
      name: z.string().min(1).max(120).describe("Human-readable checkpoint name, for example Demo Ready."),
    }).strict(),
    callback: async input => controller.saveCheckpoint(input),
  });

  const listCheckpoints = tool({
    name: "list_checkpoints",
    description: "List persisted checkpoint summaries for the active or specified space.",
    inputSchema: z.object({ spaceId }).strict(),
    callback: async input => controller.listCheckpoints(input),
  });

  const compareCheckpoint = tool({
    name: "compare_checkpoint",
    description: "Deterministically compare the latest trusted observation against the active or specified persisted checkpoint. Only the tool result may state whether the scene matches.",
    inputSchema: z.object({ spaceId, checkpointId }).strict(),
    callback: async input => controller.compareCheckpoint(input),
  });

  const startRewind = tool({
    name: "start_rewind",
    description: "Start deterministic human restoration guidance for the active or specified checkpoint. Never fabricate restoration steps outside the returned plan.",
    inputSchema: z.object({ spaceId, checkpointId }).strict(),
    callback: async input => controller.startRewind(input),
  });

  const verifyRewind = tool({
    name: "verify_rewind",
    description: "Take a fresh trusted observation and deterministically verify progress for the active or specified Rewind session. This is the only tool that can advance verification truth.",
    inputSchema: z.object({ spaceId, rewindSessionId }).strict(),
    callback: async input => controller.verifyRewind(input),
  });

  const getRewindStatus = tool({
    name: "get_rewind_status",
    description: "Read the latest deterministic Rewind state and progress without observing or changing physical truth.",
    inputSchema: z.object({ spaceId, rewindSessionId }).strict(),
    callback: async input => controller.getRewindStatus(input),
  });

  const cancelRewind = tool({
    name: "cancel_rewind",
    description: "Cancel the active or specified Rewind guidance session. This never modifies the checkpoint or physical scene.",
    inputSchema: z.object({ spaceId, rewindSessionId }).strict(),
    callback: async input => controller.cancelRewind(input),
  });

  return [
    inspectSpace,
    saveCheckpoint,
    listCheckpoints,
    compareCheckpoint,
    startRewind,
    verifyRewind,
    getRewindStatus,
    cancelRewind,
  ];
}
