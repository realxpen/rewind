import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("packages/ring/public/verify.js", "utf8");

assert.match(
  source,
  /const canCaptureFreshLiveState = videoReady\(\);/,
  "VERIFY must enable Check Again when a fresh live frame can be captured.",
);
assert.doesNotMatch(
  source,
  /button\.disabled = !activeRewindSessionId \|\| !latestObservationId \|\| latestObservationId === lastVerifiedObservationId/,
  "Starting Rewind must not permanently disable Check Again until another workflow creates an observation.",
);
assert.match(
  source,
  /status\('Capturing a fresh live state for verification…'\);/,
  "Check Again must capture a fresh live state itself.",
);
assert.match(
  source,
  /activeRewindCheckpointId = result\.checkpoint\.id;/,
  "Rewind must retain the active checkpoint identity for subsequent verification observations.",
);
const anchoredObservationUses = source.match(/checkpointId: activeRewindCheckpointId/g) ?? [];
assert(
  anchoredObservationUses.length >= 2,
  "Manual and motion verification observations must both be anchored to the active checkpoint.",
);
assert.match(
  source,
  /if \(!videoReady\(\)\) throw new Error\('Live video is not ready for verification\.'\);/,
  "Verification frame capture should support whichever selected live source is currently ready.",
);

console.log("PASS Ring VERIFY live refresh: Check Again captures fresh anchored state and remains usable after Start Rewind");
