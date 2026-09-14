import assert from "node:assert/strict";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemorySessionContinuityStore } from "../../agent-orchestrator/src/index.js";
import { createPhase9FixtureToolService } from "../src/fixture.js";
import { createRewindMcpHttpApp } from "../src/http.js";

const app = createRewindMcpHttpApp({
  toolService: createPhase9FixtureToolService(),
  continuity: new InMemorySessionContinuityStore(),
  actorId: "phase9-test-user",
  sessionId: "phase9-test-session",
  defaultSpaceId: "studio",
});

const http = app.listen(0, "127.0.0.1");
await once(http, "listening");
const address = http.address();
assert(address && typeof address === "object");

const client = new Client({ name: "rewind-phase9-gate", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`));

try {
  await client.connect(transport);

  const listed = await client.listTools();
  const names = listed.tools.map(tool => tool.name);
  for (const required of ["save_checkpoint", "compare_checkpoint", "start_rewind", "verify_rewind"]) {
    assert(names.includes(required), `Missing MCP tool: ${required}`);
  }

  const saved = await client.callTool({
    name: "save_checkpoint",
    arguments: { name: "Demo Ready", spaceId: "studio" },
  });
  assert.equal(saved.isError, undefined);
  const savedBody = saved.structuredContent as Record<string, unknown>;
  assert.equal(savedBody.name, "Demo Ready");
  assert.equal(typeof savedBody.id, "string");

  const compared = await client.callTool({
    name: "compare_checkpoint",
    arguments: { spaceId: "studio", checkpointId: savedBody.id },
  });
  assert.equal(compared.isError, undefined);
  const compareBody = compared.structuredContent as Record<string, unknown>;
  const compareMatch = compareBody.match as Record<string, unknown>;
  assert.equal(compareMatch.restored, false);
  assert(Number(compareMatch.percentage) < 100);

  const started = await client.callTool({
    name: "start_rewind",
    arguments: { spaceId: "studio", checkpointId: savedBody.id },
  });
  assert.equal(started.isError, undefined);
  const startBody = started.structuredContent as Record<string, unknown>;
  assert.equal(startBody.state, "GUIDING");
  assert.equal(typeof startBody.rewindSessionId, "string");

  const partial = await client.callTool({
    name: "verify_rewind",
    arguments: { spaceId: "studio", rewindSessionId: startBody.rewindSessionId },
  });
  assert.equal(partial.isError, undefined);
  const partialBody = partial.structuredContent as Record<string, unknown>;
  const partialMatch = partialBody.match as Record<string, unknown>;
  assert.equal(partialBody.state, "GUIDING");
  assert(Number(partialMatch.percentage) < 100);

  const restored = await client.callTool({
    name: "verify_rewind",
    arguments: { spaceId: "studio", rewindSessionId: startBody.rewindSessionId },
  });
  assert.equal(restored.isError, undefined);
  const restoredBody = restored.structuredContent as Record<string, unknown>;
  const restoredMatch = restoredBody.match as Record<string, unknown>;
  assert.equal(restoredBody.state, "RESTORED");
  assert.equal(restoredMatch.percentage, 100);
  assert.equal(restoredMatch.restored, true);

  console.log("PASS Phase 9 MCP: save → compare → start_rewind → verify → 100% RESTORED over Streamable HTTP.");
} finally {
  await client.close();
  http.close();
  http.closeAllConnections();
}
