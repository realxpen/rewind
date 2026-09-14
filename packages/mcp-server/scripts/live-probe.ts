import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = process.env.REWIND_MCP_URL?.trim() || "http://127.0.0.1:3004/mcp";
const client = new Client({ name: "rewind-live-mcp-probe", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL(endpoint));

try {
  await client.connect(transport as any);
  const listed = await client.listTools();
  const names = listed.tools.map(tool => tool.name).sort();
  for (const required of ["save_checkpoint", "compare_checkpoint", "start_rewind", "verify_rewind"]) {
    assert(names.includes(required), `Missing live MCP tool: ${required}`);
  }
  console.log(`PASS live MCP discovery: ${endpoint}`);
  console.log(`Tools (${names.length}): ${names.join(", ")}`);
} finally {
  await client.close();
}
