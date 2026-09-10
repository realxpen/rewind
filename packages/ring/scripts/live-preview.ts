import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  RingClient,
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
  const nova = new BedrockNovaVisionClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    modelId: process.env.BEDROCK_MODEL_ID ?? "global.amazon.nova-2-lite-v1:0",
  });
  const checkpoints = new CheckpointService(createDynamoCheckpointStoreFromEnv());
  const assets = resolve("packages/ring/public");
  const preview = createPreviewServer({
    devices: () => listRingDevices(client, config.devicesPath),
    start: (id, offer) => startWhepSession(client, id, offer),
    stop: url => endWhepSession(client, url),
    observe: request => nova.observe(request),
    saveCheckpoint: input => checkpoints.save(input),
    listCheckpoints: spaceId => checkpoints.list(spaceId),
    getCheckpoint: (spaceId, checkpointId) => checkpoints.get(spaceId, checkpointId),
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
  preview.server.listen(port, "127.0.0.1", () => console.log(`REWIND preview: http://127.0.0.1:${port}`));

  const signingKey = process.env.RING_HMAC_SECRET;
  const webhookPort = 3003;
  const webhook = signingKey
    ? createRingWebhookServer({
        signingKey,
        allowedOrigins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`],
      })
    : undefined;

  if (webhook) {
    webhook.server.on("error", () => {
      console.error("Ring webhook listener could not start. Check whether port 3003 is in use.");
      process.exitCode = 1;
    });
    webhook.server.listen(webhookPort, "127.0.0.1", () => {
      console.log(`Ring webhook ingress (local): http://127.0.0.1:${webhookPort}/webhooks/ring`);
      console.log("Expose port 3003 through an HTTPS TLS 1.2+ tunnel/reverse proxy before registering the URL with Ring.");
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
