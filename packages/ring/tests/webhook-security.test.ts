import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  parseRingWebhookEnvelope,
  sanitizeRingWebhookEvent,
  verifyRingWebhookSignature,
} from "../src/webhook-security.js";

const key = "test-ring-hmac-secret";
const raw = Buffer.from(`{\n  "meta": {"version":"1.1","time":"2026-09-10T09:00:00Z","request_id":"req-1","account_id":"ava1.ring.account.test"},\n  "data": {"id":"event-1","type":"motion_detected","attributes":{"source":"ava1.ring.device.test","source_type":"devices","timestamp":1789030800000,"sub_type":"motion","component_ids":["0"]}}\n}`);
const signature = `sha256=${createHmac("sha256", key).update(raw).digest("hex")}`;

assert.equal(verifyRingWebhookSignature(key, raw, signature), true);
assert.equal(verifyRingWebhookSignature(key, Buffer.from(raw.toString("utf8") + " "), signature), false);
assert.equal(verifyRingWebhookSignature(key, raw, "sha256=deadbeef"), false);
assert.equal(verifyRingWebhookSignature(key, raw, undefined), false);

const reparsed = JSON.parse(raw.toString("utf8"));
const reserialized = Buffer.from(JSON.stringify(reparsed));
assert.equal(
  verifyRingWebhookSignature(key, reserialized, signature),
  false,
  "Signature verification must use the exact raw bytes, never re-serialized JSON.",
);

const envelope = parseRingWebhookEnvelope(raw);
const event = sanitizeRingWebhookEvent(envelope);
assert.equal(event.requestId, "req-1");
assert.equal(event.eventId, "event-1");
assert.equal(event.type, "motion_detected");
assert.equal(event.deviceId, "ava1.ring.device.test");
assert.equal(event.subType, "motion");
assert.deepEqual(event.componentIds, ["0"]);

assert.throws(
  () => parseRingWebhookEnvelope(Buffer.from('{"meta":{"version":"1.0"}}')),
  /Invalid Ring webhook envelope|Unsupported Ring webhook version/,
);

console.log("PASS Ring webhook security: raw-byte HMAC + constant-time verification + v1.1 parsing");
