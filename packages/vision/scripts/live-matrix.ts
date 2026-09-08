import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import nodeProcess from "node:process";

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

const fixtureDir = resolve(
  nodeProcess.argv[2] ?? "fixtures/studio/vision",
);

const region =
  nodeProcess.env.AWS_REGION ?? "us-east-1";

const modelId =
  nodeProcess.env.BEDROCK_MODEL_ID ??
  "global.amazon.nova-2-lite-v1:0";

const evidenceFile =
  nodeProcess.env.VISION_EVIDENCE_FILE;

const fixtures: Array<{
  name: "demo-ready" | "messy" | "partial" | "restored";
  expected: PhysicalState;
}> = [
  { name: "demo-ready", expected: demoReady },
  { name: "messy", expected: messy },
  { name: "partial", expected: partial },
  { name: "restored", expected: restored },
];

/**
 * Primary whole-scene vocabulary.
 */
const trackedEntities = [
  {
    key: "desk.main",
    category: "desk",
    description: "large brown desk",
    observableAttributes: {
      clear:
        "boolean describing whether the central work surface is free of loose misplaced objects",
    },
  },
  {
    key: "chair.main",
    category: "chair",
    description: "single blue chair",
  },
  {
    key: "headphone-stand.main",
    category: "headphone-stand",
    description:
      "tall black T-shaped headphone stand whose top bar is designed to hold the headphones",
  },
  {
    key: "headphones.main",
    category: "headphones",
    description:
      "black over-ear headphones; distinguish whether they are hanging from the headphone stand or lying directly on the desk",
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
    description:
      "tall floor lamp on the far-right side with a wide base, vertical pole and large shade; it is the same physical lamp whether illuminated or unlit",
    observableAttributes: {
      powered:
        "boolean; true when visibly illuminated and false when visibly unlit",
    },
  },
];

/**
 * Focused observation vocabulary.
 *
 * Important:
 * Nova observes a concrete visual primitive:
 * hasLooseClutter.
 *
 * Deterministic code converts that into the PSP semantic:
 * clear = !hasLooseClutter.
 *
 * This keeps:
 * AI interprets state.
 * Deterministic code normalizes state.
 */
const deskFocusEntities = [
  {
    key: "desk.main",
    category: "desk",
    description:
      "large brown desk; inspect only the central work surface for loose objects",
    observableAttributes: {
      hasLooseClutter:
        "boolean; true if one or more loose papers, loose headphones, or other misplaced loose objects are visibly lying directly on the central desk work surface; false if the central work surface has no loose misplaced objects. Ignore the fixed headphone stand and headphones hanging from that stand.",
    },
  },
];

const lampFocusEntities = [
  {
    key: "lamp.left",
    category: "lamp",
    description:
      "the tall floor lamp on the far-right side with a base, vertical pole and large shade; look for the same physical lamp whether its bulb is illuminated or unlit",
    observableAttributes: {
      powered:
        "boolean; true if the lamp bulb is visibly illuminated or glowing; false if the lamp is visible but its bulb is visibly unlit",
    },
  },
];

const client = new BedrockNovaVisionClient({
  region,
  modelId,
});

function cloneState(state: PhysicalState): PhysicalState {
  return JSON.parse(JSON.stringify(state)) as PhysicalState;
}

function mergeFocusedObservations(
  primary: PhysicalState,
  deskFocus: PhysicalState,
  lampFocus: PhysicalState,
): PhysicalState {
  const merged = cloneState(primary);

  /*
   * ------------------------------------------------
   * Desk semantic normalization
   * ------------------------------------------------
   *
   * Vision detects the concrete visual primitive
   * "hasLooseClutter".
   *
   * PSP stores the semantic state "clear".
   */
  const focusedDesk = deskFocus.entities.find(
    (entity) => entity.key === "desk.main",
  );

  const desk = merged.entities.find(
    (entity) => entity.key === "desk.main",
  );

  const hasLooseClutter =
    focusedDesk?.attributes?.["hasLooseClutter"];

  if (
    desk &&
    typeof hasLooseClutter === "boolean"
  ) {
    desk.attributes = {
      ...(desk.attributes ?? {}),
      clear: !hasLooseClutter,
    };
  }

  /*
   * ------------------------------------------------
   * Lamp recovery
   * ------------------------------------------------
   *
   * Whole-scene perception has occasionally omitted
   * the unlit lamp. A focused pass can recover it.
   */
  const focusedLamp = lampFocus.entities.find(
    (entity) => entity.key === "lamp.left",
  );

  let lamp = merged.entities.find(
    (entity) => entity.key === "lamp.left",
  );

  if (
    !lamp &&
    focusedLamp &&
    focusedLamp.confidence >= 0.6
  ) {
    merged.entities.push(
      JSON.parse(
        JSON.stringify(focusedLamp),
      ),
    );

    lamp = merged.entities.find(
      (entity) => entity.key === "lamp.left",
    );
  }

  const powered =
    focusedLamp?.attributes?.["powered"];

  if (
    lamp &&
    typeof powered === "boolean"
  ) {
    lamp.attributes = {
      ...(lamp.attributes ?? {}),
      powered,
    };
  }

  return merged;
}

