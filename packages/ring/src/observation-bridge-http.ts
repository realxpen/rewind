import { createServer, type ServerResponse } from "node:http";
import type { RingObservationBridge } from "./observation-bridge.js";

function send(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

function validSpaceId(value: string | null): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{1,80}$/.test(value);
}

export function createObservationBridgeControlServer(
  bridge: RingObservationBridge,
  previewPort: number,
  controlPort: number,
) {
  const allowedOrigins = new Set([
    `http://127.0.0.1:${previewPort}`,
    `http://localhost:${previewPort}`,
  ]);

  return createServer((req, res) => {
    const host = req.headers.host ?? "";
    if (host !== `127.0.0.1:${controlPort}` && host !== `localhost:${controlPort}`) {
      send(res, 403, { error: "Local access only." });
      return;
    }

    const origin = req.headers.origin;
    if (!origin || !allowedOrigins.has(origin)) {
      send(res, 403, { error: "Origin rejected." });
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");

    if (req.method !== "GET") {
      send(res, 405, { error: "Method not allowed." });
      return;
    }

    const url = new URL(req.url ?? "/", `http://${host}`);
    if (url.pathname !== "/observation-request") {
      send(res, 404, { error: "Not found." });
      return;
    }

    const spaceId = url.searchParams.get("spaceId");
    if (!validSpaceId(spaceId)) {
      send(res, 400, { error: "A valid spaceId is required." });
      return;
    }

    const pending = bridge.pendingRequest(spaceId);
    send(res, 200, pending
      ? { requested: true, requestId: pending.id, requestedAt: pending.requestedAt }
      : { requested: false });
  });
}
