import assert from "node:assert/strict";
import {
  buildNovaObservationPrompt,
  NOVA_PERCEPTION_SYSTEM_PROMPT,
} from "../src/index.js";

const prompt = buildNovaObservationPrompt({
  spaceId: "studio",
  capturedAt: "2026-09-06T10:30:00.000Z",
  trackedEntities: [
    {
      key: "desk.main",
      category: "desk",
      observableAttributes: {
        clear: "boolean describing whether the visible work surface is clear",
      },
    },
    { key: "tripod.camera", category: "tripod" },
    {
      key: "lamp.left",
      category: "lamp",
      observableAttributes: {
        powered: "boolean describing whether the lamp is visibly illuminated",
      },
    },
  ],
});

assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /observe only/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /do NOT compare/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /below 0\.60/i);
assert.match(prompt, /desk\.main/);
assert.match(prompt, /attribute "clear"/i);
assert.match(prompt, /attribute "powered"/i);
assert.match(prompt, /exact supplied attribute key/i);
assert.match(prompt, /clearly absent/i);
assert.match(prompt, /confidence below 0\.60/i);
assert.match(prompt, /Relations are written on the subject entity/i);
assert.match(prompt, /never the reverse/i);
assert.match(prompt, /tripod\.camera/);
assert.match(prompt, /Return JSON only/i);
assert.match(prompt, /NEAR/);
assert.match(prompt, /spaceId: "studio"/);

console.log(
  "PASS vision prompt: observation-only + tracked attributes + absence/uncertainty contract",
);
