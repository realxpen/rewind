import assert from "node:assert/strict";
import {
  buildNovaConverseInput,
  DEFAULT_NOVA_MODEL_ID,
} from "../src/index.js";

const input = buildNovaConverseInput({
  imageBytes: new Uint8Array([137, 80, 78, 71]),
  format: "png",
  context: {
    spaceId: "studio",
    capturedAt: "2026-09-06T10:30:00.000Z",
  },
});

assert.equal(input.modelId, DEFAULT_NOVA_MODEL_ID);
assert.equal(input.inferenceConfig?.temperature, 0);
assert.equal(input.inferenceConfig?.topP, 0.1);
assert.equal(input.messages?.length, 1);

const firstContent = input.messages?.[0]?.content?.[0];
assert.ok(firstContent && "image" in firstContent);
if (firstContent && "image" in firstContent && firstContent.image) {
  assert.equal(firstContent.image.format, "png");
  const source = firstContent.image.source;
  assert.ok(source && "bytes" in source, "Expected inline image bytes.");
  if (source && "bytes" in source) {
    assert.deepEqual(source.bytes, new Uint8Array([137, 80, 78, 71]));
  }
}

console.log("PASS vision request: Nova Converse multimodal image input + low-temperature config");
