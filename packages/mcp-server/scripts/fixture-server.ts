import { InMemorySessionContinuityStore } from "../../agent-orchestrator/src/index.js";
import { createPhase9FixtureToolService } from "../src/fixture.js";
import { createRewindMcpHttpApp } from "../src/http.js";

const port = Number(process.env.REWIND_MCP_PORT ?? 3004);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("REWIND_MCP_PORT must be an integer between 1024 and 65535.");
}

const app = createRewindMcpHttpApp({
  toolService: createPhase9FixtureToolService(),
  continuity: new InMemorySessionContinuityStore(),
  actorId: process.env.REWIND_MCP_ACTOR_ID ?? "rewind-mcp-demo-user",
  sessionId: process.env.REWIND_MCP_SESSION_ID ?? "rewind-mcp-demo-session",
  defaultSpaceId: process.env.REWIND_DEFAULT_SPACE_ID ?? "studio",
  host: "127.0.0.1",
});

const http = app.listen(port, "127.0.0.1", () => {
  console.log(`REWIND MCP (Streamable HTTP): http://127.0.0.1:${port}/mcp`);
  console.log("Fixture sequence: Demo Ready → Messy → Messy → Partial → Restored");
  console.log("Phase 9 gate tools: save_checkpoint, compare_checkpoint, start_rewind, verify_rewind");
});

const stop = () => {
  http.close();
  http.closeAllConnections();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
