import assert from "node:assert/strict";
import { normalizeRingEvent, normalizeRingEvents } from "../src/events.js";

const event = normalizeRingEvent({
  event_id: "evt-1",
  device_id: "device-1",
  event_type: "motion",
  created_at: "2026-09-08T10:00:00.000Z",
  snapshot_url: "https://media.example.test/snapshot.jpg",
});

assert.equal(event.id, "evt-1");
assert.equal(event.deviceId, "device-1");
assert.equal(event.type, "motion");
assert.equal(event.occurredAt, "2026-09-08T10:00:00.000Z");
assert.equal(event.media.length, 1);
assert.equal(event.media[0]?.kind, "snapshot");
assert.throws(() => normalizeRingEvent({ type: "motion" }), /deviceId/);

const events = normalizeRingEvents({
  events: [
    { id: "evt-2", deviceId: "device-2", type: "ding", occurredAt: "2026-09-08T10:01:00.000Z" },
    { id: "bad" },
  ],
});

assert.equal(events.length, 1);
assert.equal(events[0]?.id, "evt-2");

console.log("PASS ring events: normalizes event payloads and media references");
