import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import {
  RingAccountLinkService,
  RingClient,
  RingObservationBridge,
  RingLiveFrameObserver,
  RingRtspObserver,
  RingSnapshotObserver,
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
import { RewindAgentToolService, type AgentCheckpointAccess, type SpaceObservationContext, type SpaceObserver } from "../../agent-tools/src/index.js";
import {
  AgentCoreSessionContinuityStore,
  InMemorySessionContinuityStore,
  type SessionContinuityStore,
} from "../../agent-orchestrator/src/index.js";
import { createRewindMcpHttpApp } from "../../mcp-server/src/http.js";
import {
  createAlexaSkillHttpServer,
  RewindAlexaSkill,
} from "../../alexa-skill/src/index.js";

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

function isRtspTransportFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /Ring RTSP|FFmpeg is required/i.test(message);
}

type LiveSourceKind = "ring" | "camera";

class AdaptiveRingObserver implements SpaceObserver {
  private rtspDisabled = false;

  constructor(
    private readonly primary: SpaceObserver,
    private readonly fallback: SpaceObserver,
    private readonly sourceForSpace: (spaceId: string) => LiveSourceKind,
  ) {}

  async inspect(spaceId: string, observationContext?: SpaceObservationContext) {
    if (this.sourceForSpace(spaceId) === "camera") {
      return this.fallback.inspect(spaceId, observationContext);
    }
    if (!this.rtspDisabled) {
      try {
        return await this.primary.inspect(spaceId, observationContext);
      } catch (error) {
        if (!isRtspTransportFailure(error)) throw error;
        this.rtspDisabled = true;
        const message = error instanceof Error ? error.message : "RTSPS unavailable";
        console.warn(`Ring RTSPS unavailable for this session (${message}); falling back to the live WHEP browser bridge.`);
      }
    }
    return this.fallback.inspect(spaceId, observationContext);
  }
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
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(defaultSpaceId)) {
    throw new Error("REWIND_DEFAULT_SPACE_ID must contain only letters, numbers, dots, underscores, or hyphens.");
  }
  const publicMcpHost = process.env.REWIND_MCP_PUBLIC_HOST?.trim();
  if (publicMcpHost && !/^[A-Za-z0-9.-]{1,253}$/.test(publicMcpHost)) {
    throw new Error("REWIND_MCP_PUBLIC_HOST must be a hostname only.");
  }

  const port = Number(process.env.RING_PREVIEW_PORT ?? 3002);
  const webhookPort = Number(process.env.RING_WEBHOOK_PORT ?? 3003);
  const mcpPort = Number(process.env.REWIND_MCP_PORT ?? 3004);
  const alexaPort = Number(process.env.REWIND_ALEXA_PORT ?? 3005);
  const alexaSkillId = process.env.REWIND_ALEXA_SKILL_ID?.trim();
  const alexaRelaySecret = process.env.REWIND_ALEXA_RELAY_SECRET?.trim();
  if (!validPort(port)) throw new Error("RING_PREVIEW_PORT must be an integer between 1024 and 65535.");
  if (!validPort(webhookPort) || webhookPort === port) throw new Error("RING_WEBHOOK_PORT must be a different integer between 1024 and 65535.");
  if (!validPort(mcpPort) || [port, webhookPort].includes(mcpPort)) throw new Error("REWIND_MCP_PORT must be a unique integer between 1024 and 65535.");
  if (!validPort(alexaPort) || [port, webhookPort, mcpPort].includes(alexaPort)) throw new Error("REWIND_ALEXA_PORT must be a unique integer between 1024 and 65535.");

  const configuredObservationTimeout = Number(process.env.REWIND_MCP_OBSERVATION_TIMEOUT_MS ?? 60_000);
  const bridge = new RingObservationBridge(Math.max(60_000, Math.min(60_000, configuredObservationTimeout)));
  const liveFrameObserver = new RingLiveFrameObserver({
    nova,
    maxFrameAgeMs: Number(process.env.REWIND_RING_WHEP_FRAME_MAX_AGE_MS ?? 5_000),
    waitMs: Number(process.env.REWIND_RING_WHEP_FRAME_WAIT_MS ?? 12_000),
  });
  const liveSources = new Map<string, LiveSourceKind>();
  const sourceForSpace = (spaceId: string): LiveSourceKind => liveSources.get(spaceId) ?? "ring";
  const checkpointAccess: AgentCheckpointAccess = {
    save: input => checkpoints.save(input),
    list: spaceId => checkpoints.list(spaceId),
    get: (spaceId, checkpointId) => checkpoints.get(spaceId, checkpointId),
  };

  const voiceObservationMode = (process.env.REWIND_RING_OBSERVER?.trim().toLowerCase() || "auto");
  if (!["auto", "rtsp", "snapshot", "browser"].includes(voiceObservationMode)) {
    throw new Error("REWIND_RING_OBSERVER must be auto, rtsp, snapshot, or browser.");
  }

  let voiceObserver: SpaceObserver = liveFrameObserver;
  let voiceDeviceId: string | undefined;
  if (voiceObservationMode !== "browser") {
    const devices = await listRingDevices(client, config.devicesPath);
    voiceDeviceId = process.env.REWIND_RING_DEVICE_ID?.trim() || devices[0]?.id;
    if (!voiceDeviceId) {
      throw new Error("No Ring device is available for server-side voice observations.");
    }
  }

  const createRtspObserver = () => new RingRtspObserver({
    nova,
    deviceId: voiceDeviceId!,
    accessToken: config.accessToken,
    ...(process.env.REWIND_RING_COMPONENT_ID?.trim()
      ? { componentId: process.env.REWIND_RING_COMPONENT_ID.trim() }
      : {}),
    ...(process.env.REWIND_FFMPEG_PATH?.trim()
      ? { ffmpegPath: process.env.REWIND_FFMPEG_PATH.trim() }
      : {}),
    timeoutMs: Number(process.env.REWIND_RING_RTSP_TIMEOUT_MS ?? 18_000),
  });

  if (voiceObservationMode === "auto") {
    voiceObserver = new AdaptiveRingObserver(createRtspObserver(), liveFrameObserver, sourceForSpace);
  } else if (voiceObservationMode === "rtsp") {
    voiceObserver = createRtspObserver();
  } else if (voiceObservationMode === "snapshot") {
    voiceObserver = new RingSnapshotObserver({
      client,
      nova,
      deviceId: voiceDeviceId!,
      lookbackMs: Number(process.env.REWIND_RING_SNAPSHOT_LOOKBACK_MS ?? 900_000),
    });
  } else if (voiceObservationMode === "browser") {
    voiceObserver = liveFrameObserver;
  }

  const mcpToolService = new RewindAgentToolService(voiceObserver, checkpointAccess);
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
  const previewHtml = (await readFile(resolve(assets, "index.html"), "utf8"))
    .replace('value="ring-playground"', `value="${defaultSpaceId}"`);
  const mcpBridgeJs = await readFile(resolve(assets, "mcp-bridge.js"), "utf8");
  const verifyJs = await readFile(resolve(assets, "verify.js"), "utf8");
  const consumerJs = await readFile(resolve(assets, "consumer.js"), "utf8");
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
    observeUnpublished: request => nova.observe(request),
    saveCheckpoint: input => checkpoints.save(input),
    addCheckpointView: input => checkpoints.addView(input),
    listCheckpoints: spaceId => checkpoints.list(spaceId),
    getCheckpoint: (spaceId, checkpointId) => checkpoints.get(spaceId, checkpointId),
    invokeAgent: input => liveAgent.invoke(input),
    pendingMcpObservationRequest: spaceId => liveFrameObserver.pendingRequest(spaceId),
    publishLiveFrame: input => liveFrameObserver.publish(input),
    setLiveSource: ({ spaceId, source }) => {
      liveSources.set(spaceId, source);
      console.log(`Live source for space ${spaceId}: ${source}.`);
    },
  }, {
    html: previewHtml,
    js: ["auto", "browser"].includes(voiceObservationMode) ? `${previewJs}\n${mcpBridgeJs}` : previewJs,
    verifyJs: `${verifyJs}\n${consumerJs}`,
  });

  preview.server.on("error", () => {
    console.error("Preview could not start. Check whether the port is in use.");
    process.exitCode = 1;
  });
  preview.server.listen(port, "127.0.0.1", () => {
    console.log(`REWIND preview: http://127.0.0.1:${port}`);
    console.log(`Live Strands agent: enabled · ${liveAgent.usingAgentCore ? "AgentCore Memory" : "in-memory continuity"} · actor ${liveAgent.actorId} · session ${liveAgent.sessionId}`);
    if (["auto", "browser"].includes(voiceObservationMode)) {
      console.log(`Live-frame freshness signal: http://127.0.0.1:${port}/api/mcp-observation-request`);
    }
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
    const voiceRule = voiceObservationMode === "auto"
      ? `Voice/MCP fresh-state rule: selected source (Ring RTSPS/browser or Camera/Phone buffer) → Nova → deterministic REWIND.`
      : voiceObservationMode === "rtsp"
        ? `Voice/MCP fresh-state rule: tool call → Ring RTSPS live frame (${voiceDeviceId}) → Nova → deterministic REWIND.`
        : voiceObservationMode === "snapshot"
          ? `Voice/MCP fresh-state rule: tool call → Ring historical snapshot (${voiceDeviceId}) → Nova → deterministic REWIND.`
          : "Voice/MCP fresh-state rule: selected browser live-frame buffer → Nova → deterministic REWIND.";
    console.log(voiceRule);
  });

  const alexaSkill = alexaSkillId
    ? new RewindAlexaSkill({
        tools: mcpToolService,
        defaultSpaceId,
        skillId: alexaSkillId,
      })
    : undefined;
  const alexaHttp = alexaSkill
    ? createAlexaSkillHttpServer(alexaSkill, {
        ...(alexaRelaySecret ? { relaySecret: alexaRelaySecret } : {}),
      })
    : undefined;
  if (alexaHttp) {
    alexaHttp.on("error", () => {
      console.error(`Alexa skill endpoint could not start. Check whether port ${alexaPort} is in use.`);
      process.exitCode = 1;
    });
    alexaHttp.listen(alexaPort, "127.0.0.1", () => {
      console.log(`REWIND Alexa Custom Skill endpoint: http://127.0.0.1:${alexaPort}/alexa`);
      if (alexaRelaySecret) {
        console.log(`REWIND Alexa Lambda relay: http://127.0.0.1:${alexaPort}/alexa-relay`);
        console.log("Lambda relay is protected by REWIND_ALEXA_RELAY_SECRET; expose port 3005 through HTTPS for Lambda only.");
      } else {
        console.log("Alexa Lambda relay disabled: set REWIND_ALEXA_RELAY_SECRET to enable /alexa-relay.");
      }
      console.log("Direct /alexa requests remain signature + timestamp verified.");
      console.log("Alexa scan operations run asynchronously so the skill stays inside Alexa's response timeout.");
    });
  } else {
    console.log("Alexa Custom Skill disabled: set REWIND_ALEXA_SKILL_ID to enable the verified /alexa endpoint.");
  }

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
    alexaHttp?.close();
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
    alexaHttp?.closeAllConnections();
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
    "REWIND_ALEXA_PORT must be a unique integer between 1024 and 65535.",
    "REWIND_MCP_PUBLIC_HOST must be a hostname only.",
    "REWIND_RING_OBSERVER must be auto, rtsp, snapshot, or browser.",
    "No Ring device is available for server-side voice observations.",
  ];
  return allowed.includes(message)
    ? message
    : "Check Ring variables, DYNAMODB_CHECKPOINTS_TABLE, AWS authentication, and local port availability.";
}

main().catch(error => {
  console.error(`Preview setup failed: ${safeStartupMessage(error)}`);
  process.exitCode = 1;
});