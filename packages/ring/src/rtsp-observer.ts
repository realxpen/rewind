import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { AgentObservation, SpaceObservationContext, SpaceObserver } from "../../agent-tools/src/index.js";
import type { BedrockNovaVisionClient } from "../../vision/src/bedrock.js";
import { trackedEntitiesFromReferenceState } from "./tracked-entities.js";

export interface RingRtspFrame {
  imageBytes: Uint8Array;
  capturedAt: string;
}

export interface RingRtspObserverOptions {
  nova: BedrockNovaVisionClient;
  deviceId: string;
  accessToken: string;
  componentId?: string;
  ffmpegPath?: string;
  timeoutMs?: number;
  now?: () => number;
}

function buildRtspUrl(deviceId: string, accessToken: string, componentId?: string): string {
  if (!deviceId || deviceId.length > 300) throw new Error("Ring RTSP device ID is invalid.");
  if (!accessToken) throw new Error("Ring RTSP access token is missing.");
  const url = new URL(`rtsps://video.rtsp.amazonvision.com:322/v1/devices/${encodeURIComponent(deviceId)}/stream`);
  if (componentId) url.searchParams.set("component_id", componentId);
  // Ring's partner docs recommend the query token for FFmpeg because its RTSP
  // client cannot send X-Auth-Token and may truncate long user-info credentials.
  url.searchParams.set("token", accessToken);
  return url.toString();
}

function validJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 4
    && bytes.length <= 3_500_000
    && bytes[0] === 255
    && bytes[1] === 216
    && bytes.at(-2) === 255
    && bytes.at(-1) === 217;
}

export async function captureRingRtspJpeg(options: {
  deviceId: string;
  accessToken: string;
  componentId?: string;
  ffmpegPath?: string;
  timeoutMs?: number;
  now?: () => number;
  spawnImpl?: typeof spawn;
}): Promise<RingRtspFrame> {
  const ffmpegPath = options.ffmpegPath?.trim() || "ffmpeg";
  const timeoutMs = Math.max(5_000, Math.min(options.timeoutMs ?? 18_000, 30_000));
  const now = options.now ?? (() => Date.now());
  const url = buildRtspUrl(options.deviceId, options.accessToken, options.componentId);
  const spawnImpl = options.spawnImpl ?? spawn;

  const args = [
    "-hide_banner",
    "-loglevel", "error",
    "-nostdin",
    "-rtsp_transport", "tcp",
    "-rw_timeout", String(Math.max(5_000_000, timeoutMs * 1_000)),
    "-i", url,
    "-an",
    "-frames:v", "1",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "pipe:1",
  ];

  return new Promise<RingRtspFrame>((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnImpl(ffmpegPath, args, {
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      }) as ChildProcessWithoutNullStreams;
    } catch {
      reject(new Error("FFmpeg is required for Ring RTSP observations."));
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
        return;
      }
      const bytes = new Uint8Array(Buffer.concat(chunks));
      if (!validJpeg(bytes)) {
        reject(new Error("Ring RTSP did not produce a valid JPEG frame."));
        return;
      }
      resolve({
        imageBytes: bytes,
        capturedAt: new Date(now()).toISOString(),
      });
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("Ring RTSP frame capture timed out."));
    }, timeoutMs);

    child.stdout.on("data", chunk => {
      const value = Buffer.from(chunk);
      size += value.length;
      if (size > 3_500_000) {
        child.kill("SIGKILL");
        finish(new Error("Ring RTSP frame exceeded the safe image limit."));
        return;
      }
      chunks.push(value);
    });

    // Consume stderr so FFmpeg cannot block on a full pipe. Never surface it
    // because it can contain the RTSP URL, including the short-lived OAuth token.
    child.stderr.on("data", () => {});

    child.on("error", error => {
      finish((error as NodeJS.ErrnoException).code === "ENOENT"
        ? new Error("FFmpeg is required for Ring RTSP observations.")
        : new Error("Ring RTSP client could not start."));
    });

    child.on("close", code => {
      if (settled) return;
      if (code !== 0) {
        finish(new Error("Ring RTSP frame capture failed."));
        return;
      }
      finish();
    });
  });
}

export class RingRtspObserver implements SpaceObserver {
  private readonly nova: BedrockNovaVisionClient;
  private readonly deviceId: string;
  private readonly accessToken: string;
  private readonly componentId: string | undefined;
  private readonly ffmpegPath: string | undefined;
  private readonly timeoutMs: number | undefined;
  private readonly now: (() => number) | undefined;

  constructor(options: RingRtspObserverOptions) {
    this.nova = options.nova;
    this.deviceId = options.deviceId;
    this.accessToken = options.accessToken;
    this.componentId = options.componentId;
    this.ffmpegPath = options.ffmpegPath;
    this.timeoutMs = options.timeoutMs;
    this.now = options.now;
  }

  async inspect(spaceId: string, observationContext?: SpaceObservationContext): Promise<AgentObservation> {
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(spaceId)) throw new Error("Space ID is invalid.");
    const frame = await captureRingRtspJpeg({
      deviceId: this.deviceId,
      accessToken: this.accessToken,
      ...(this.componentId ? { componentId: this.componentId } : {}),
      ...(this.ffmpegPath ? { ffmpegPath: this.ffmpegPath } : {}),
      ...(this.timeoutMs !== undefined ? { timeoutMs: this.timeoutMs } : {}),
      ...(this.now ? { now: this.now } : {}),
    });
    const result = await this.nova.observe({
      imageBytes: frame.imageBytes,
      format: "jpeg",
      context: {
        spaceId,
        capturedAt: frame.capturedAt,
        ...(trackedEntitiesFromReferenceState(observationContext?.referenceState)
          ? { trackedEntities: trackedEntitiesFromReferenceState(observationContext?.referenceState)! }
          : {}),
      },
    });
    return {
      observationId: `ring-rtsp-${randomUUID()}`,
      state: result.state,
      evidenceMode: "vision",
      ...(result.modelId !== undefined ? { modelId: result.modelId } : {}),
      ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
    };
  }
}
