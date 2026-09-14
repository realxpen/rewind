import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = process.env.REWIND_MCP_URL?.trim() || "http://127.0.0.1:3004/mcp";
const command = process.argv[2]?.trim().toLowerCase();
const name = process.argv.slice(3).join(" ").trim();

const mapping: Record<string, { tool: string; args: Record<string, unknown> }> = {
  save: { tool: "save_checkpoint", args: { name: name || "Demo Ready" } },
  compare: { tool: "compare_checkpoint", args: {} },
  rewind: { tool: "start_rewind", args: {} },
  verify: { tool: "verify_rewind", args: {} },
  status: { tool: "get_rewind_status", args: {} },
  list: { tool: "list_checkpoints", args: {} },
};

if (!command || !mapping[command]) {
  console.error("Usage: npm run mcp:live -- <save|compare|rewind|verify|status|list> [checkpoint name]");
  process.exitCode = 2;
} else {
  const client = new Client({ name: "rewind-live-mcp-command", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));
  try {
    await client.connect(transport as any);
    const selected = mapping[command]!;
    console.log(`MCP → ${selected.tool}`);
    if (["save", "compare", "rewind", "verify"].includes(command)) {
      console.log("Waiting for the open Ring preview to capture a fresh frame and validate it with Nova…");
    }
    const result = await client.callTool({ name: selected.tool, arguments: selected.args });
    if (result.isError) {
      const message = result.content
        .filter((item: any) => item.type === "text")
        .map((item: any) => item.text)
        .join("\n");
      throw new Error(message || `${selected.tool} failed.`);
    }
    console.log(JSON.stringify(result.structuredContent ?? result.content, null, 2));
  } catch (error) {
    console.error(`REWIND MCP error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await client.close().catch(() => undefined);
  }
}
