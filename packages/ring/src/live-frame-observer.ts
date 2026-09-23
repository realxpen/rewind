import { randomUUID } from "node:crypto";
import type { AgentObservation, SpaceObserver } from "../../agent-tools/src/index.js";
import type { BedrockNovaVisionClient } from "../../vision/src/bedrock.js";

interface BufferedFrame {
  imageBytes: Uint8Array;
  capturedAt: string;
  receivedAt: number;
}

interface PendingFrameWait {
  requestedAt: number;
  resolve: (frame: BufferedFrame) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface RingLiveFrameObserverOptions {
  nova: BedrockNovaVisionClient;
  maxFrameAgeMs?: number;
  waitMs?: number;
  now?: () => number;
}

function assertSpaceId(spaceId: string): void {
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(spaceId)) throw new Error("Space ID is invalid.");
}

function assertJpeg(bytes: Uint8Array): void {
  if (
    bytes.length < 4 ||
    bytes.length > 3_500_000 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  ) {
    throw new Error("Ring WHEP live frame JPEG was invalid.");
  }
}

/**
 * Holds only the most recent browser-decoded WHEP frame in memory.
 * Frames are never persisted. Nova is invoked only when inspect() is called.
 */
export class RingLiveFrameObserver implements SpaceObserver {
  private readonly nova: BedrockNovaVisionClient;
  private readonly maxFrameAgeMs: number;
  private readonly waitMs: number;
  private readonly now: () => number;
  private readonly frames = new Map<string, BufferedFrame>();
  private readonly pending = new Map<string, PendingFrameWait[]>();

  constructor(options: RingLiveFrameObserverOptions) {
    this.nova = options.nova;
    this.maxFrameAgeMs = Math.max(1_000, Math.min(options.maxFrameAgeMs ?? 5_000, 15_000));
    this.waitMs = Math.max(1_000, Math.min(options.waitMs ?? 12_000, 30_000));
    this.now = options.now ?? (() => Date.now());
  }

  publish(input: { spaceId: string; imageBytes: Uint8Array; capturedAt: string }): void {
    assertSpaceId(input.spaceId);
    assertJpeg(input.imageBytes);
    if (!Number.isFinite(Date.parse(input.capturedAt))) {
      throw new Error("Ring WHEP live frame timestamp is invalid.");
    }

    const frame: BufferedFrame = {
      imageBytes: new Uint8Array(input.imageBytes),
      capturedAt: input.capturedAt,
      receivedAt: this.now(),
    };
    this.frames.set(input.spaceId, frame);

    const waits = this.pending.get(input.spaceId);
    if (!waits?.length) return;
    this.pending.delete(input.spaceId);
    for (const wait of waits) {
      clearTimeout(wait.timer);
      wait.resolve(frame);
    }
  }

  private async frameFor(spaceId: string): Promise<BufferedFrame> {
    const current = this.frames.get(spaceId);
    const now = this.now();
    if (current && now - current.receivedAt <= this.maxFrameAgeMs) {
      return current;
    }

    return new Promise<BufferedFrame>((resolve, reject) => {
      const requestedAt = now;
      const timer = setTimeout(() => {
        const waits = this.pending.get(spaceId) ?? [];
        this.pending.set(spaceId, waits.filter(wait => wait.requestedAt !== requestedAt));
        reject(new Error("Timed out waiting for a recent Ring WHEP live frame."));
      }, this.waitMs);
      const waits = this.pending.get(spaceId) ?? [];
      waits.push({ requestedAt, resolve, reject, timer });
      this.pending.set(spaceId, waits);
    });
  }

  async inspect(spaceId: string): Promise<AgentObservation> {
    assertSpaceId(spaceId);
    const frame = await this.frameFor(spaceId);
    console.log(`Ring WHEP live frame consumed for space ${spaceId}.`);
    const result = await this.nova.observe({
      imageBytes: frame.imageBytes,
      format: "jpeg",
      context: {
        spaceId,
        capturedAt: frame.capturedAt,
      },
    });
    return {
      observationId: `ring-whep-${randomUUID()}`,
      state: result.state,
      evidenceMode: "vision",
      ...(result.modelId !== undefined ? { modelId: result.modelId } : {}),
      ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
    };
  }
}
