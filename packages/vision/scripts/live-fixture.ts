import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BedrockNovaVisionClient } from "../src/index.js";

const imagePath = process.argv[2];
if (!imagePath) {
  throw new Error(
    "Usage: npm run vision:fixture -- <path-to-png-or-jpeg> [png|jpeg|gif|webp]",
  );
}

const format = (process.argv[3] ?? "png") as "png" | "jpeg" | "gif" | "webp";
const region = process.env.AWS_REGION ?? "us-east-1";
const modelId =
  process.env.BEDROCK_MODEL_ID ?? "global.amazon.nova-2-lite-v1:0";

const imageBytes = new Uint8Array(await readFile(resolve(imagePath)));
const capturedAt = new Date().toISOString();

const client = new BedrockNovaVisionClient({ region, modelId });
const observation = await client.observe({
  imageBytes,
  format,
  context: {
    spaceId: "studio",
    capturedAt,
    trackedEntities: [
      { key: "desk.main", category: "desk" },
      { key: "chair.main", category: "chair" },
      { key: "headphone-stand.main", category: "headphone-stand" },
      { key: "headphones.main", category: "headphones" },
      { key: "cabinet.main", category: "cabinet" },
      { key: "backpack.black", category: "backpack" },
      { key: "tripod.camera", category: "tripod" },
      { key: "lamp.left", category: "lamp" },
    ],
  },
});

console.log(JSON.stringify(observation, null, 2));
