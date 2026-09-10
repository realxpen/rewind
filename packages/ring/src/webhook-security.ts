import { createHmac, timingSafeEqual } from "node:crypto";

const WEBHOOK_SIGNATURE = /^sha256=([0-9a-fA-F]{64})$/;

export interface RingWebhookEnvelope {
  meta: {
    version: "1.1";
    time: string;
    request_id: string;
    account_id: string;
  };
  data: {
    id: string;
    type: string;
    attributes: {
      source: string;
      source_type: string;
      timestamp: number;
      sub_type?: string;
      component_ids?: string[];
    };
    relationships?: unknown;
  };
}

export interface VerifiedRingWebhookEvent {
  requestId: string;
  accountId: string;
  eventId: string;
  type: string;
  deviceId: string;
  occurredAt: string;
  timestamp: number;
  subType?: string;
  componentIds: string[];
}

/**
 * Ring webhook signatures are HMAC-SHA256 hex digests over the exact raw request bytes.
 * Verification must happen before JSON parsing or any re-serialization.
 */
export function verifyRingWebhookSignature(
  signingKey: string,
  rawBody: Uint8Array,
  signatureHeader: string | undefined,
): boolean {
  if (!signingKey || !signatureHeader) return false;
  const match = WEBHOOK_SIGNATURE.exec(signatureHeader.trim());
  const digestHex = match?.[1];
  if (!digestHex) return false;

  const expected = createHmac("sha256", signingKey).update(rawBody).digest();
  const received = Buffer.from(digestHex, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function requiredString(value: unknown, field: string, max = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new Error(`Invalid Ring webhook ${field}.`);
  }
  return value;
}

export function parseRingWebhookEnvelope(rawBody: Uint8Array): RingWebhookEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(rawBody).toString("utf8"));
  } catch {
    throw new Error("Invalid Ring webhook JSON.");
  }

  const root = asRecord(parsed);
  const meta = asRecord(root?.meta);
  const data = asRecord(root?.data);
  const attributes = asRecord(data?.attributes);
  if (!root || !meta || !data || !attributes) throw new Error("Invalid Ring webhook envelope.");

  const version = requiredString(meta.version, "meta.version", 16);
  if (version !== "1.1") throw new Error("Unsupported Ring webhook version.");

  const timestamp = attributes.timestamp;
  if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error("Invalid Ring webhook data.attributes.timestamp.");
  }

  const componentIds = attributes.component_ids;
  if (componentIds !== undefined && (!Array.isArray(componentIds) || componentIds.some(id => typeof id !== "string" || id.length > 128))) {
    throw new Error("Invalid Ring webhook component_ids.");
  }

  const subType = attributes.sub_type;
  if (subType !== undefined && (typeof subType !== "string" || subType.length > 128)) {
    throw new Error("Invalid Ring webhook sub_type.");
  }

  return {
    meta: {
      version: "1.1",
      time: requiredString(meta.time, "meta.time", 128),
      request_id: requiredString(meta.request_id, "meta.request_id", 128),
      account_id: requiredString(meta.account_id, "meta.account_id", 256),
    },
    data: {
      id: requiredString(data.id, "data.id", 1024),
      type: requiredString(data.type, "data.type", 128),
      attributes: {
        source: requiredString(attributes.source, "data.attributes.source", 1024),
        source_type: requiredString(attributes.source_type, "data.attributes.source_type", 128),
        timestamp,
        ...(subType !== undefined ? { sub_type: subType } : {}),
        ...(componentIds !== undefined ? { component_ids: componentIds as string[] } : {}),
      },
      ...(data.relationships !== undefined ? { relationships: data.relationships } : {}),
    },
  };
}

export function sanitizeRingWebhookEvent(envelope: RingWebhookEnvelope): VerifiedRingWebhookEvent {
  if (envelope.data.attributes.source_type !== "devices") {
    throw new Error("Ring webhook source_type is not devices.");
  }

  return {
    requestId: envelope.meta.request_id,
    accountId: envelope.meta.account_id,
    eventId: envelope.data.id,
    type: envelope.data.type,
    deviceId: envelope.data.attributes.source,
    occurredAt: new Date(envelope.data.attributes.timestamp).toISOString(),
    timestamp: envelope.data.attributes.timestamp,
    ...(envelope.data.attributes.sub_type ? { subType: envelope.data.attributes.sub_type } : {}),
    componentIds: envelope.data.attributes.component_ids ?? [],
  };
}
