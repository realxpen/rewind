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
    {
      key: "tripod.camera",
      category: "tripod",
      observableRelations: [
        {
          type: "NEAR",
          target: "cabinet.main",
          description: "Re-check whether tripod.camera is still NEAR cabinet.main.",
        },
      ],
    },
    {
      key: "lamp.left",
      category: "lamp",
      observableAttributes: {
        powered: "boolean describing whether the lamp is visibly illuminated",
      },
    },
    { key: "cabinet.main", category: "cabinet" },
  ],
});

const untrackedPrompt = buildNovaObservationPrompt({
  spaceId: "bedroom",
  capturedAt: "2026-09-17T10:30:00.000Z",
});

assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /observe only/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /do NOT compare/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /below 0\.60/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /Every entity key.*MUST be unique/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /identity contract/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /Never split one tracked object/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /QUESTION TO RE-CHECK/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /explicitly inspect whether that exact relation is still visually true/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /emit the exact same relation type and target/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /lamp\.bedside/);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /plant\.desk/);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /at most 24 entities/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /no more than 8 high-confidence, restoration-relevant untracked extras/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /COMPLETE JSON object/i);
assert.match(prompt, /desk\.main/);
assert.match(prompt, /attribute "clear"/i);
assert.match(prompt, /attribute "powered"/i);
assert.match(prompt, /checkpoint relation NEAR -> "cabinet\.main"/i);
assert.match(prompt, /Re-check whether tripod\.camera is still NEAR cabinet\.main/i);
assert.match(prompt, /Every supplied checkpoint relation must be explicitly re-evaluated/i);
assert.match(prompt, /do not replace ON with NEAR/i);
assert.match(prompt, /exact supplied attribute key/i);
assert.match(prompt, /clearly absent/i);
assert.match(prompt, /confidence below 0\.60/i);
assert.match(prompt, /Relations are written on the subject entity/i);
assert.match(prompt, /never the reverse/i);
assert.match(prompt, /tripod\.camera/);
assert.match(prompt, /Every entity key MUST be unique/i);
assert.match(prompt, /Never rename a supplied tracked key/i);
assert.match(prompt, /Never split one supplied tracked entity/i);
assert.match(prompt, /Never emit an untracked alias for a tracked entity/i);
assert.match(prompt, /scan the complete entities array once for duplicate keys/i);
assert.match(prompt, /final uniqueness check/i);
assert.match(prompt, /final completeness check/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /DELTA SCAN/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /boolean "clear" attribute/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /"present": true/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /"present": false/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /relevant support\/location area is visible and not occluded/i);
assert.match(NOVA_PERCEPTION_SYSTEM_PROMPT, /clear absence must be represented by the tracked entity itself with "present": false, never by omission/i);
assert.match(buildNovaObservationPrompt({
  spaceId: "photo-space",
  capturedAt: "2026-09-25T13:00:00.000Z",
  trackedEntities: [{
    key: "notebook.red",
    category: "notebook",
    observableAttributes: { present: "checkpoint presence" },
  }],
}), /never represent clear absence by omission/i);
assert.match(untrackedPrompt, /present=true/i);
assert.match(prompt, /final DELTA SCAN/i);
assert.match(prompt, /at most 8 genuinely additional high-confidence restoration-relevant extras/i);
assert.match(untrackedPrompt, /conservative, unique semantic keys/i);
assert.match(untrackedPrompt, /at most 24 entities total/i);
assert.match(untrackedPrompt, /role\/location qualifiers/i);
assert.match(prompt, /Return JSON only/i);
assert.match(prompt, /NEAR/);
assert.match(prompt, /spaceId: "studio"/);

console.log(
  "PASS vision prompt: observation-only + tracked attributes + checkpoint relation rechecks + stable identity contract",
);
