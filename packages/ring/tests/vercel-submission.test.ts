import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile("public/index.html", "utf8");
const app = await readFile("public/app.js", "utf8");
const api = await readFile("api/[...path].ts", "utf8");
const vercel = JSON.parse(await readFile("vercel.json", "utf8")) as {
  git?: { deploymentEnabled?: boolean };
  outputDirectory?: string;
  functions?: Record<string, { maxDuration?: number }>;
};

assert.match(html, /Ctrl\+Z for reality/);
assert.match(html, /Image \+ Alexa/);
assert.match(html, /Take photo/);
assert.match(html, /Analyze with Nova/);
assert.match(html, /semantic state only/i);
assert.match(app, /api\("observe"/);
assert.match(app, /capture="environment"|cameraInput/);
assert.match(app, /ask rewind memory to remember this room as desk baseline/i);
assert.match(api, /LATEST_OBSERVATION/);
assert.match(api, /persisted: "semantic-state-only"/);
assert.match(api, /alexa-relay/);
assert.match(api, /compareStates/);
assert.match(api, /buildRestorePlan/);
assert.match(api, /__rewind_runtime__:/);
assert.equal(vercel.git?.deploymentEnabled, true);
assert.equal(vercel.outputDirectory, "public");
assert.equal(vercel.functions?.["api/[...path].ts"]?.maxDuration, 60);

// Browser JS syntax remains valid.
new Function(app);

console.log("PASS Vercel submission contract: public photo UI + semantic-only persistence + Alexa relay + deterministic REWIND.");
