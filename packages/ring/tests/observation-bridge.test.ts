import assert from "node:assert/strict";
import { demoReady } from "../../physical-state-protocol/fixtures/studio.js";
import { RingObservationBridge } from "../src/observation-bridge.js";

const bridge = new RingObservationBridge(2_000);

const waiting = bridge.inspect("studio");
const request = bridge.pendingRequest("studio");
assert(request, "Expected pending observation request.");
assert.equal(request.spaceId, "studio");

bridge.publish({
  observationId: "trusted-observation-1",
  spaceId: "studio",
  state: structuredClone(demoReady),
  modelId: "amazon.nova-2-lite-v1:0",
  latencyMs: 123,
  receivedAt: Date.now(),
});

const observation = await waiting;
assert.equal(observation.observationId, "trusted-observation-1");
assert.equal(observation.state.spaceId, "studio");
assert.equal(bridge.pendingRequest("studio"), undefined);

const second = bridge.inspect("studio");
await assert.rejects(() => bridge.inspect("studio"), /already being requested/);
bridge.publish({
  observationId: "wrong-space",
  spaceId: "other",
  state: { ...structuredClone(demoReady), spaceId: "other" },
  receivedAt: Date.now(),
});
assert(bridge.pendingRequest("studio"), "Wrong-space observation must not resolve studio request.");
bridge.publish({
  observationId: "trusted-observation-2",
  spaceId: "studio",
  state: structuredClone(demoReady),
  receivedAt: Date.now(),
});
assert.equal((await second).observationId, "trusted-observation-2");

console.log("PASS Ring observation bridge: MCP requests fresh trusted Ring/Nova state on demand.");
