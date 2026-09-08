import type { RingClient } from "./client.js";
import type { RingEvent } from "./contracts.js";
import { extractRingMediaReferences } from "./media.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function normalizeRingEvent(input: unknown): RingEvent {
  const value = asRecord(input);
  if (!value) throw new Error("Invalid Ring event.");

  const id =
    typeof value.id === "string"
      ? value.id
      : typeof value.eventId === "string"
        ? value.eventId
        : typeof value.event_id === "string"
          ? value.event_id
          : crypto.randomUUID();

  const deviceId =
    typeof value.deviceId === "string"
      ? value.deviceId
      : typeof value.device_id === "string"
        ? value.device_id
        : typeof value.doorbot_id === "string"
          ? value.doorbot_id
          : typeof value.doorbot_id === "number"
            ? String(value.doorbot_id)
            : "";

  if (!deviceId) throw new Error("Ring event is missing deviceId.");

  const type =
    typeof value.type === "string"
      ? value.type
      : typeof value.kind === "string"
        ? value.kind
        : typeof value.event_type === "string"
          ? value.event_type
          : "unknown";

  const occurredAt =
    typeof value.occurredAt === "string"
      ? value.occurredAt
      : typeof value.created_at === "string"
        ? value.created_at
        : typeof value.timestamp === "string"
          ? value.timestamp
          : new Date().toISOString();

  return {
    id,
    deviceId,
    type,
    occurredAt,
    media: extractRingMediaReferences(value, { deviceId, eventId: id }),
    raw: input,
  };
}

export function normalizeRingEvents(payload: unknown): RingEvent[] {
  const record = asRecord(payload);
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.events)
      ? record.events
      : Array.isArray(record?.data)
        ? record.data
        : [];

  const events: RingEvent[] = [];
  for (const item of list) {
    try {
      events.push(normalizeRingEvent(item));
    } catch {
      // Ignore malformed provider rows instead of leaking them into REWIND state.
    }
  }
  return events;
}

export async function listRingEvents(client: RingClient, path: string): Promise<RingEvent[]> {
  const payload = await client.request<unknown>(path);
  return normalizeRingEvents(payload);
}
