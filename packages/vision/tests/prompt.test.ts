import assert from "node:assert/strict";
import {
  buildNovaObservationPrompt,
  NOVA_PERCEPTION_SYSTEM_PROMPT,
} from "../src/index.js";

const prompt = buildNovaObservationPrompt({
  spaceId: "studio",
  capturedAt: "2026-09-06T10:30:00.000Z",
  trackedEntities: [
    { key: "chair.main", category: "chair" },
    { key: "tripod.camera", category: "tripod" },
  ],
});

assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /observe only/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /do NOT compare/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /below 0\.60/i);
assert.match(prompt, /chair\.main/);
assert.match(prompt, /tripod\.camera/);
assert.match(prompt, /Return JSON only/i);
assert.match(prompt, /NEAR/);
assert.match(prompt, /spaceId: "studio"/);

console.log("PASS vision prompt: observation-only + constrained keys + confidence contract");
