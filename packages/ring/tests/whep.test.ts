import assert from "node:assert/strict";
import { RingClient, startWhepSession, endWhepSession } from "../src/index.js";

// Deliberately minimal fixtures, never real Playground SDP or credentials.
const config = { baseUrl: "https://ring.example.test", accessToken: "unit-test-only", devicesPath: "/devices" };
const offer = "v=0\r\ns=unit-offer\r\n";
const answer = "v=0\r\ns=unit-answer\r\n";
const sessionUrl = `${config.baseUrl}/sessions/unit-session`;
const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
const client = new RingClient(config, async (input, init) => {
  calls.push({ url: String(input), init });
  return init?.method === "DELETE"
    ? new Response(null, { status: 204 })
    : new Response(answer, { status: 201, headers: { Location: sessionUrl } });
});
const session = await startWhepSession(client, "unit/device", offer);
assert.deepEqual(session, { sdpAnswer: answer, sessionUrl });
assert.equal(calls[0]?.url, `${config.baseUrl}/v1/devices/unit%2Fdevice/media/streaming/whep/sessions`);
assert.equal(calls[0]?.init?.method, "POST");
assert.equal(calls[0]?.init?.body, offer);
const headers = new Headers(calls[0]?.init?.headers);
assert.equal(headers.get("Authorization"), "Bearer unit-test-only");
assert.equal(headers.get("Content-Type"), "application/sdp");
assert.equal(headers.get("Accept"), "application/sdp");
assert.equal(calls[0]?.init?.redirect, "error");
await endWhepSession(client, session.sessionUrl);
assert.equal(calls[1]?.url, sessionUrl);
assert.equal(calls[1]?.init?.method, "DELETE");
assert.equal(calls[1]?.init?.body, undefined);
assert.equal(new Headers(calls[1]?.init?.headers).get("Authorization"), "Bearer unit-test-only");

for (const location of [undefined, "", "   "]) {
  const missing = new RingClient(config, async () => new Response(answer, {
    status: 201, headers: location === undefined ? {} : { Location: location },
  }));
  await assert.rejects(() => startWhepSession(missing, "unit", offer), /missing Location/);
}
for (const status of [200, 202, 400, 401, 500]) {
  const bad = new RingClient(config, async () => new Response("sensitive-response-must-not-leak", { status }));
  await assert.rejects(() => startWhepSession(bad, "unit", offer), { message: `Ring WHEP create expected 201, received ${status}` });
}
for (const status of [200, 202, 204]) {
  await endWhepSession(new RingClient(config, async () => new Response(null, { status })), sessionUrl);
}
await assert.rejects(() => endWhepSession(new RingClient(config, async () => new Response("private", { status: 403 })), sessionUrl), { message: "Ring WHEP delete failed: 403" });
const relative = new RingClient(config, async () => new Response(answer, { status: 201, headers: { Location: "/sessions/relative" } }));
assert.equal((await startWhepSession(relative, "unit", offer)).sessionUrl, `${config.baseUrl}/sessions/relative`);
const count = calls.length;
await assert.rejects(() => endWhepSession(client, "https://other.example.test/session"), /request failed/);
assert.equal(calls.length, count);
const foreign = new RingClient(config, async () => new Response(answer, { status: 201, headers: { Location: "https://other.example.test/session" } }));
await assert.rejects(() => startWhepSession(foreign, "unit", offer), /configured API origin/);
await assert.rejects(() => startWhepSession(client, "", offer), /device ID/);
await assert.rejects(() => startWhepSession(client, "unit", "  "), /SDP offer/);
await assert.rejects(() => endWhepSession(client, ""), /session URL/);
const offline = new RingClient(config, async () => { throw new Error("private URL"); });
await assert.rejects(() => startWhepSession(offline, "unit", offer), { message: "Ring API request failed" });
console.log("PASS ring WHEP: create + SDP/auth + Location + status/errors + DELETE + origin guard");
