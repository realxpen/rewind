import type { AgentToolName } from "./contracts.js";

export interface AgentToolSpec {
  name: AgentToolName;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: "string"; description: string; minLength?: number; maxLength?: number }>;
    required: string[];
    additionalProperties: false;
  };
}

const spaceId = {
  type: "string" as const,
  description: "REWIND space identifier, for example studio.",
  minLength: 1,
  maxLength: 80,
};
const checkpointId = {
  type: "string" as const,
  description: "Opaque checkpoint identifier returned by REWIND.",
  minLength: 1,
  maxLength: 120,
};
const rewindSessionId = {
  type: "string" as const,
  description: "Opaque Rewind session identifier returned by start_rewind.",
  minLength: 1,
  maxLength: 120,
};

/**
 * SDK-neutral schemas used by Strands now and MCP later.
 * No tool accepts physical state, desired state, match percentage, or a RESTORED flag.
 */
export const AGENT_TOOL_SPECS: readonly AgentToolSpec[] = [
  {
    name: "inspect_space",
    description: "Observe the current physical space through the configured Ring/Nova perception provider and return a semantic summary.",
    inputSchema: {
      type: "object",
      properties: { spaceId },
      required: ["spaceId"],
      additionalProperties: false,
    },
  },
  {
    name: "save_checkpoint",
    description: "Save the latest trusted observation of a space as a named checkpoint. Physical state cannot be supplied by the agent.",
    inputSchema: {
      type: "object",
      properties: {
        spaceId,
        name: {
          type: "string",
          description: "Human-readable checkpoint name.",
          minLength: 1,
          maxLength: 120,
        },
      },
      required: ["spaceId", "name"],
      additionalProperties: false,
    },
  },
  {
    name: "list_checkpoints",
    description: "List saved checkpoint summaries for a space.",
    inputSchema: {
      type: "object",
      properties: { spaceId },
      required: ["spaceId"],
      additionalProperties: false,
    },
  },
  {
    name: "compare_checkpoint",
    description: "Deterministically compare the latest trusted observation with a persisted checkpoint.",
    inputSchema: {
      type: "object",
      properties: { spaceId, checkpointId },
      required: ["spaceId", "checkpointId"],
      additionalProperties: false,
    },
  },
  {
    name: "start_rewind",
    description: "Build a deterministic human restoration plan from the latest trusted observation and a persisted checkpoint.",
    inputSchema: {
      type: "object",
      properties: { spaceId, checkpointId },
      required: ["spaceId", "checkpointId"],
      additionalProperties: false,
    },
  },
  {
    name: "verify_rewind",
    description: "Take a fresh trusted observation and deterministically verify progress for an active Rewind session.",
    inputSchema: {
      type: "object",
      properties: { spaceId, rewindSessionId },
      required: ["spaceId", "rewindSessionId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_rewind_status",
    description: "Read the most recent deterministic state, progress, and plan for an active Rewind session without changing physical truth.",
    inputSchema: {
      type: "object",
      properties: { spaceId, rewindSessionId },
      required: ["spaceId", "rewindSessionId"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_rewind",
    description: "Cancel an active Rewind guidance session. This does not change checkpoint or physical state.",
    inputSchema: {
      type: "object",
      properties: { spaceId, rewindSessionId },
      required: ["spaceId", "rewindSessionId"],
      additionalProperties: false,
    },
  },
] as const;
