import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from "node:http";
import {
  SkillRequestSignatureVerifier,
  TimestampVerifier,
} from "ask-sdk-express-adapter";
import { RewindAlexaSkill } from "./skill.js";
import type { AlexaRequestEnvelope } from "./types.js";

export interface AlexaSkillHttpOptions {
  path?: string;
  verifyRequests?: boolean;
  maxBodyBytes?: number;
  relayPath?: string;
  relaySecret?: string;
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

function headerMap(headers: IncomingHttpHeaders): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") mapped[name] = value;
    else if (Array.isArray(value)) mapped[name] = value.join(", ");
  }
  return mapped;
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) throw new Error("Alexa request body is too large.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createAlexaSkillHttpServer(
  skill: RewindAlexaSkill,
  options: AlexaSkillHttpOptions = {},
) {
  const path = options.path ?? "/alexa";
  const relayPath = options.relayPath ?? "/alexa-relay";
  const relaySecret = options.relaySecret?.trim();
  const verifyRequests = options.verifyRequests ?? true;
  const maxBodyBytes = options.maxBodyBytes ?? 256_000;
  const signatureVerifier = new SkillRequestSignatureVerifier();
  const timestampVerifier = new TimestampVerifier();

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const isAskEndpoint = req.method === "POST" && url.pathname === path;
    const isRelayEndpoint = req.method === "POST" && url.pathname === relayPath && relaySecret;

    if (!isAskEndpoint && !isRelayEndpoint) {
      sendJson(res, 404, { error: "Not found." });
      return;
    }

    try {
      const rawBody = await readBody(req, maxBodyBytes);

      if (isRelayEndpoint) {
        const supplied = req.headers["x-rewind-relay-secret"];
        const value = Array.isArray(supplied) ? supplied[0] : supplied;
        if (!secretMatches(value, relaySecret)) {
          sendJson(res, 401, { error: "Unauthorized." });
          return;
        }
      } else if (verifyRequests) {
        const headers = headerMap(req.headers);
        await signatureVerifier.verify(rawBody, headers);
        await timestampVerifier.verify(rawBody);
      }

      const envelope = JSON.parse(rawBody) as AlexaRequestEnvelope;
      const result = await skill.handle(envelope);
      sendJson(res, 200, result);
    } catch {
      sendJson(res, 400, { error: "Invalid Alexa request." });
    }
  });
}
