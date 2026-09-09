import { observationErrorMessage } from "../src/observation-error.js";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { once } from "node:events";
import { createPreviewServer } from "../src/preview-server.js";
import type { VisionObservationRequest } from "../../vision/src/contracts.js";
import { demoReady } from "../../physical-state-protocol/fixtures/studio.js";

let created = 0, deleted = 0, failDelete = false, failObserve = false;
let observed: VisionObservationRequest | undefined;
const preview = createPreviewServer({
  devices: async () => [{ id: "test-device", name: "Unit camera" }],
  start: async (id, offer) => { assert.equal(id, "test-device"); assert.equal(offer, "v=0\r\n"); created++; return { sdpAnswer: "unit-answer", sessionUrl: "https://ring.example.test/private-session" }; },
  stop: async url => { assert.equal(url, "https://ring.example.test/private-session"); if (failDelete) throw new Error("private upstream data"); deleted++; },
  observe: async request => { if (failObserve) throw new Error("secret SDK output"); observed = request; return { state: demoReady, rawText: "not returned", modelId: "test", latencyMs: 5 }; },
}, { html: "<!doctype html><title>REWIND</title>", js: "/* preview */" });
preview.server.listen(0, "127.0.0.1");
await once(preview.server, "listening");
const address = preview.server.address();
assert(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
const post = (path: string, data: unknown, origin = base) => fetch(`${base}/api/${path}`, {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(data),
});
try {
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.match(await page.text(), /REWIND/);
  assert.equal((await fetch(`${base}/preview.js`)).status, 200);
  assert.equal((await fetch(`${base}/api/devices`)).status, 200);
  const foreignHostStatus = await new Promise<number | undefined>((resolve, reject) => {
    const req = httpRequest(base, { headers: { Host: "attacker.example" } }, res => { res.resume(); resolve(res.statusCode); });
    req.on("error", reject); req.end();
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await post("start", {}, "https://attacker.example")).status, 403);
  assert.equal((await post("start", { deviceId: "other", offer: "v=0\r\n" })).status, 400);
  assert.equal(created, 0);
  const response = await post("start", { deviceId: "test-device", offer: "v=0\r\n" });
  assert.equal(response.status, 201);
  const session = await response.json() as { id: string; answer: string; sessionUrl?: string };
  assert.equal(session.answer, "unit-answer"); assert.equal(session.sessionUrl, undefined);
  assert.equal((await post("start", { deviceId: "test-device", offer: "v=0\r\n" })).status, 409);
  assert.equal(created, 1);
  assert.equal((await post("stop", { id: "wrong" })).status, 404);
  assert.equal(deleted, 0);
  assert.equal((await post("heartbeat", { id: session.id })).status, 200);
  failDelete = true;
  const failed = await post("stop", { id: session.id });
  assert.equal(failed.status, 502); assert.doesNotMatch(await failed.text(), /private upstream/);
  failDelete = false;
  assert.equal((await post("stop", { id: session.id })).status, 200);
  assert.equal(deleted, 1);
  assert.equal((await post("observe", { image: "bad", spaceId: "unit", capturedAt: new Date().toISOString() })).status, 400);
  const frame = { image: Buffer.from([255, 216, 255, 217]).toString("base64"), spaceId: "unit-space", capturedAt: "2026-09-09T10:00:00.000Z" };
  const result = await post("observe", frame);
  assert.equal(result.status, 200);
  assert.doesNotMatch(await result.text(), /rawText|not returned/);
  assert.equal(observed?.format, "jpeg"); assert.equal(observed?.context.spaceId, frame.spaceId);
  assert.equal(observed?.context.capturedAt, frame.capturedAt);
  assert.deepEqual(observed?.imageBytes, Buffer.from([255, 216, 255, 217]));
  failObserve = true;
  const novaError = await post("observe", frame);
  assert.equal(novaError.status, 502); assert.doesNotMatch(await novaError.text(), /secret SDK/);
  assert.equal((await post("observe", { ...frame, spaceId: "" })).status, 400);
  await post("start", { deviceId: "test-device", offer: "v=0\r\n" });
  await preview.cleanup(); assert.equal(deleted, 2);
  console.log("PASS ring preview: discovery + origin guard + session lifecycle/retry + frame validation + Nova handoff + cleanup");
} finally {
  preview.server.close(); preview.server.closeAllConnections();
}

for (const name of ["CredentialsProviderError", "ExpiredTokenException", "AccessDeniedException", "ValidationException", "ResourceNotFoundException", "TimeoutError"]) {
  const message = observationErrorMessage({ name, message: "secret-token-and-image" });
  assert.doesNotMatch(message, /unclassified|secret-token/);
}
assert.match(observationErrorMessage({ name: "CredentialsProviderError" }), /credentials were not found/);
assert.match(observationErrorMessage({ name: "VisionContractError", code: "SCHEMA_REJECTED", message: "private model response" }), /Nova responded.*SCHEMA_REJECTED/);
assert.doesNotMatch(observationErrorMessage({ name: "VisionContractError", code: "private-unknown-code" }), /private-unknown/);
assert.match(observationErrorMessage({ name: "toString" }), /unclassified/);
assert.match(observationErrorMessage(null), /unclassified/);
console.log("PASS Nova diagnostics: credentials + access + request configuration + response validation + secret redaction");
