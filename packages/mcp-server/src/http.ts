import type { Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createRewindMcpServer, type RewindMcpServerOptions } from "./server.js";

export interface RewindMcpHttpOptions extends RewindMcpServerOptions {
  host?: string;
}

function methodNotAllowed(res: Response): void {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
}

/**
 * Stateless Streamable HTTP surface for Alexa+ and local MCP clients.
 * A new protocol server/transport is created per HTTP request while the injected
 * deterministic REWIND service and continuity store remain shared.
 */
export function createRewindMcpHttpApp(options: RewindMcpHttpOptions) {
  const app = createMcpExpressApp({ host: options.host ?? "127.0.0.1" });

  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createRewindMcpServer(options);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", (_req: Request, res: Response) => methodNotAllowed(res));
  app.delete("/mcp", (_req: Request, res: Response) => methodNotAllowed(res));
  return app;
}