const observations =
  new Map<
    string,
    Awaited<ReturnType<typeof client.observe>>
  >();

const report: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  region,
  modelId,
  perceptionStrategy:
    "whole-scene + focused deterministic recovery",
  fixtures: {},
};

let failed = false;

for (const fixture of fixtures) {
  const imagePath = resolve(
    fixtureDir,
    `${fixture.name}.png`,
  );

  const imageBytes =
    new Uint8Array(
      await readFile(imagePath),
    );

  const capturedAt =
    new Date().toISOString();

  /*
   * PASS 1:
   * Whole room observation.
   */
  const primary =
    await client.observe({
      imageBytes,
      format: "png",
      context: {
        spaceId: "studio",
        capturedAt,
        trackedEntities,
      },
    });

  /*
   * PASS 2A:
   * Focus only on desk clutter.
   */
  const deskFocus =
    await client.observe({
      imageBytes,
      format: "png",
      context: {
        spaceId: "studio",
        capturedAt,
        trackedEntities:
          deskFocusEntities,
      },
    });

  /*
   * PASS 2B:
   * Focus only on lamp identity/power.
   */
  const lampFocus =
    await client.observe({
      imageBytes,
      format: "png",
      context: {
        spaceId: "studio",
        capturedAt,
        trackedEntities:
          lampFocusEntities,
      },
    });

  const mergedState =
    mergeFocusedObservations(
      primary.state,
      deskFocus.state,
      lampFocus.state,
    );

  const mergedObservation = {
    ...primary,
    state: mergedState,
  };

  observations.set(
    fixture.name,
    mergedObservation,
  );

  const evaluation =
    evaluateVisionState(
      fixture.expected,
      mergedState,
    );

  const entityGatePassed =
    evaluation.entityRecall >= 90;

  if (!entityGatePassed) {
    failed = true;
  }

  (
    report.fixtures as Record<
      string,
      unknown
    >
  )[fixture.name] = {
    imagePath,

    state: mergedState,

    primary: {
      state: primary.state,
      rawText: primary.rawText,
      latencyMs: primary.latencyMs,
      usage: primary.usage,
    },

    focusedDesk: {
      state: deskFocus.state,
      rawText: deskFocus.rawText,
      latencyMs: deskFocus.latencyMs,
      usage: deskFocus.usage,
    },

    focusedLamp: {
      state: lampFocus.state,
      rawText: lampFocus.rawText,
      latencyMs: lampFocus.latencyMs,
      usage: lampFocus.usage,
    },

    evaluation,
    entityGatePassed,
  };

  console.log(
    `\n=== ${fixture.name} ===`,
  );

  console.log(
    `entityRecall=${evaluation.entityRecall}%`,
  );

  console.log(
    `relationRecall=${evaluation.relationRecall}%`,
  );

  console.log(
    `attributeRecall=${evaluation.attributeRecall}%`,
  );

  console.log(
    `falsePositiveKeys=${
      evaluation.falsePositiveKeys.join(",") ||
      "none"
    }`,
  );

  console.log(
    `primaryLatencyMs=${primary.latencyMs}`,
  );

  console.log(
    `deskFocusLatencyMs=${deskFocus.latencyMs}`,
  );

  console.log(
    `lampFocusLatencyMs=${lampFocus.latencyMs}`,
  );
}

const checkpoint =
  observations.get("demo-ready");

const current =
  observations.get("messy");

if (!checkpoint || !current) {
  throw new Error(
    "Missing demo-ready or messy observation.",
  );
}

const changedSceneGate =
  evaluateChangedSceneGate(
    checkpoint.state,
    current.state,
    5,
  );

report.changedSceneGate =
  changedSceneGate;

if (!changedSceneGate.passed) {
  failed = true;
}

console.log(
  "\n=== changed-scene gate ===",
);

console.log(
  `recognized=${changedSceneGate.recognizedRequiredChanges}/${changedSceneGate.requiredChangeCount}`,
);

console.log(
  `falseRestored=${changedSceneGate.falseRestored}`,
);

if (
  changedSceneGate
    .missedRequiredChanges.length > 0
) {
  console.log(
    `missed=${changedSceneGate.missedRequiredChanges
      .map(
        (item) =>
          `${item.entity}:${item.type}`,
      )
      .join(",")}`,
  );
}

if (evidenceFile) {
  await writeFile(
    resolve(evidenceFile),
    JSON.stringify(
      report,
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    `evidence=${resolve(evidenceFile)}`,
  );
}

if (failed) {
  console.error(
    "\nPHASE 2 LIVE MATRIX: FAIL",
  );

  nodeProcess.exitCode = 1;
} else {
  console.log(
    "\nPHASE 2 LIVE MATRIX: PASS",
  );
}
