import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile("packages/ring/public/index.html", "utf8");
const bridge = await readFile("packages/ring/public/mcp-bridge.js", "utf8");

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
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Phase 10 UI must retain #${id}.`);
}

for (const stage of ["save", "diff", "rewind", "verify"]) {
  assert.match(html, new RegExp(`data-flow=["']${stage}["']`), `Workflow rail must include ${stage}.`);
}

assert.match(html, /Remember the state\. Forget the footage\./);
assert.match(html, /AI does not decide match/);
assert.match(html, /100% RESTORED/);
assert.match(html, /prefers-reduced-motion/);
assert.match(bridge, /MutationObserver/);
assert.match(bridge, /verifyState/);
assert.match(bridge, /playRestoredTone/);

// Parse without executing browser globals so plain JS syntax remains part of CI.
new Function(bridge);

console.log("PASS Phase 10 experience contract: critical controls + workflow rail + trust copy + responsive motion + browser JS syntax");
