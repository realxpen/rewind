import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { RingDevice, RingWhepSession } from "./contracts.js";
import type { VisionObservationRequest, VisionObservation } from "../../vision/src/contracts.js";

export interface PreviewServices {
  devices(): Promise<RingDevice[]>;
  start(deviceId: string, offer: string): Promise<RingWhepSession>;
  stop(url: string): Promise<void>;
  observe(request: VisionObservationRequest): Promise<VisionObservation>;
}

class InputError extends Error {}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 5_000_000) throw new InputError("Request is too large.");
    chunks.push(Buffer.from(chunk));
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new InputError("Invalid request."); }
}
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

/** Loopback-only development surface; one stream, no persistent media or credentials in the browser. */
export function createPreviewServer(services: PreviewServices, assets: { html: string; js: string }) {
  let active: { id: string; url: string; touched: number } | undefined;
  let busy = false;
  let observing = false;
  async function cleanup() {
    if (!active) return;
    await services.stop(active.url);
    active = undefined;
  }
  const server = createServer(async (req, res) => {
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 0;
    const hosts = [`localhost:${port}`, `127.0.0.1:${port}`];
    if (!hosts.includes(req.headers.host ?? "")) { send(res, 403, { error: "Local access only." }); return; }
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
      send(res, 403, { error: "Origin rejected." }); return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'");
    try {
      if (req.method === "GET" && ["/", "/preview.js"].includes(req.url ?? "")) {
        res.setHeader("Content-Type", req.url === "/" ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8");
        res.end(req.url === "/" ? assets.html : assets.js); return;
      }
      if (req.method === "GET" && req.url === "/api/devices") {
        send(res, 200, await services.devices()); return;
      }
      if (req.method !== "POST" || !["/api/start", "/api/stop", "/api/heartbeat", "/api/observe"].includes(req.url ?? "")) {
        send(res, 404, { error: "Not found." }); return;
      }
      if (req.headers.origin !== `http://${req.headers.host}` || req.headers["content-type"] !== "application/json") {
        send(res, 403, { error: "Use the local preview page." }); return;
      }
      const data = await body(req);
      if (req.url === "/api/observe") {
        if (observing) { send(res, 409, { error: "An observation is already running." }); return; }
        if (typeof data.image !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.image) ||
            typeof data.spaceId !== "string" || !/^[a-zA-Z0-9._-]{1,80}$/.test(data.spaceId) ||
            typeof data.capturedAt !== "string" || !Number.isFinite(Date.parse(data.capturedAt))) {
          throw new InputError("A captured JPEG, space name, and capture time are required.");
        }
        const bytes = Buffer.from(data.image, "base64");
        if (bytes.length < 4 || bytes.length > 3_500_000 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) {
          throw new InputError("Capture a JPEG frame under 3.5 MB.");
        }
        observing = true;
        try {
          const result = await services.observe({ imageBytes: bytes, format: "jpeg", context: { spaceId: data.spaceId, capturedAt: data.capturedAt } });
          send(res, 200, { state: result.state, modelId: result.modelId, latencyMs: result.latencyMs });
        } finally { observing = false; }
        return;
      }
      if (busy) { send(res, 409, { error: "Session operation in progress. Retry shortly." }); return; }
      busy = true;
      try {
        if (req.url === "/api/start") {
          if (active) { send(res, 409, { error: "Stop the current stream first." }); return; }
          if (typeof data.deviceId !== "string" || typeof data.offer !== "string" || !data.offer.startsWith("v=0") || data.offer.length > 256_000) {
            throw new InputError("Choose a device and provide an SDP offer.");
          }
          if (!(await services.devices()).some(d => d.id === data.deviceId)) throw new InputError("Choose a discovered device.");
          const session = await services.start(data.deviceId, data.offer);
          active = { id: randomUUID(), url: session.sessionUrl, touched: Date.now() };
          send(res, 201, { id: active.id, answer: session.sdpAnswer });
        } else {
          if (!active || data.id !== active.id) { send(res, 404, { error: "Session not found." }); return; }
          if (req.url === "/api/heartbeat") active.touched = Date.now();
          else await cleanup();
          send(res, 200, { ok: true });
        }
      } finally { busy = false; }
    } catch (error) {
      // Never return upstream URLs, response bodies, SDK details, or SDP in errors.
      const status = error instanceof InputError ? 400 : 502;
      const message = error instanceof InputError ? error.message : req.url === "/api/observe"
        ? "Nova observation failed. Check AWS credentials, model access, and region in the server terminal environment."
        : "Ring request failed. Check your token; refresh it and restart the server if expired.";
      send(res, status, { error: message });
    }
  });
  const timer = setInterval(() => {
    if (!busy && active && Date.now() - active.touched > 60_000) {
      busy = true;
      void cleanup().catch(() => {}).finally(() => { busy = false; });
    }
  }, 10_000);
  timer.unref();
  server.on("close", () => clearInterval(timer));
  return { server, cleanup };
}
