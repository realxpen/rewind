import assert from "node:assert/strict";
import { RingClient } from "../src/client.js";
import { downloadLatestRingSnapshot, RingSnapshotObserver } from "../src/snapshot-observer.js";
import type { BedrockNovaVisionClient } from "../../vision/src/bedrock.js";

const token = "unit-secret-token";
let apiCalls = 0;
let downloadCalls = 0;
let novaCalls = 0;

const clientFetch: typeof fetch = async (input, init = {}) => {
  apiCalls += 1;
  const url = String(input);
  assert.equal(url, "https://api.amazonvision.com/v1/devices/device-1/media/image/download");
  const headers = new Headers(init.headers);
  assert.equal(headers.get("authorization"), `Bearer ${token}`);
  assert.equal(init.redirect, "manual");
  const body = JSON.parse(String(init.body)) as {
    type: string;
    start_timestamp: number;
    end_timestamp: number;
    image_options: { format: string };
  };
  assert.equal(body.type, "latest_in_range");
  assert.equal(body.image_options.format, "jpeg");
  assert(body.end_timestamp > body.start_timestamp);
  return new Response(null, {
    status: 303,
    headers: { Location: "https://download.example.test/v1/download?sig=abc" },
  });
};

const downloadFetch: typeof fetch = async (input, init = {}) => {
  downloadCalls += 1;
  assert.equal(String(input), "https://download.example.test/v1/download?sig=abc");
  const headers = new Headers(init.headers);
  assert.equal(headers.get("authorization"), null, "Bearer token must not be forwarded to the pre-signed media host.");
  const jpeg = Uint8Array.from([255, 216, 1, 2, 3, 255, 217]);
  return new Response(jpeg, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "X-Media-Timestamp": "1780000000000",
      "X-Media-Origin": "snapshot",
    },
  });
};

const client = new RingClient({
  baseUrl: "https://api.amazonvision.com",
  accessToken: token,
  devicesPath: "/v1/devices",
}, clientFetch);

const snapshot = await downloadLatestRingSnapshot(client, "device-1", {
  fetchImpl: downloadFetch,
  now: () => 1780000005000,
  lookbackMs: 60_000,
});
assert.equal(apiCalls, 1);
assert.equal(downloadCalls, 1);
assert.deepEqual([...snapshot.imageBytes], [255, 216, 1, 2, 3, 255, 217]);
assert.equal(snapshot.capturedAt, new Date(1780000000000).toISOString());
assert.equal(snapshot.mediaOrigin, "snapshot");

const nova = {
  async observe(request: {
    imageBytes: Uint8Array;
    format: "jpeg";
    context: { spaceId: string; capturedAt: string };
  }) {
    novaCalls += 1;
    assert.deepEqual([...request.imageBytes], [255, 216, 1, 2, 3, 255, 217]);
    assert.equal(request.format, "jpeg");
    assert.equal(request.context.spaceId, "ring-playground");
    return {
      state: {
        schemaVersion: "0.1" as const,
        spaceId: request.context.spaceId,
        capturedAt: request.context.capturedAt,
        entities: [],
      },
      rawText: "{}",
      modelId: "unit-nova",
      latencyMs: 7,
    };
  },
} as unknown as BedrockNovaVisionClient;

const observer = new RingSnapshotObserver({
  client,
  nova,
  deviceId: "device-1",
  fetchImpl: downloadFetch,
  now: () => 1780000005000,
  lookbackMs: 60_000,
});
const observed = await observer.inspect("ring-playground");
assert.equal(novaCalls, 1);
assert.equal(observed.state.spaceId, "ring-playground");
assert.match(observed.observationId, /^ring-snapshot-/);
assert.equal(observed.evidenceMode, "vision");

console.log("PASS Ring snapshot observer: safe redirect download + JPEG validation + Nova voice observation.");
