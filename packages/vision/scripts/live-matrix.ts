import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  demoReady,
  messy,
  partial,
  restored,
} from "../../physical-state-protocol/fixtures/studio.js";
import type { PhysicalState } from "../../physical-state-protocol/src/index.js";
import {
  BedrockNovaVisionClient,
  evaluateChangedSceneGate,
  evaluateVisionState,
} from "../src/index.js";

const fixtureDir = resolve(process.argv[2] ?? "fixtures/studio/vision");
const region = process.env.AWS_REGION ?? "us-east-1";
const modelId =
  process.env.BEDROCK_MODEL_ID ?? "global.amazon.nova-2-lite-v1:0";
const evidenceFile = process.env.VISION_EVIDENCE_FILE;

const fixtures: Array<{
  name: "demo-ready" | "messy" | "partial" | "restored";
  expected: PhysicalState;
}> = [
  { name: "demo-ready", expected: demoReady },
  { name: "messy", expected: messy },
  { name: "partial", expected: partial },
  { name: "restored", expected: restored },
];

const trackedEntities = [
  { key: "desk.main", category: "desk", description: "large brown desk" },
  { key: "chair.main", category: "chair", description: "single blue chair" },
  {
    key: "headphone-stand.main",
    category: "headphone-stand",
    description: "black T-shaped headphone stand",
  },
  {
    key: "headphones.main",
    category: "headphones",
    description: "black over-ear headphones",
  },
  {
    key: "cabinet.main",
    category: "cabinet",
    description: "brown two-door cabinet",
  },
  {
    key: "backpack.black",
    category: "backpack",
    description: "dark backpack",
  },
  {
    key: "tripod.camera",
    category: "tripod",
    description: "black camera tripod",
  },
  {
    key: "lamp.left",
    category: "lamp",
    description: "single floor lamp",
  },
];

const client = new BedrockNovaVisionClient({ region, modelId });
const observations = new Map<string, Awaited<ReturnType<typeof client.observe>>>();
const report: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  region,
  modelId,
  fixtures: {},
};

let failed = false;

for (const fixture of fixtures) {
  const imagePath = resolve(fixtureDir, `${fixture.name}.png`);
  const imageBytes = new Uint8Array(await readFile(imagePath));
  const capturedAt = new Date().toISOString();

  const observation = await client.observe({
    imageBytes,
    format: "png",
    context: {
      spaceId: "studio",
      capturedAt,
      trackedEntities,
    },
  });

  observations.set(fixture.name, observation);
  const evaluation = evaluateVisionState(fixture.expected, observation.state);
  const entityGatePassed = evaluation.entityRecall >= 90;
  if (!entityGatePassed) failed = true;

  (report.fixtures as Record<string, unknown>)[fixture.name] = {
    imagePath,
    state: observation.state,
    rawText: observation.rawText,
    latencyMs: observation.latencyMs,
    usage: observation.usage,
    evaluation,
    entityGatePassed,
  };

  console.log(`\n=== ${fixture.name} ===`);
  console.log(`entityRecall=${evaluation.entityRecall}%`);
  console.log(`relationRecall=${evaluation.relationRecall}%`);
  console.log(`attributeRecall=${evaluation.attributeRecall}%`);
  console.log(`falsePositiveKeys=${evaluation.falsePositiveKeys.join(",") || "none"}`);
  console.log(`latencyMs=${observation.latencyMs}`);
}

const checkpoint = observations.get("demo-ready");
const current = observations.get("messy");
if (!checkpoint || !current) {
  throw new Error("Missing demo-ready or messy observation.");
}

const changedSceneGate = evaluateChangedSceneGate(
  checkpoint.state,
  current.state,
  5,
);

report.changedSceneGate = changedSceneGate;
if (!changedSceneGate.passed) failed = true;

console.log("\n=== changed-scene gate ===");
console.log(
  `recognized=${changedSceneGate.recognizedRequiredChanges}/${changedSceneGate.requiredChangeCount}`,
);
console.log(`falseRestored=${changedSceneGate.falseRestored}`);
if (changedSceneGate.missedRequiredChanges.length > 0) {
  console.log(
    `missed=${changedSceneGate.missedRequiredChanges
      .map((item) => `${item.entity}:${item.type}`)
      .join(",")}`,
  );
}

if (evidenceFile) {
  await writeFile(resolve(evidenceFile), JSON.stringify(report, null, 2), "utf8");
  console.log(`evidence=${resolve(evidenceFile)}`);
}

if (failed) {
  console.error("\nPHASE 2 LIVE MATRIX: FAIL");
  process.exitCode = 1;
} else {
  console.log("\nPHASE 2 LIVE MATRIX: PASS");
}
