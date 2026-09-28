import assert from "node:assert/strict";
import { once } from "node:events";
import { createPreviewServer } from "../src/preview-server.js";
import type { VisionObservationRequest } from "../../vision/src/contracts.js";
import type { Checkpoint } from "../../checkpoints/src/contracts.js";
import { demoReady, messy } from "../../physical-state-protocol/fixtures/studio.js";
import type { PhysicalState } from "../../physical-state-protocol/src/index.js";
import {
  applyConsensusObservedExtras,
  mergeConsensusAdditions,
  reconcileTrackedEntityAliases,
} from "../src/tracked-entities.js";
import type { ObservedExtraCandidateEvidence } from "../src/tracked-entities.js";

const spaceId = "identity-anchor-space";
const checkpoint: Checkpoint = {
  id: "checkpoint-clean",
  spaceId,
  name: "Clean Setup",
  observationId: "saved-observation",
  state: { ...structuredClone(demoReady), spaceId },
  stateHash: "unit-state-hash",
  createdAt: new Date(0).toISOString(),
};

let observedRequest: VisionObservationRequest | undefined;
const preview = createPreviewServer({
  devices: async () => [],
  start: async () => { throw new Error("not used"); },
  stop: async () => {},
  observe: async request => {
    observedRequest = request;
    return {
      state: { ...structuredClone(demoReady), spaceId: request.context.spaceId, capturedAt: request.context.capturedAt },
      rawText: "unit",
      modelId: "unit-model",
      latencyMs: 1,
    };
  },
  getCheckpoint: async (requestedSpaceId, checkpointId) =>
    requestedSpaceId === spaceId && checkpointId === checkpoint.id ? checkpoint : undefined,
}, { html: "<!doctype html><title>REWIND</title>", js: "/* preview */" });

