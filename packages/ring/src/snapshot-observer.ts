import { randomUUID } from "node:crypto";
import type { AgentObservation, SpaceObserver } from "../../agent-tools/src/index.js";
import type { BedrockNovaVisionClient } from "../../vision/src/bedrock.js";
import type { RingClient, RingFetch } from "./client.js";

export interface RingSnapshot {
  imageBytes: Uint8Array;
  capturedAt: string;
  mediaOrigin?: string;
}

export interface RingSnapshotObserverOptions {
  client: RingClient;
  nova: BedrockNovaVisionClient;
  deviceId: string;
  fetchImpl?: RingFetch;
  lookbackMs?: number;
  now?: () => number;
}

function safeDownloadUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("Ring snapshot redirect was invalid."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("Ring snapshot redirect was rejected.");
  }
  return url;
}

export async function downloadLatestRingSnapshot(
  client: RingClient,
  deviceId: string,
  options: { fetchImpl?: RingFetch; lookbackMs?: number; now?: () => number } = {},
): Promise<RingSnapshot> {
  if (!deviceId || deviceId.length > 300) throw new Error("Ring snapshot device ID is invalid.");
  const now = options.now ?? (() => Date.now());
  const end = now();
  const requestedLookbackMs = Math.max(5_000, Math.min(options.lookbackMs ?? 15 * 60_000, 24 * 60 * 60_000));
  const attempts = [...new Set([
    requestedLookbackMs,
    Math.max(requestedLookbackMs, 15 * 60_000),
    24 * 60 * 60_000,
  ])];

  let response: Response | undefined;
  for (const lookbackMs of attempts) {
    const start = end - lookbackMs;
    response = await client.requestMediaRedirect(
      `/v1/devices/${encodeURIComponent(deviceId)}/media/image/download`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "image/jpeg" },
        body: JSON.stringify({
          type: "latest_in_range",
          start_timestamp: start,
          end_timestamp: end,
          image_options: { format: "jpeg" },
        }),
      },
    );
    if (![416, 425].includes(response.status)) break;
  }

  if (!response) throw new Error("Ring snapshot request did not run.");
  let mediaResponse = response;
  if (response.status === 303) {
    const location = response.headers.get("location");
    if (!location) throw new Error("Ring snapshot redirect was missing.");
    const url = safeDownloadUrl(location);
    const fetchImpl = options.fetchImpl ?? fetch;
    try {
      mediaResponse = await fetchImpl(url, {
        method: "GET",
        headers: { Accept: "image/jpeg" },
        redirect: "error",
      });
    } catch {
      throw new Error("Ring snapshot download failed.");
    }
  }

  if (!mediaResponse.ok) {
    throw new Error(`Ring snapshot unavailable (${mediaResponse.status}).`);
  }
  const contentType = mediaResponse.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("image/jpeg")) {
    throw new Error("Ring snapshot did not return JPEG media.");
  }

  const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
  if (bytes.length < 4 || bytes.length > 3_500_000 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) {
    throw new Error("Ring snapshot JPEG was invalid.");
  }

  const timestamp = Number(mediaResponse.headers.get("x-media-timestamp"));
  const capturedAt = Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toISOString()
    : new Date(end).toISOString();
  const mediaOrigin = mediaResponse.headers.get("x-media-origin") ?? undefined;
  return { imageBytes: bytes, capturedAt, ...(mediaOrigin ? { mediaOrigin } : {}) };
}

export class RingSnapshotObserver implements SpaceObserver {
  private readonly client: RingClient;
  private readonly nova: BedrockNovaVisionClient;
  private readonly deviceId: string;
  private readonly fetchImpl: RingFetch | undefined;
  private readonly lookbackMs: number | undefined;
  private readonly now: (() => number) | undefined;

  constructor(options: RingSnapshotObserverOptions) {
    this.client = options.client;
    this.nova = options.nova;
    this.deviceId = options.deviceId;
    this.fetchImpl = options.fetchImpl;
    this.lookbackMs = options.lookbackMs;
    this.now = options.now;
  }

  async inspect(spaceId: string): Promise<AgentObservation> {
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(spaceId)) throw new Error("Space ID is invalid.");
    const snapshot = await downloadLatestRingSnapshot(this.client, this.deviceId, {
      ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
      ...(this.lookbackMs !== undefined ? { lookbackMs: this.lookbackMs } : {}),
      ...(this.now ? { now: this.now } : {}),
    });
    const result = await this.nova.observe({
      imageBytes: snapshot.imageBytes,
      format: "jpeg",
      context: {
        spaceId,
        capturedAt: snapshot.capturedAt,
      },
    });
    return {
      observationId: `ring-snapshot-${randomUUID()}`,
      state: result.state,
      evidenceMode: "vision",
      ...(result.modelId !== undefined ? { modelId: result.modelId } : {}),
      ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
    };
  }
}
