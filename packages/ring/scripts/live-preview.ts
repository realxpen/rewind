import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  RingAccountLinkService,
  RingClient,
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
  const liveAgent = createLiveRingAgentRuntime({
    checkpoints,
    region,
    modelId: process.env.REWIND_AGENT_MODEL_ID ?? "global.amazon.nova-2-lite-v1:0",
    ...(memoryId ? { memoryId } : {}),
    ...(actorId ? { actorId } : {}),
    ...(agentSessionId ? { sessionId: agentSessionId } : {}),
  });

  const assets = resolve("packages/ring/public");
  const preview = createPreviewServer({
    devices: () => listRingDevices(client, config.devicesPath),
    start: (id, offer) => startWhepSession(client, id, offer),
    stop: url => endWhepSession(client, url),
    observe: request => nova.observe(request),
    saveCheckpoint: input => checkpoints.save(input),
    listCheckpoints: spaceId => checkpoints.list(spaceId),
    getCheckpoint: (spaceId, checkpointId) => checkpoints.get(spaceId, checkpointId),
    invokeAgent: input => liveAgent.invoke(input),
  }, {
    html: await readFile(resolve(assets, "index.html"), "utf8"),
    js: await readFile(resolve(assets, "preview.js"), "utf8"),
    verifyJs: await readFile(resolve(assets, "verify.js"), "utf8"),
  });

  const port = Number(process.env.RING_PREVIEW_PORT ?? 3002);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error();
  preview.server.on("error", () => {
    console.error("Preview could not start. Check whether the port is in use.");
    process.exitCode = 1;
  });
  preview.server.listen(port, "127.0.0.1", () => {
    console.log(`REWIND preview: http://127.0.0.1:${port}`);
    console.log(`Live Strands agent: enabled · ${liveAgent.usingAgentCore ? "AgentCore Memory" : "in-memory continuity"} · actor ${liveAgent.actorId} · session ${liveAgent.sessionId}`);
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

  const webhookPort = Number(process.env.RING_WEBHOOK_PORT ?? 3003);
  if (!Number.isInteger(webhookPort) || webhookPort < 1024 || webhookPort > 65535 || webhookPort === port) throw new Error();
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
    preview.server.close();
    webhook?.server.close();
    const deadline = setTimeout(() => process.exit(1), 10_000);
    try { await preview.cleanup(); }
    catch {
      console.error("Ring cleanup failed; session may remain active until upstream expiry.");
      process.exitCode = 1;
    }
    clearTimeout(deadline);
    preview.server.closeAllConnections();
    webhook?.server.closeAllConnections();
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

main().catch(() => {
  console.error("Preview setup failed. Set Ring variables, DYNAMODB_CHECKPOINTS_TABLE, and valid AWS credentials, then retry from the repository root.");
  process.exitCode = 1;
});
