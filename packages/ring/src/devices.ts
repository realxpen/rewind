import type { RingClient } from "./client.js";
import type { RingDevice } from "./contracts.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeDevice(input: unknown): RingDevice | null {
  const value = asRecord(input);
  if (!value) return null;

  const id =
    typeof value.id === "string"
      ? value.id
      : typeof value.deviceId === "string"
        ? value.deviceId
        : typeof value.device_id === "string"
          ? value.device_id
          : "";

  if (!id) return null;

  const name =
    typeof value.name === "string"
      ? value.name
      : typeof value.description === "string"
        ? value.description
        : `Ring device ${id}`;

  const kind =
    typeof value.kind === "string"
      ? value.kind
      : typeof value.type === "string"
        ? value.type
        : undefined;

  const description = typeof value.description === "string" ? value.description : undefined;
  const capabilities = Array.isArray(value.capabilities)
    ? value.capabilities.filter((item): item is string => typeof item === "string")
    : undefined;

  return {
    id,
    name,
    ...(kind ? { kind } : {}),
    ...(description ? { description } : {}),
    ...(capabilities && capabilities.length > 0 ? { capabilities } : {}),
  };
}

export function normalizeRingDevices(payload: unknown): RingDevice[] {
  const record = asRecord(payload);
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.devices)
      ? record.devices
      : Array.isArray(record?.data)
        ? record.data
        : [];

  return list.map(normalizeDevice).filter((device): device is RingDevice => device !== null);
}

export async function listRingDevices(client: RingClient, path: string): Promise<RingDevice[]> {
  const payload = await client.request<unknown>(path);
  return normalizeRingDevices(payload);
}
