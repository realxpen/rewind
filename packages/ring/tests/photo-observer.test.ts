import assert from "node:assert/strict";
import { PhotoObserver } from "../src/photo-observer.js";
import type { BedrockNovaVisionClient } from "../../vision/src/bedrock.js";

const firstJpeg = new Uint8Array([255, 216, 1, 2, 3, 255, 217]);
const secondJpeg = new Uint8Array([255, 216, 9, 8, 7, 255, 217]);
let observedBytes: number[] = [];
let observedCapturedAt = "";
let observedTracked: unknown;

const nova = {
  async observe(request: {
    imageBytes: Uint8Array;
    format: "jpeg";
    context: { spaceId: string; capturedAt: string; trackedEntities?: unknown };
  }) {
    observedBytes = [...request.imageBytes];
    observedCapturedAt = request.context.capturedAt;
    observedTracked = request.context.trackedEntities;
    return {
      state: {
        schemaVersion: "0.1" as const,
        spaceId: request.context.spaceId,
        capturedAt: request.context.capturedAt,
        entities: [],
      },
      rawText: "{}",
      modelId: "unit-nova",
      latencyMs: 4,
    };
  },
} as unknown as BedrockNovaVisionClient;

const observer = new PhotoObserver({ nova });

await assert.rejects(
  observer.inspect("photo-space"),
  /No analyzed photo is ready/i,
);

const firstAt = "2026-09-25T12:00:00.000Z";
observer.publish({ spaceId: "photo-space", imageBytes: firstJpeg, capturedAt: firstAt });
assert.equal(observer.has("photo-space"), true);

const referenceState = {
  schemaVersion: "0.1" as const,
  spaceId: "photo-space",
  capturedAt: firstAt,
  entities: [{
    key: "notebook.left",
    category: "notebook",
    confidence: 0.98,
    attributes: { present: true, color: "turquoise", appearance: "turquoise spiral notebook" },
    relations: [],
  }],
};

const first = await observer.inspect("photo-space", { referenceState });
assert.deepEqual(observedBytes, [...firstJpeg]);
assert.equal(observedCapturedAt, firstAt);
assert(first.observationId.startsWith("photo-"));
assert.equal(first.evidenceMode, "vision");
assert(Array.isArray(observedTracked));
assert.match(JSON.stringify(observedTracked), /turquoise spiral notebook/);

const secondAt = "2026-09-25T12:01:00.000Z";
observer.publish({ spaceId: "photo-space", imageBytes: secondJpeg, capturedAt: secondAt });
await observer.inspect("photo-space");
assert.deepEqual(observedBytes, [...secondJpeg]);
assert.equal(observedCapturedAt, secondAt);

assert.throws(
  () => observer.publish({
    spaceId: "photo-space",
    imageBytes: new Uint8Array([1, 2, 3]),
    capturedAt: secondAt,
  }),
  /JPEG was invalid/,
);

console.log("PASS Photo observer: latest analyzed JPEG stays ephemeral and drives checkpoint-guided Alexa perception.");
