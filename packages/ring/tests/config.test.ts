import assert from "node:assert/strict";
import { loadRingConfig } from "../src/config.js";

const config = loadRingConfig({
  RING_API_BASE_URL: "https://ring.example.test/",
  RING_ACCESS_TOKEN: "test-token",
  RING_DEVICES_PATH: "sandbox/devices",
  RING_EVENTS_PATH: "/sandbox/events",
});

assert.equal(config.baseUrl, "https://ring.example.test");
assert.equal(config.accessToken, "test-token");
assert.equal(config.devicesPath, "/sandbox/devices");
assert.equal(config.eventsPath, "/sandbox/events");
assert.throws(() => loadRingConfig({}), /RING_API_BASE_URL/);
assert.throws(
  () => loadRingConfig({ RING_API_BASE_URL: "https://ring.example.test" }),
  /RING_ACCESS_TOKEN/,
);

console.log("PASS ring config: validates placeholders and normalizes paths");
