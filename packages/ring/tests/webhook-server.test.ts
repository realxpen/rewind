import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { createRingWebhookServer } from "../src/webhook-server.js";

const key = "test-ring-hmac-secret";
const origin = "http://127.0.0.1:3002";
const webhook = createRingWebhookServer({ signingKey: key, allowedOrigins: [origin] });
webhook.server.listen(0, "127.0.0.1");
await once(webhook.server, "listening");
const address = webhook.server.address();
assert(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;

function body(requestId = "req-1", type = "motion_detected") {
  return Buffer.from(JSON.stringify({
    meta: {
      version: "1.1",
      time: "2026-09-10T09:00:00Z",
      request_id: requestId,
      account_id: "ava1.ring.account.test",
    },
    data: {
      id: `event-${requestId}`,
      type,
      attributes: {
        source: "ava1.ring.device.test",
        source_type: "devices",
        timestamp: 1789030800000,
        sub_type: "motion",
      },
    },
  }));
}

function signature(raw: Buffer) {
  return `sha256=${createHmac("sha256", key).update(raw).digest("hex")}`;
}

async function post(raw: Buffer, sig = signature(raw)) {
  return fetch(`${base}/webhooks/ring`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": sig,
    },
    body: raw,
  });
}

try {
  const firstBody = body();
  const first = await post(firstBody);
  assert.equal(first.status, 202);
  assert.equal((await first.json() as { status: string }).status, "accepted");

  const duplicate = await post(firstBody);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json() as { status: string }).status, "duplicate");

  const badSignature = await post(body("req-bad"), "sha256=" + "0".repeat(64));
  assert.equal(badSignature.status, 401);

  const ignored = await post(body("req-online", "device_online"));
  assert.equal(ignored.status, 202);
  assert.equal((await ignored.json() as { status: string }).status, "ignored");

  const deniedPoll = await fetch(`${base}/events?cursor=0`);
  assert.equal(deniedPoll.status, 403);

  const eventsResponse = await fetch(`${base}/events?cursor=0`, { headers: { Origin: origin } });
  assert.equal(eventsResponse.status, 200);
  assert.equal(eventsResponse.headers.get("access-control-allow-origin"), origin);
  const events = await eventsResponse.json() as {
    cursor: number;
    events: Array<{ requestId: string; type: string; deviceId: string }>;
  };
  assert.equal(events.cursor, 1);
  assert.equal(events.events.length, 1);
  assert.equal(events.events[0].requestId, "req-1");
  assert.equal(events.events[0].type, "motion_detected");
  assert.equal(events.events[0].deviceId, "ava1.ring.device.test");

  console.log("PASS Phase 7 webhook ingress: signed motion accepted once, spoof rejected, duplicates suppressed");
} finally {
  webhook.server.close();
  webhook.server.closeAllConnections();
}
