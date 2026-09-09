import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

// Exercise the shipped browser helper without a live camera or network/timer delays.
const source = await readFile("packages/ring/public/preview.js", "utf8");
const helper = source.slice(source.indexOf("function gatherIce("), source.indexOf("async function waitForVideo("));
for (const mode of ["already-complete", "event-complete", "never-complete"] as const) {
  let timeout: (() => void) | undefined;
  let listener: (() => void) | undefined;
  let cleared = false;
  const pc = {
    iceGatheringState: mode === "already-complete" ? "complete" : "gathering",
    addEventListener: (_event: string, fn: () => void) => { listener = fn; },
    removeEventListener: (_event: string, fn: () => void) => { assert.equal(listener, fn); listener = undefined; },
  };
  const gather = runInNewContext(`${helper}; gatherIce`, {
    setTimeout: (fn: () => void, ms: number) => { assert.equal(ms, 3000); timeout = fn; return 1; },
    clearTimeout: (id: number) => { assert.equal(id, 1); cleared = true; },
  }) as (pc: unknown) => Promise<void>;
  let resolved = false;
  const pending = gather(pc).then(() => { resolved = true; });
  if (mode !== "already-complete") {
    await Promise.resolve(); assert.equal(resolved, false);
    if (mode === "event-complete") { pc.iceGatheringState = "complete"; listener!(); }
    else timeout!();
  }
  await pending;
  assert.equal(resolved, true);
  assert.equal(cleared, true);
  assert.equal(listener, undefined);
}
console.log("PASS ring ICE: complete + completion event + bounded fallback without completion + cleanup");
