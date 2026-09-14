import type { Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
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

export function createRewindMcpHttpApp(options: RewindMcpHttpOptions) {
  const app = createMcpExpressApp({ host: options.host ?? "127.0.0.1" });

  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createRewindMcpServer(options);
    const transportOptions = { sessionIdGenerator: undefined } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0];
    const transport = new StreamableHTTPServerTransport(transportOptions);

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport as unknown as Transport);
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
