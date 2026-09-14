import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RewindAgentToolService } from "../../agent-tools/src/index.js";
import {
  InMemorySessionContinuityStore,
  RewindToolController,
  type SessionContinuityStore,
} from "../../agent-orchestrator/src/index.js";

export interface RewindMcpServerOptions {
  toolService: RewindAgentToolService;
  continuity?: SessionContinuityStore;
  actorId?: string;
  sessionId?: string;
  defaultSpaceId?: string;
}

function asStructured(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return { items: value };
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return { value };
}

function success(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: asStructured(value),
  };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "REWIND tool failed.";
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

export function createRewindMcpServer(options: RewindMcpServerOptions): McpServer {
  const continuity = options.continuity ?? new InMemorySessionContinuityStore();
  const actorId = options.actorId ?? "rewind-mcp-user";
  const sessionId = options.sessionId ?? "rewind-mcp-session";
  const defaultSpaceId = options.defaultSpaceId ?? "studio";

  async function controller(): Promise<RewindToolController> {
    return RewindToolController.create(
      options.toolService,
      continuity,
      actorId,
      sessionId,
      defaultSpaceId,
    );
  }

  const server = new McpServer(
    {
      name: "rewind",
      version: "0.2.0",
    },
    {
      capabilities: { logging: {} },
      instructions:
        "REWIND is Ctrl+Z for reality. Tools may select approved operations, but deterministic REWIND code decides physical truth. Never invent state, diffs, percentages, restore plans, or RESTORED.",
    },
  );

  const optionalSpace = z.string().min(1).max(80).optional();
  const optionalOpaque = z.string().min(1).max(120).optional();

  server.registerTool(
    "inspect_space",
    {
      title: "Inspect Space",
      description: "Take a fresh trusted observation of the active REWIND space.",
      inputSchema: { spaceId: optionalSpace },
    },
    async input => {
      try {
        return success(await (await controller()).inspectSpace(input));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "save_checkpoint",
    {
      title: "Save Checkpoint",
      description: "Observe the current space and save its validated semantic state as a named checkpoint.",
      inputSchema: {
        name: z.string().min(1).max(120),
        spaceId: optionalSpace,
      },
    },
    async input => {
      try {
        const c = await controller();
        await c.inspectSpace({ spaceId: input.spaceId });
        return success(await c.saveCheckpoint(input));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "list_checkpoints",
    {
      title: "List Checkpoints",
      description: "List saved checkpoints for the active REWIND space.",
      inputSchema: { spaceId: optionalSpace },
    },
    async input => {
      try {
        return success(await (await controller()).listCheckpoints(input));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "compare_checkpoint",
    {
      title: "Compare Checkpoint",
      description: "Take a fresh trusted observation and deterministically compare it with the selected checkpoint.",
      inputSchema: {
        spaceId: optionalSpace,
        checkpointId: optionalOpaque,
      },
    },
    async input => {
      try {
        return success(await (await controller()).compareCheckpoint(input));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "start_rewind",
    {
      title: "Start Rewind",
      description: "Take a fresh trusted observation and deterministically build a restoration plan for the selected checkpoint.",
      inputSchema: {
        spaceId: optionalSpace,
        checkpointId: optionalOpaque,
      },
    },
    async input => {
      try {
        return success(await (await controller()).startRewind(input));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "verify_rewind",
    {
      title: "Verify Rewind",
      description: "Take a fresh trusted observation and deterministically verify progress for the active Rewind session.",
      inputSchema: {
        spaceId: optionalSpace,
        rewindSessionId: optionalOpaque,
      },
    },
    async input => {
      try {
        return success(await (await controller()).verifyRewind(input));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "get_rewind_status",
    {
      title: "Get Rewind Status",
      description: "Read the current deterministic state of the active Rewind session without observing again.",
      inputSchema: {
        spaceId: optionalSpace,
        rewindSessionId: optionalOpaque,
      },
    },
    async input => {
      try {
        return success(await (await controller()).getRewindStatus(input));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "cancel_rewind",
    {
      title: "Cancel Rewind",
      description: "Cancel the active Rewind session. This does not alter physical state or checkpoint truth.",
      inputSchema: {
        spaceId: optionalSpace,
        rewindSessionId: optionalOpaque,
      },
    },
    async input => {
      try {
        return success(await (await controller()).cancelRewind(input));
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}
