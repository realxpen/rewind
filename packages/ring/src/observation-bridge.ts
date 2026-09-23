import type { AgentObservation, SpaceObserver } from "../../agent-tools/src/index.js";
import type { PhysicalState } from "../../physical-state-protocol/src/index.js";

export interface TrustedRingObservation {
  observationId: string;
  spaceId: string;
  state: PhysicalState;
  modelId?: string;
  latencyMs?: number;
  receivedAt?: number;
}

export interface RingObservationRequest {
  id: string;
  spaceId: string;
  requestedAt: number;
}

interface PendingRequest extends RingObservationRequest {
  resolve: (observation: AgentObservation) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function assertSpaceId(spaceId: string): void {
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(spaceId)) throw new Error("Space ID is invalid.");
}

/**
 * Coordinates an external MCP tool call with the local Ring preview.
 *
 * inspect() never accepts physical state from MCP/Alexa. It creates a one-shot
 * request that the loopback Ring preview can see. The preview captures a fresh
 * Ring frame, sends it through Nova, then publish() resolves the waiting tool
 * call with the validated semantic observation. Raw image bytes never enter this
 * bridge and are never persisted here.
 */
export class RingObservationBridge implements SpaceObserver {
  private readonly pending = new Map<string, PendingRequest>();
  private sequence = 0;

  constructor(private readonly timeoutMs = 15_000) {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
      throw new Error("Observation bridge timeout must be between 1 and 60 seconds.");
    }
  }

  pendingRequest(spaceId: string): RingObservationRequest | undefined {
    assertSpaceId(spaceId);
    const request = this.pending.get(spaceId);
    if (!request) return undefined;
    return { id: request.id, spaceId: request.spaceId, requestedAt: request.requestedAt };
  }

  publish(input: TrustedRingObservation): void {
    assertSpaceId(input.spaceId);
    if (input.state.spaceId !== input.spaceId) {
      throw new Error("Trusted observation does not belong to the published space.");
    }
    if (!input.observationId || input.observationId.length > 120) {
      throw new Error("Observation ID is invalid.");
    }

    const request = this.pending.get(input.spaceId);
    if (!request) return;
    const receivedAt = input.receivedAt ?? Date.now();
    if (receivedAt < request.requestedAt) return;

    clearTimeout(request.timer);
    this.pending.delete(input.spaceId);
    console.log(`Ring WHEP observation delivered for space ${input.spaceId}.`);
    const observation: AgentObservation = {
      observationId: input.observationId,
      state: structuredClone(input.state),
      evidenceMode: "vision",
    };
    if (input.modelId !== undefined) observation.modelId = input.modelId;
    if (input.latencyMs !== undefined) observation.latencyMs = input.latencyMs;
    request.resolve(observation);
  }

  inspect(spaceId: string): Promise<AgentObservation> {
    assertSpaceId(spaceId);
    if (this.pending.has(spaceId)) {
      return Promise.reject(new Error("A fresh Ring observation is already being requested for this space."));
    }

    return new Promise<AgentObservation>((resolve, reject) => {
      const requestedAt = Date.now();
      const id = `obsreq-${++this.sequence}-${requestedAt}`;
      console.log(`Ring WHEP observation requested for space ${spaceId}.`);
      const timer = setTimeout(() => {
        this.pending.delete(spaceId);
        console.warn(`Ring WHEP observation timed out for space ${spaceId}.`);
        reject(new Error("Timed out waiting for the Ring preview to capture a fresh observation."));
      }, this.timeoutMs);
      this.pending.set(spaceId, { id, spaceId, requestedAt, resolve, reject, timer });
    });
  }

  cancelAll(reason = "Observation bridge stopped."): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
