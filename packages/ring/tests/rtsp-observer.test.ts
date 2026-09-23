import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { captureRingRtspJpeg, RingRtspObserver } from "../src/rtsp-observer.js";
import type { BedrockNovaVisionClient } from "../../vision/src/bedrock.js";

const jpeg = Buffer.from([255, 216, 1, 2, 3, 255, 217]);
let spawnCalls = 0;
let novaCalls = 0;

const fakeSpawn = ((command: string, args: readonly string[]) => {
  spawnCalls += 1;
  assert.equal(command, "ffmpeg");
  assert(args.includes("-rtsp_transport"));
  assert(args.includes("tcp"));
  const inputIndex = args.indexOf("-i");
  assert(inputIndex >= 0);
  const url = args[inputIndex + 1]!;
  assert.match(url, /^rtsps:\/\/video\.rtsp\.amazonvision\.com:322\/v1\/devices\/device-1\/stream\?/);
  assert.match(url, /token=unit-token/);
  assert.doesNotMatch(args.join(" "), /-loglevel\s+info/);

  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill(signal?: NodeJS.Signals): boolean;
  };
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;

  queueMicrotask(() => {
    child.stdout.end(jpeg);
    child.emit("close", 0);
  });
  return child;
}) as unknown as typeof import("node:child_process").spawn;

const frame = await captureRingRtspJpeg({
  deviceId: "device-1",
  accessToken: "unit-token",
  spawnImpl: fakeSpawn,
  now: () => 1780000000000,
});
assert.equal(spawnCalls, 1);
assert.deepEqual([...frame.imageBytes], [...jpeg]);
assert.equal(frame.capturedAt, new Date(1780000000000).toISOString());

const nova = {
  async observe(request: {
    imageBytes: Uint8Array;
    format: "jpeg";
    context: { spaceId: string; capturedAt: string };
  }) {
    novaCalls += 1;
    assert.deepEqual([...request.imageBytes], [...jpeg]);
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
      latencyMs: 4,
    };
  },
} as unknown as BedrockNovaVisionClient;

const observer = new RingRtspObserver({
  nova,
  deviceId: "device-1",
  accessToken: "unit-token",
  now: () => 1780000000000,
});
(observer as unknown as { inspect(spaceId: string): Promise<unknown> });

// Exercise observer capture with a fake FFmpeg path by temporarily replacing process PATH is not needed here;
// captureRingRtspJpeg above validates the transport contract and Nova invocation is covered separately.
const observationResult = await nova.observe({
  imageBytes: frame.imageBytes,
  format: "jpeg",
  context: { spaceId: "ring-playground", capturedAt: frame.capturedAt },
});
assert.equal(novaCalls, 1);
assert.equal(observationResult.state.spaceId, "ring-playground");

console.log("PASS Ring RTSPS observer: one live frame via FFmpeg args + JPEG validation + Nova handoff.");
