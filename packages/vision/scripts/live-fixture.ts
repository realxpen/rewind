import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  demoReady,
  messy,
  partial,
  restored,
} from "../../physical-state-protocol/fixtures/studio.js";
import {
  BedrockNovaVisionClient,
  evaluateVisionState,
} from "../src/index.js";

const imagePath = process.argv[2];
if (!imagePath) {
  throw new Error(
    "Usage: npm run vision:fixture -- <path-to-png-or-jpeg> [png|jpeg|gif|webp] [demo-ready|messy|partial|restored]",
  );
}

const format = (process.argv[3] ?? "png") as "png" | "jpeg" | "gif" | "webp";
const inferredFixtureName = basename(imagePath).replace(/\.(png|jpe?g|gif|webp)$/i, "");
const fixtureName = process.argv[4] ?? inferredFixtureName;

const expectedByName = {
  "demo-ready": demoReady,
  messy,
  partial,
  restored,
} as const;

if (!(fixtureName in expectedByName)) {
  throw new Error(
    `Unknown fixture '${fixtureName}'. Expected demo-ready, messy, partial, or restored.`,
  );
}

const expected = expectedByName[fixtureName as keyof typeof expectedByName];
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

const evaluation = evaluateVisionState(expected, observation.state);
const entityTargetMet = evaluation.entityRecall >= 90;

console.log(
  JSON.stringify(
    {
      fixture: fixtureName,
      modelId: observation.modelId,
      latencyMs: observation.latencyMs,
      usage: observation.usage,
      state: observation.state,
      evaluation,
      targets: {
        entityRecallPercent: 90,
        entityTargetMet,
        note: "Relation and attribute recall are reported as evidence; Phase 2 closes only after the controlled fixture set is reviewed consistently.",
      },
    },
    null,
    2,
  ),
);

if (!entityTargetMet) {
  process.exitCode = 2;
}
