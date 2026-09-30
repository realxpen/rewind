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

assert.match(
  source,
  /function resetVerificationState\(\)/,
  "A new comparison must be able to clear the previous Rewind verification session.",
);
assert.match(
  source,
  /renderDiff = function renderFreshDiff\(result\) \{\s*resetVerificationState\(\);/,
  "Rendering a fresh DIFF must clear stale VERIFY state before presenting the new match.",
);
assert.match(
  source,
  /if \(verifyPanel && !verifyPanel\.hidden\) \{\s*const verified = \(el\('verifySummary'\)\?\.textContent \|\| ''\)\.match/,
  "The focused percentage must ignore an old hidden VERIFY summary.",
);
assert.match(
  source,
  /if \(verifyPanel && !verifyPanel\.hidden && verifyState === 'RESTORED' && currentPercentage === 100\)/,
  "The 100% RESTORED presentation must require an active visible VERIFY panel.",
);

console.log("PASS Ring VERIFY live refresh: fresh anchored verification + stale 100% state cannot override a new DIFF");