preview.server.listen(0, "127.0.0.1");
await once(preview.server, "listening");
const address = preview.server.address();
assert(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
const post = (path: string, data: unknown) => fetch(`${base}/api/${path}`, {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

function assertTrackedCheckpointVocabulary(request: VisionObservationRequest | undefined) {
  const tracked = request?.context.trackedEntities;
  assert(tracked && tracked.length > 0, "Checkpoint-anchored observations must receive identity hints.");
  assert.deepEqual(
    tracked.map(entity => [entity.key, entity.category]),
    checkpoint.state.entities.map(entity => [entity.key, entity.category]),
  );

  for (const entity of tracked) {
    const saved = checkpoint.state.entities.find(candidate => candidate.key === entity.key);
    assert(saved);
    if (saved.attributes && Object.keys(saved.attributes).length > 0) {
      assert.deepEqual(Object.keys(entity.observableAttributes ?? {}).sort(), Object.keys(saved.attributes).sort());
    }
    if (saved.relations?.length) {
      assert.deepEqual(
        (entity.observableRelations ?? []).map(relation => [relation.type, relation.target ?? ""]),
        saved.relations.map(relation => [relation.type, relation.target ?? ""]),
        `Expected tracked checkpoint relations for ${saved.key}.`,
      );
    }
  }
}

try {
  const frame = Buffer.from([255, 216, 255, 217]).toString("base64");

  // The first consumer "Rewind a space" observation happens before a Rewind
  // session exists. The selected checkpoint ID must therefore anchor Nova's
  // vocabulary and checkpoint relations before the initial deterministic compare.
  const initialObservedResponse = await post("observe", {
    image: frame,
    spaceId,
    capturedAt: new Date().toISOString(),
    checkpointId: checkpoint.id,
  });
  assert.equal(initialObservedResponse.status, 200);
  assertTrackedCheckpointVocabulary(observedRequest);

  observedRequest = undefined;
  const missingCheckpointResponse = await post("observe", {
    image: frame,
    spaceId,
    capturedAt: new Date().toISOString(),
    checkpointId: "missing-checkpoint",
  });
  assert.equal(missingCheckpointResponse.status, 400);
  assert.equal(observedRequest, undefined, "Nova must not run when the selected checkpoint cannot be resolved server-side.");

  const currentResponse = await post("demo/observe", { scenario: "messy", spaceId });
  assert.equal(currentResponse.status, 200);
  const current = await currentResponse.json() as { observationId: string };

  const rewindResponse = await post("rewind", {
    spaceId,
    observationId: current.observationId,
    checkpointId: checkpoint.id,
  });
  assert.equal(rewindResponse.status, 200);

  observedRequest = undefined;
  const activeObservedResponse = await post("observe", {
    image: frame,
    spaceId,
    capturedAt: new Date().toISOString(),
  });
  assert.equal(activeObservedResponse.status, 200);
  assertTrackedCheckpointVocabulary(observedRequest);

  console.log("PASS Rewind observation identity anchor: selected and active checkpoint keys + relations are supplied to Nova");
} finally {
  preview.server.close();
  preview.server.closeAllConnections();
}


const identityBaseline: PhysicalState = {
  schemaVersion: "0.1",
  spaceId: "identity-reconciliation",
  capturedAt: "2026-09-26T18:00:00.000Z",
  entities: [
    { key: "chair.main", category: "chair", confidence: 0.99, attributes: { present: true } },
    { key: "table.main", category: "table", confidence: 0.99 },
  ],
};

const identityDrifted: PhysicalState = {
  ...identityBaseline,
  capturedAt: "2026-09-26T18:01:00.000Z",
  entities: [
    { key: "chair", category: "chair", confidence: 0.96, attributes: { present: true } },
    {
      key: "cup.main",
      category: "cup",
      confidence: 0.95,
      relations: [{ type: "ON", target: "chair", confidence: 0.9 }],
    },
    { key: "table.main", category: "table", confidence: 0.99 },
  ],
};

const agreedIdentity = new Map([
  ["chair.main", {
    key: "chair.main",
    status: "PRESENT" as const,
    confidence: 0.96,
    matchedCurrentKey: "chair",
  }],
]);

const reconciledIdentity = reconcileTrackedEntityAliases(
  identityDrifted,
  identityBaseline,
  agreedIdentity,
  agreedIdentity,
);
assert.equal(reconciledIdentity.reconciled, 1, "Expected one generic tracked-key reconciliation.");
assert(reconciledIdentity.state.entities.some(entity => entity.key === "chair.main"), "Expected drifted chair key to reconcile to checkpoint identity.");
assert(!reconciledIdentity.state.entities.some(entity => entity.key === "chair"), "Old drifted key must be removed after reconciliation.");
assert.equal(
  reconciledIdentity.state.entities.find(entity => entity.key === "cup.main")?.relations?.[0]?.target,
  "chair.main",
  "Relations targeting a reconciled alias must follow the checkpoint identity.",
);

const disagreeingIdentity = reconcileTrackedEntityAliases(
  identityDrifted,
  identityBaseline,
  agreedIdentity,
  new Map([
    ["chair.main", {
      key: "chair.main",
      status: "PRESENT" as const,
      confidence: 0.96,
      matchedCurrentKey: "chair.other",
    }],
  ]),
);
assert.equal(disagreeingIdentity.reconciled, 0, "Audits must agree on the same candidate key before reconciliation.");
assert(disagreeingIdentity.state.entities.some(entity => entity.key === "chair"), "Disagreement must preserve the observed key instead of guessing.");


const extraBaseline: PhysicalState = {
  schemaVersion: "0.1",
  spaceId: "addition-consensus",
  capturedAt: "2026-09-28T11:00:00.000Z",
  entities: [
    { key: "countertop.main", category: "countertop", confidence: 0.99 },
    { key: "toaster.main", category: "toaster", confidence: 0.98 },
  ],
};
const extraObserved: PhysicalState = {
  ...extraBaseline,
  capturedAt: "2026-09-28T11:01:00.000Z",
  entities: [
    { key: "countertop.main", category: "countertop", confidence: 0.99 },
    { key: "toaster.main", category: "toaster", confidence: 0.98 },
    { key: "cup.blue", category: "cup", confidence: 0.96, attributes: { present: true, color: "blue" } },
  ],
};
const agreedExtras = new Map([
  ["kettle.red", {
    canonicalKey: "kettle.red",
    category: "kettle",
    confidence: 0.96,
    color: "red",
    appearance: "red kettle",
  }],
]);
const mergedExtras = mergeConsensusAdditions(extraObserved, extraBaseline, agreedExtras, agreedExtras);
assert.equal(mergedExtras.added, 1, "Two agreeing addition audits must admit one missed extra.");
assert(
  mergedExtras.state.entities.some(entity =>
    entity.key === "kettle.red"
    && entity.category === "kettle"
    && entity.attributes?.present === true
    && entity.attributes?.color === "red"
  ),
  "Consensus extra must become explicit present=true current evidence.",
);

const disagreeingExtras = mergeConsensusAdditions(
  extraObserved,
  extraBaseline,
  agreedExtras,
  new Map([
    ["kettle.black", {
      canonicalKey: "kettle.black",
      category: "kettle",
      confidence: 0.96,
      color: "black",
      appearance: "black kettle",
    }],
  ]),
);
assert.equal(disagreeingExtras.added, 0, "Addition audits must agree on the same canonical extra before admission.");

const duplicateExtra = mergeConsensusAdditions(
  extraObserved,
  extraBaseline,
  new Map([
    ["cup.blue", {
      canonicalKey: "cup.blue",
      category: "cup",
      confidence: 0.97,
      color: "blue",
      appearance: "blue cup",
    }],
  ]),
  new Map([
    ["cup.blue", {
      canonicalKey: "cup.blue",
      category: "cup",
      confidence: 0.97,
      color: "blue",
      appearance: "blue cup",
    }],
  ]),
);
assert.equal(duplicateExtra.added, 0, "Consensus addition audit must not duplicate an extra already found by the main observation.");


const observedCandidateState: PhysicalState = {
  schemaVersion: "0.1",
  spaceId: "observed-extra-consensus",
  capturedAt: "2026-09-28T12:50:00.000Z",
  entities: [
    { key: "countertop", category: "countertop", confidence: 0.99 },
    { key: "cup", category: "cup", confidence: 0.97 },
    { key: "kettle", category: "kettle", confidence: 0.97 },
  ],
};
const observedCandidateVotes = new Map<string, ObservedExtraCandidateEvidence>([
  ["countertop", { candidateKey: "countertop", decision: "REPRESENTED" as const, confidence: 0.99 }],
  ["cup", { candidateKey: "cup", decision: "EXTRA" as const, confidence: 0.98 }],
  ["kettle", { candidateKey: "kettle", decision: "EXTRA" as const, confidence: 0.97 }],
]);
const markedObservedExtras = applyConsensusObservedExtras(
  observedCandidateState,
  observedCandidateVotes,
  observedCandidateVotes,
);
assert.equal(markedObservedExtras.marked, 2, "Two agreeing candidate audits must mark both current extras.");
assert.equal(
  markedObservedExtras.state.entities.find(entity => entity.key === "cup")?.attributes?.present,
  true,
  "Existing cup candidate must become explicit movable/present evidence.",
);
assert.equal(
  markedObservedExtras.state.entities.find(entity => entity.key === "kettle")?.attributes?.present,
  true,
  "Existing kettle candidate must become explicit movable/present evidence without noun hardcoding.",
);
assert.equal(
  markedObservedExtras.state.entities.find(entity => entity.key === "kettle")?.role,
  "MOVABLE",
  "Consensus extra candidate must receive semantic MOVABLE role.",
);

const splitCandidateVotes = new Map<string, ObservedExtraCandidateEvidence>(observedCandidateVotes);
splitCandidateVotes.set("kettle", {
  candidateKey: "kettle",
  decision: "UNCERTAIN" as const,
  confidence: 0.7,
});
const conservativeObservedExtras = applyConsensusObservedExtras(
  observedCandidateState,
  observedCandidateVotes,
  splitCandidateVotes,
);
assert.equal(
  conservativeObservedExtras.state.entities.find(entity => entity.key === "kettle")?.attributes?.present,
  undefined,
  "Candidate disagreement must not invent actionable presence.",
);
