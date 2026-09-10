import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  parseRingWebhookEnvelope,
  sanitizeRingWebhookEvent,
  verifyRingWebhookSignature,
  type VerifiedRingWebhookEvent,
} from "./webhook-security.js";

const MAX_WEBHOOK_BODY_BYTES = 256_000;
const SEEN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 50;

interface StoredEvent extends VerifiedRingWebhookEvent {
  cursor: number;
}

export class RingWebhookInbox {
  private cursor = 0;
  private readonly seen = new Map<string, number>();
  private readonly events: StoredEvent[] = [];

  accept(event: VerifiedRingWebhookEvent, now = Date.now()): { duplicate: boolean; cursor: number } {
    this.prune(now);
    if (this.seen.has(event.requestId)) {
      return { duplicate: true, cursor: this.cursor };
    }
    this.seen.set(event.requestId, now);
    this.cursor += 1;
    this.events.push({ ...event, cursor: this.cursor });
    while (this.events.length > MAX_EVENTS) this.events.shift();
    return { duplicate: false, cursor: this.cursor };
  }

  since(cursor: number): { cursor: number; events: StoredEvent[] } {
    const safeCursor = Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
    return {
      cursor: this.cursor,
      events: this.events.filter(event => event.cursor > safeCursor),
    };
  }

  private prune(now: number) {
    for (const [requestId, acceptedAt] of this.seen) {
      if (now - acceptedAt > SEEN_TTL_MS) this.seen.delete(requestId);
    }
  }
}

export interface RingWebhookServerOptions {
  signingKey: string;
  allowedOrigins?: string[];
  inbox?: RingWebhookInbox;
}

class BodyTooLargeError extends Error {}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_WEBHOOK_BODY_BYTES) throw new BodyTooLargeError();
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

function isJsonContentType(value: string | undefined): boolean {
  const mediaType = value?.toLowerCase().split(";", 1)[0]?.trim() ?? "";
  return mediaType === "application/json";
}

/**
 * Minimal Ring webhook ingress for local Phase 7 testing.
 * Put TLS 1.2+ in front of this loopback listener with an HTTPS tunnel/reverse proxy.
 * The handler only verifies, validates, de-duplicates and enqueues sanitized events;
 * heavy Nova/verification work stays out of Ring's <5s delivery path.
 */
export function createRingWebhookServer(options: RingWebhookServerOptions) {
  if (!options.signingKey) throw new Error("RING_HMAC_SECRET is required for Ring webhooks.");
  const inbox = options.inbox ?? new RingWebhookInbox();
  const allowedOrigins = new Set(options.allowedOrigins ?? []);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/events") {
      const origin = req.headers.origin;
      if (!origin || !allowedOrigins.has(origin)) {
        json(res, 403, { error: "Local preview origin required." });
        return;
      }
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      const cursor = Number(url.searchParams.get("cursor") ?? "0");
      json(res, 200, inbox.since(cursor));
      return;
    }

    if (req.method !== "POST" || url.pathname !== "/webhooks/ring") {
      json(res, 404, { error: "Not found." });
      return;
    }

    if (!isJsonContentType(typeof req.headers["content-type"] === "string" ? req.headers["content-type"] : undefined)) {
      json(res, 415, { error: "application/json required." });
      return;
    }

    try {
      const rawBody = await readRawBody(req);
      const signature = typeof req.headers["x-signature"] === "string" ? req.headers["x-signature"] : undefined;

      // Critical boundary: authenticate the exact bytes before parsing JSON.
      if (!verifyRingWebhookSignature(options.signingKey, rawBody, signature)) {
        json(res, 401, { error: "Invalid Ring webhook signature." });
        return;
      }

      const envelope = parseRingWebhookEnvelope(rawBody);
      const event = sanitizeRingWebhookEvent(envelope);

      // Signed, valid non-motion events are acknowledged but not queued for Phase 7.
      if (event.type !== "motion_detected") {
        json(res, 202, { status: "ignored", type: event.type });
        return;
      }

      const accepted = inbox.accept(event);
      json(res, accepted.duplicate ? 200 : 202, {
        status: accepted.duplicate ? "duplicate" : "accepted",
        requestId: event.requestId,
      });
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        json(res, 413, { error: "Ring webhook body too large." });
        return;
      }
      json(res, 400, { error: error instanceof Error ? error.message : "Invalid Ring webhook." });
    }
  });

  return { server, inbox };
}
