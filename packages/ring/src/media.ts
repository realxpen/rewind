import type { RingMediaKind, RingMediaReference } from "./contracts.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pushIfUrl(
  output: RingMediaReference[],
  kind: RingMediaKind,
  value: unknown,
  deviceId?: string,
  eventId?: string,
): void {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return;
  output.push({ kind, url: value, ...(deviceId ? { deviceId } : {}), ...(eventId ? { eventId } : {}) });
}

export function extractRingMediaReferences(
  input: unknown,
  context: { deviceId?: string; eventId?: string } = {},
): RingMediaReference[] {
  const value = asRecord(input);
  if (!value) return [];

  const refs: RingMediaReference[] = [];
  pushIfUrl(refs, "snapshot", value.snapshotUrl ?? value.snapshot_url, context.deviceId, context.eventId);
  pushIfUrl(refs, "recording", value.recordingUrl ?? value.recording_url ?? value.videoUrl ?? value.video_url, context.deviceId, context.eventId);
  pushIfUrl(refs, "stream", value.streamUrl ?? value.stream_url ?? value.whepUrl ?? value.whep_url, context.deviceId, context.eventId);

  const media = value.media;
  if (Array.isArray(media)) {
    for (const item of media) {
      const record = asRecord(item);
      if (!record) continue;
      const rawKind = typeof record.kind === "string" ? record.kind.toLowerCase() : "unknown";
      const kind: RingMediaKind =
        rawKind === "snapshot" || rawKind === "recording" || rawKind === "stream" ? rawKind : "unknown";
      const url = record.url;
      if (typeof url === "string" && /^https?:\/\//i.test(url)) {
        refs.push({
          kind,
          url,
          ...(context.deviceId ? { deviceId: context.deviceId } : {}),
          ...(context.eventId ? { eventId: context.eventId } : {}),
          ...(typeof record.expiresAt === "string" ? { expiresAt: record.expiresAt } : {}),
        });
      }
    }
  }

  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
