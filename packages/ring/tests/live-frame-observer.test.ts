import assert from "node:assert/strict";
import { RingLiveFrameObserver } from "../src/live-frame-observer.js";
import type { BedrockNovaVisionClient } from "../../vision/src/bedrock.js";

const jpeg = new Uint8Array([255, 216, 10, 20, 30, 255, 217]);
let novaCalls = 0;
let observedCapturedAt = "";
let observedTrackedEntities: unknown;

const nova = {
  async observe(request: {
    imageBytes: Uint8Array;
    format: "jpeg";
    context: { spaceId: string; capturedAt: string };
  }) {
    novaCalls += 1;
    assert.deepEqual([...request.imageBytes], [...jpeg]);
    assert.equal(request.format, "jpeg");
    assert.equal(request.context.spaceId, "ring-playground");
    observedCapturedAt = request.context.capturedAt;
    observedTrackedEntities = (request.context as { trackedEntities?: unknown }).trackedEntities;
    return {
      state: {
        schemaVersion: "0.1" as const,
        spaceId: request.context.spaceId,
        capturedAt: request.context.capturedAt,
        entities: [],
      },
      rawText: "{}",
      modelId: "unit-nova",
      latencyMs: 7,
    };
  },
} as unknown as BedrockNovaVisionClient;

let now = 1_780_000_000_000;
const observer = new RingLiveFrameObserver({
  nova,
  maxFrameAgeMs: 5_000,
  waitMs: 1_000,
  now: () => now,
});

const capturedAt = new Date(now).toISOString();
observer.publish({
  spaceId: "ring-playground",
  imageBytes: jpeg,
  capturedAt,
});

const referenceState = {
  schemaVersion: "0.1" as const,
  spaceId: "ring-playground",
  capturedAt,
  entities: [{
    key: "desk.main",
    category: "desk",
    confidence: 0.98,
    attributes: { clear: true },
    relations: [],
  }],
};
const observation = await observer.inspect("ring-playground", { referenceState });
assert.equal(novaCalls, 1);
assert.deepEqual(
  observedTrackedEntities,
  [{
    key: "desk.main",
    category: "desk",
    description: "This is the checkpoint identity desk.main. Match the corresponding visible desk to this exact key; never replace, split, or rename it.",
    observableAttributes: {
      clear: "Observe only the current visible value for \"clear\" on this tracked entity. Omit it if the image does not support a value.",
    },
  }],
);
assert.equal(observedCapturedAt, capturedAt);
assert.equal(observation.state.spaceId, "ring-playground");
assert.equal(observation.evidenceMode, "vision");
assert.match(observation.observationId, /^ring-whep-/);

now += 6_000;
const waiting = observer.inspect("ring-playground");
const pending = observer.pendingRequest("ring-playground");
assert(pending, "A stale buffer must expose an on-demand fresh-frame request.");
assert.equal(pending.spaceId, "ring-playground");
queueMicrotask(() => observer.publish({
  spaceId: "ring-playground",
  imageBytes: jpeg,
  capturedAt: new Date(now).toISOString(),
}));
const refreshed = await waiting;
assert.equal(observer.pendingRequest("ring-playground"), undefined);
assert.equal(novaCalls, 2);
assert.equal(refreshed.state.capturedAt, new Date(now).toISOString());

await assert.rejects(
  async () => observer.publish({
    spaceId: "ring-playground",
    imageBytes: new Uint8Array([1, 2, 3]),
    capturedAt: new Date(now).toISOString(),
  }),
  /JPEG was invalid/,
);

console.log("PASS Ring live-frame observer: recent WHEP JPEG buffer + on-demand Nova + stale-frame refresh.");
