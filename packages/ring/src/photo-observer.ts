import { randomUUID } from "node:crypto";
import type { AgentObservation, SpaceObservationContext, SpaceObserver } from "../../agent-tools/src/index.js";
import type { BedrockNovaVisionClient } from "../../vision/src/bedrock.js";
import { trackedEntitiesFromReferenceState } from "./tracked-entities.js";

interface BufferedPhoto {
  imageBytes: Uint8Array;
  capturedAt: string;
}

export interface PhotoObserverOptions {
  nova: BedrockNovaVisionClient;
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
    throw new Error("Uploaded photo JPEG was invalid.");
  }
}

/**
 * Ephemeral Alexa/MCP still-photo observer.
 * Holds only the latest analyzed photo per space in RAM. Raw photos are never persisted.
 */
export class PhotoObserver implements SpaceObserver {
  private readonly nova: BedrockNovaVisionClient;
  private readonly photos = new Map<string, BufferedPhoto>();

  constructor(options: PhotoObserverOptions) {
    this.nova = options.nova;
  }

  publish(input: { spaceId: string; imageBytes: Uint8Array; capturedAt: string }): void {
    assertSpaceId(input.spaceId);
    assertJpeg(input.imageBytes);
    if (!Number.isFinite(Date.parse(input.capturedAt))) {
      throw new Error("Uploaded photo timestamp is invalid.");
    }
    this.photos.set(input.spaceId, {
      imageBytes: new Uint8Array(input.imageBytes),
      capturedAt: input.capturedAt,
    });
    while (this.photos.size > 20) {
      const oldest = this.photos.keys().next().value as string | undefined;
      if (!oldest) break;
      this.photos.delete(oldest);
    }
    console.log(`Alexa photo source ready for space ${input.spaceId}.`);
  }

  has(spaceId: string): boolean {
    assertSpaceId(spaceId);
    return this.photos.has(spaceId);
  }

  async inspect(spaceId: string, observationContext?: SpaceObservationContext): Promise<AgentObservation> {
    assertSpaceId(spaceId);
    const photo = this.photos.get(spaceId);
    if (!photo) {
      throw new Error("No analyzed photo is ready for this space. Upload and analyze a photo first.");
    }

    console.log(`Alexa photo consumed for space ${spaceId}.`);
    const trackedEntities = trackedEntitiesFromReferenceState(observationContext?.referenceState);
    const result = await this.nova.observe({
      imageBytes: photo.imageBytes,
      format: "jpeg",
      context: {
        spaceId,
        capturedAt: photo.capturedAt,
        ...(trackedEntities ? { trackedEntities } : {}),
      },
    });

    return {
      observationId: `photo-${randomUUID()}`,
      state: result.state,
      evidenceMode: "vision",
      ...(result.modelId !== undefined ? { modelId: result.modelId } : {}),
      ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
    };
  }
}
