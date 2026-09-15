import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import {
  RingAccountLinkService,
  RingClient,
  RingObservationBridge,
  createLiveRingAgentRuntime,
  createRingWebhookServer,
  endWhepSession,
  listRingDevices,
  loadRingConfig,
  startWhepSession,
} from "../src/index.js";
import { createPreviewServer } from "../src/preview-server.js";
import { BedrockNovaVisionClient } from "../../vision/src/bedrock.js";
import { CheckpointService, createDynamoCheckpointStoreFromEnv } from "../../checkpoints/src/index.js";
import { RewindAgentToolService, type AgentCheckpointAccess } from "../../agent-tools/src/index.js";
import {
  AgentCoreSessionContinuityStore,
  InMemorySessionContinuityStore,
  type SessionContinuityStore,
} from "../../agent-orchestrator/src/index.js";
import { createRewindMcpHttpApp } from "../../mcp-server/src/http.js";

function loadLocalEnvironment(): void {
  const path = resolve(".env");
  if (!existsSync(path)) return;
  loadEnvFile(path);
  console.log("Loaded local configuration from .env");
}

loadLocalEnvironment();

function validPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1024 && value <= 65535;
}

async function main() {
  const config = loadRingConfig();
  const client = new RingClient(config);
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
  const visionModelId = process.env.BEDROCK_MODEL_ID ?? "global.amazon.nova-2-lite-v1:0";
  const nova = new BedrockNovaVisionClient({ region, modelId: visionModelId });
  const checkpoints = new CheckpointService(createDynamoCheckpointStoreFromEnv());
  const memoryId = process.env.REWIND_AGENTCORE_MEMORY_ID?.trim();
  const actorId = process.env.REWIND_AGENT_ACTOR_ID?.trim();
  const agentSessionId = process.env.REWIND_AGENT_SESSION_ID?.trim();
  const defaultSpaceId = process.env.REWIND_DEFAULT_SPACE_ID?.trim() || "ring-playground";
  const publicMcpHost = process.env.REWIND_MCP_PUBLIC_HOST?.trim();
  if (publicMcpHost && !/^[A-Za-z0-9.-]{1,253}$/.test(publicMcpHost)) {
    throw new Error("REWIND_MCP_PUBLIC_HOST must be a hostname only.");
  }

  const port = Number(process.env.RING_PREVIEW_PORT ?? 3002);
  const webhookPort = Number(process.env.RING_WEBHOOK_PORT ?? 3003);
  const mcpPort = Number(process.env.REWIND_MCP_PORT ?? 3004);
  if (!validPort(port)) throw new Error("RING_PREVIEW_PORT must be an integer between 1024 and 65535.");
  if (!validPort(webhookPort) || webhookPort === port) throw new Error("RING_WEBHOOK_PORT must be a different integer between 1024 and 65535.");
  if (!validPort(mcpPort) || [port, webhookPort].includes(mcpPort)) throw new Error("REWIND_MCP_PORT must be a unique integer between 1024 and 65535.");

  const bridge = new RingObservationBridge(Number(process.env.REWIND_MCP_OBSERVATION_TIMEOUT_MS ?? 30_000));
  const checkpointAccess: AgentCheckpointAccess = {
    save: input => checkpoints.save(input),
    list: spaceId => checkpoints.list(spaceId),
    get: (spaceId, checkpointId) => checkpoints.get(spaceId, checkpointId),
  };
  const mcpToolService = new RewindAgentToolService(bridge, checkpointAccess);
  const mcpContinuity: SessionContinuityStore = memoryId
    ? new AgentCoreSessionContinuityStore({ memoryId, region })
    : new InMemorySessionContinuityStore();

  const liveAgent = createLiveRingAgentRuntime({
    checkpoints,
    region,
    modelId: process.env.REWIND_AGENT_MODEL_ID ?? "global.amazon.nova-2-lite-v1:0",
    ...(memoryId ? { memoryId } : {}),
    ...(actorId ? { actorId } : {}),
    ...(agentSessionId ? { sessionId: agentSessionId } : {}),
  });

  const assets = resolve("packages/ring/public");
  const previewJs = await readFile(resolve(assets, "preview.js"), "utf8");
  const mcpBridgeJs = await readFile(resolve(assets, "mcp-bridge.js"), "utf8");
  const preview = createPreviewServer({
    devices: () => listRingDevices(client, config.devicesPath),
    start: (id, offer) => startWhepSession(client, id, offer),
    stop: url => endWhepSession(client, url),
    observe: async request => {
      const result = await nova.observe(request);
      bridge.publish({
        observationId: `ring-mcp-${randomUUID()}`,
        spaceId: result.state.spaceId,
        state: result.state,
        ...(result.modelId !== undefined ? { modelId: result.modelId } : {}),
        ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
        receivedAt: Date.now(),
      });
      return result;
    },
    saveCheckpoint: input => checkpoints.save(input),
    listCheckpoints: spaceId => checkpoints.list(spaceId),
    getCheckpoint: (spaceId, checkpointId) => checkpoints.get(spaceId, checkpointId),
    invokeAgent: input => liveAgent.invoke(input),
    pendingMcpObservationRequest: spaceId => bridge.pendingRequest(spaceId),
  }, {
    html: await readFile(resolve(assets, "index.html"), "utf8"),
    js: `${previewJs}\n${mcpBridgeJs}`,
    verifyJs: await readFile(resolve(assets, "verify.js"), "utf8"),
  });

  preview.server.on("error", () => {
    console.error("Preview could not start. Check whether the port is in use.");
    process.exitCode = 1;
  });
  preview.server.listen(port, "127.0.0.1", () => {
    console.log(`REWIND preview: http://127.0.0.1:${port}`);
    console.log(`Live Strands agent: enabled · ${liveAgent.usingAgentCore ? "AgentCore Memory" : "in-memory continuity"} · actor ${liveAgent.actorId} · session ${liveAgent.sessionId}`);
    console.log(`MCP fresh-observation signal: http://127.0.0.1:${port}/api/mcp-observation-request`);
  });

  const mcpApp = createRewindMcpHttpApp({
    toolService: mcpToolService,
    continuity: mcpContinuity,
    actorId: process.env.REWIND_MCP_ACTOR_ID?.trim() || "rewind-alexa-demo-user",
    sessionId: process.env.REWIND_MCP_SESSION_ID?.trim() || "rewind-alexa-demo-session",
    defaultSpaceId,
    host: publicMcpHost ? "0.0.0.0" : "127.0.0.1",
    ...(publicMcpHost ? { allowedHosts: ["127.0.0.1", "localhost", publicMcpHost] } : {}),
  });
  const mcpHttp = mcpApp.listen(mcpPort, "127.0.0.1", () => {
    console.log(`REWIND live MCP (Streamable HTTP): http://127.0.0.1:${mcpPort}/mcp`);
    if (publicMcpHost) console.log(`MCP public Host allowlisted for tunnel: ${publicMcpHost}`);
    console.log("MCP fresh-state rule: tool call → browser capture request → Ring frame → Nova → deterministic REWIND.");
  });

  const signingKey = process.env.RING_HMAC_SECRET?.trim();
  const ringClientId = process.env.RING_CLIENT_ID?.trim();
  const ringClientSecret = process.env.RING_CLIENT_SECRET?.trim();
  const partnerEmail = process.env.REWIND_LINK_USER_EMAIL?.trim();
  const partnerAuthSecret = process.env.REWIND_LINK_AUTH_SECRET?.trim();

  const accountLink = signingKey && ringClientId && ringClientSecret && partnerEmail && partnerAuthSecret
    ? new RingAccountLinkService({
        clientId: ringClientId,
        clientSecret: ringClientSecret,
        hmacSecret: signingKey,
        partnerEmail,
        partnerAuthSecret,
        apiBaseUrl: config.baseUrl,
      })
    : undefined;

  const webhook = signingKey
    ? createRingWebhookServer({
        signingKey,
        allowedOrigins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`],
        ...(accountLink ? { accountLink } : {}),
      })
    : undefined;

  if (webhook) {
    webhook.server.on("error", () => {
      console.error(`Ring integration listener could not start. Check whether port ${webhookPort} is in use.`);
      process.exitCode = 1;
    });
    webhook.server.listen(webhookPort, "127.0.0.1", () => {
      console.log(`Ring webhook ingress (local): http://127.0.0.1:${webhookPort}/webhooks/ring`);
      if (accountLink) {
        console.log(`Ring account link (local): http://127.0.0.1:${webhookPort}/ring/link`);
        console.log(`Ring app homepage (local): http://127.0.0.1:${webhookPort}/ring`);
        console.log(`Ring token exchange (local): http://127.0.0.1:${webhookPort}/ring/oauth/token-exchange`);
      } else {
        console.log("Ring account linking disabled: set RING_CLIENT_ID, RING_CLIENT_SECRET, REWIND_LINK_USER_EMAIL, and REWIND_LINK_AUTH_SECRET.");
      }
      console.log(`Expose port ${webhookPort} through an HTTPS TLS 1.2+ tunnel/reverse proxy before registering Ring URLs.`);
    });
  } else {
    console.log("Ring motion webhook disabled: set RING_HMAC_SECRET to enable Phase 7. Manual Check Again remains available.");
  }

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    bridge.cancelAll("REWIND preview stopped.");
    preview.server.close();
    webhook?.server.close();
    mcpHttp.close();
    const deadline = setTimeout(() => process.exit(1), 10_000);
    try { await preview.cleanup(); }
    catch {
      console.error("Ring cleanup failed; session may remain active until upstream expiry.");
      process.exitCode = 1;
    }
    clearTimeout(deadline);
    preview.server.closeAllConnections();
    webhook?.server.closeAllConnections();
    mcpHttp.closeAllConnections();
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

function safeStartupMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const allowed = [
    "RING_API_BASE_URL is required.",
    "RING_ACCESS_TOKEN is required.",
    "DYNAMODB_CHECKPOINTS_TABLE is required.",
    "RING_PREVIEW_PORT must be an integer between 1024 and 65535.",
    "RING_WEBHOOK_PORT must be a different integer between 1024 and 65535.",
    "REWIND_MCP_PORT must be a unique integer between 1024 and 65535.",
    "REWIND_MCP_PUBLIC_HOST must be a hostname only.",
  ];
  return allowed.includes(message)
    ? message
    : "Check Ring variables, DYNAMODB_CHECKPOINTS_TABLE, AWS authentication, and local port availability.";
}

main().catch(error => {
  console.error(`Preview setup failed: ${safeStartupMessage(error)}`);
  process.exitCode = 1;
});
