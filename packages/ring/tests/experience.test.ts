import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile("packages/ring/public/index.html", "utf8");
const bridge = await readFile("packages/ring/public/mcp-bridge.js", "utf8");
const verify = await readFile("packages/ring/public/verify.js", "utf8");
const consumer = await readFile("packages/ring/public/consumer.js", "utf8");

for (const id of [
  "devices",
  "start",
  "stop",
  "space",
  "video",
  "status",
  "agentPrompt",
  "agentSend",
  "capture",
  "snapshot",
  "observe",
  "saveCheckpoint",
  "checkpoints",
  "diffPanel",
  "matchScore",
  "startRewind",
  "rewindPanel",
  "rewindState",
  "verifyPanel",
  "verifyState",
  "checkAgain",
  "progressValue",
  "progressBar",
  "completion",
  "dismissCompletion",
  "focusCard",
  "focusStage",
  "focusTitle",
  "focusMetric",
  "focusList",
  "focusPrimary",
  "demoToolbarMount",
  "liveRingDetails",
  "advancedDetails",
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Phase 12 UI must retain #${id}.`);
}

for (const stage of ["save", "diff", "rewind", "verify"]) {
  assert.match(html, new RegExp(`data-flow=["']${stage}["']`), `Workflow rail must include ${stage}.`);
}

assert.match(html, /Remember the state\. Forget the footage\./);
assert.match(html, /AI observes\. Deterministic code decides\./);
assert.match(html, /AI does not decide match/);
assert.match(html, /Advanced details/);
assert.match(html, /Live Ring proof/);
assert.match(html, /100% RESTORED/);
assert.match(html, /prefers-reduced-motion/);
assert.match(bridge, /MutationObserver/);
assert.match(bridge, /verifyState/);
assert.match(bridge, /playRestoredTone/);

// Controlled Demo must remain explicitly disclosed and limited to server-owned named scenarios.
assert.match(bridge, /Live Ring/);
assert.match(bridge, /Controlled Demo/);
assert.match(bridge, /Never presented as live camera truth/);
assert.match(bridge, /validated semantic fixtures, not frames from the Ring Playground/);
assert.match(bridge, /demo-ready/);
assert.match(bridge, /messy/);
assert.match(bridge, /partial/);
assert.match(bridge, /restored/);
assert.match(bridge, /api\('demo\/observe'/);
assert.match(bridge, /Demo Ready \(Controlled\)/);
assert.match(bridge, /same deterministic checkpoint, diff, restore-plan, and verification endpoints/);

// The focused Demo Mode mirrors existing deterministic UI truth; it does not create a new truth path.
assert.match(verify, /Phase 12 focused Demo Mode\. Presentation only; deterministic services retain authority\./);
assert.match(verify, /Compare current state/);
assert.match(verify, /Start Rewind/);
assert.match(verify, /Check Again/);
assert.match(verify, /100% RESTORED/);
assert.match(verify, /saveControlledBaseline/);
assert.match(verify, /compareControlledBaseline/);
assert.match(verify, /startRewind/);
assert.match(verify, /checkAgain/);
assert.match(verify, /Controlled Demo — validated semantic fixtures/);
assert.match(verify, /Live Ring is real camera evidence/);

// Everyday photo mode is a real observation source, not a fake fixture path.
assert.match(consumer, /Phase 12 everyday photo flow\. Reuses the same Nova → PSP → deterministic REWIND services\./);
assert.match(consumer, /section\.id = 'consumerPhotoFlow'/);
for (const id of [
  "consumerSpaceName",
  "consumerStateName",
  "consumerSavedState",
  "consumerCameraInput",
  "consumerPhotoInput",
  "consumerTakePhoto",
  "consumerUploadPhoto",
  "consumerAnalyzePhoto",
  "consumerSaveState",
  "consumerCompareState",
]) {
  assert.match(consumer, new RegExp(`id=["']${id}["']`), `Consumer photo flow must expose #${id}.`);
}
assert.match(consumer, /accept="image\/\*"/);
assert.match(consumer, /capture="environment"/);
assert.match(consumer, /api\('observe'/);
assert.match(consumer, /api\('checkpoints'/);
assert.match(consumer, /compareCheckpoint\(savedState\.value\)/);
assert.match(consumer, /latestObservationId = observation\.observationId/);
assert.match(consumer, /activeRewindSessionId/);
assert.match(consumer, /uploaded image is not persisted by REWIND/);
assert.doesNotMatch(consumer, /api\('demo\/observe'/, "Phone photo mode must not use Controlled Demo fixtures.");

// The experience observer watches matchScore, so writes back to matchScore must be
// idempotent. Otherwise a same-value textContent write can recursively schedule the
// observer forever and starve the browser's first paint/reload.
assert.match(bridge, /function setText\(node, value\)/);
assert.match(bridge, /node\.textContent !== value/);
assert.match(bridge, /setText\(matchScore, '—'\)/);
assert.doesNotMatch(bridge, /matchScore\.textContent\s*=\s*['"]—['"]/);

// Parse without executing browser globals so plain JS syntax remains part of CI.
new Function(bridge);
new Function(verify);
new Function(consumer);

console.log("PASS Phase 12 experience contract: focused workflow + everyday photo mode + controlled/live separation + deterministic action delegation + browser JS syntax");
