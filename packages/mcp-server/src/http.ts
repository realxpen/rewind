import type { Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  authorizeMcpRequest,
  protectedResourceMetadata,
  protectedResourceMetadataPath,
  validateMcpAuthOptions,
  type RewindMcpAuthOptions,
} from "./auth.js";
import { createRewindMcpServer, type RewindMcpServerOptions } from "./server.js";

export interface RewindMcpHttpOptions extends RewindMcpServerOptions {
  host?: string;
  auth?: RewindMcpAuthOptions;
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

  if (options.auth) {
    validateMcpAuthOptions(options.auth);
    const prmPath = protectedResourceMetadataPath(options.auth.resource);
    app.get(prmPath, (_req: Request, res: Response) => {
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json(protectedResourceMetadata(options.auth!));
    });
  }

  app.post("/mcp", async (req: Request, res: Response) => {
    let actorId = options.actorId;
    let sessionId = options.sessionId;

    if (options.auth) {
      const principal = await authorizeMcpRequest(req, res, options.auth);
      if (!principal) return;
      actorId = principal.actorId;
      sessionId = principal.sessionId ?? options.sessionId ?? `alexa-${principal.actorId}`;
    }

    const serverOptions: RewindMcpServerOptions = {
      toolService: options.toolService,
      ...(options.continuity ? { continuity: options.continuity } : {}),
      ...(actorId ? { actorId } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(options.defaultSpaceId ? { defaultSpaceId: options.defaultSpaceId } : {}),
    };
    const server = createRewindMcpServer(serverOptions);
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
