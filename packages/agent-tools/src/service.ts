import { randomUUID } from "node:crypto";
import { summarizeCheckpoint } from "../../checkpoints/src/service.js";
import type { Checkpoint, CheckpointSummary } from "../../checkpoints/src/contracts.js";
import {
  calculateMatch,
  compareStates,
  type MatchResult,
  type PhysicalDiff,
} from "../../diff-engine/src/index.js";
import {
  buildRestorePlan,
  updateRestoreProgress,
  type RestorePlan,
  type RestoreProgress,
  type RestoreSessionState,
} from "../../restore-engine/src/index.js";
import type {
  AgentCheckpointAccess,
  AgentObservation,
  CancelRewindToolInput,
  CompareCheckpointResult,
  CompareCheckpointToolInput,
  GetRewindStatusToolInput,
  InspectSpaceInput,
  InspectSpaceResult,
  ListCheckpointsToolInput,
  RewindToolResult,
  SaveCheckpointToolInput,
  SpaceObserver,
  StartRewindToolInput,
  VerifyRewindToolInput,
} from "./contracts.js";

interface AgentRewindSession {
  id: string;
  spaceId: string;
  checkpointId: string;
  checkpoint: CheckpointSummary;
  state: RestoreSessionState;
  match: MatchResult;
  plan: RestorePlan;
  changes: PhysicalDiff[];
  updatedAt: string;
  progress?: RestoreProgress;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function assertSpaceId(value: string): void {
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(value)) throw new Error("Space ID is invalid.");
}

function assertOpaqueId(value: string, label: string): void {
  if (typeof value !== "string" || value.length < 1 || value.length > 120) {
    throw new Error(`${label} is invalid.`);
  }
}

function assertCheckpointName(value: string): void {
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9._ -]{1,120}$/.test(trimmed)) throw new Error("Checkpoint name is invalid.");
}

function stateFrom(match: MatchResult, plan: RestorePlan): RestoreSessionState {
  if (match.restored) return "RESTORED";
  if (plan.actions.length === 0 && plan.blockedUnknowns.length > 0) return "LOW_CONFIDENCE";
  return "GUIDING";
}

function publicResult(session: AgentRewindSession): RewindToolResult {
  const result: RewindToolResult = {
    rewindSessionId: session.id,
    checkpoint: clone(session.checkpoint),
    state: session.state,
    match: clone(session.match),
    plan: clone(session.plan),
    changeCount: session.changes.filter((diff) => diff.type !== "UNCHANGED").length,
    changes: clone(session.changes.filter((diff) => diff.type !== "UNCHANGED")),
  };
  if (session.progress) result.progress = clone(session.progress);
  return result;
}

/**
 * SDK-neutral trust boundary for Strands and later MCP.
 *
 * The caller can choose tools and identifiers, but cannot submit physical state,
 * match percentages, restore plans, or a RESTORED decision. Those are produced
 * only by Ring/Nova perception plus deterministic REWIND code.
 */
export class RewindAgentToolService {
  private readonly latestObservations = new Map<string, AgentObservation>();
  private readonly sessions = new Map<string, AgentRewindSession>();

  constructor(
    private readonly observer: SpaceObserver,
    private readonly checkpoints: AgentCheckpointAccess,
  ) {}

  private rememberObservation(observation: AgentObservation): void {
    this.latestObservations.delete(observation.state.spaceId);
    this.latestObservations.set(observation.state.spaceId, clone(observation));
    while (this.latestObservations.size > 20) {
      const oldest = this.latestObservations.keys().next().value as string | undefined;
      if (!oldest) break;
      this.latestObservations.delete(oldest);
    }
  }

  private latest(spaceId: string): AgentObservation {
    const observation = this.latestObservations.get(spaceId);
    if (!observation) throw new Error("Inspect this space before using its current state.");
    return clone(observation);
  }

  private async checkpoint(spaceId: string, checkpointId: string): Promise<Checkpoint> {
    const checkpoint = await this.checkpoints.get(spaceId, checkpointId);
    if (!checkpoint) throw new Error("Checkpoint not found.");
    return clone(checkpoint);
  }

  private session(spaceId: string, rewindSessionId: string): AgentRewindSession {
    const session = this.sessions.get(rewindSessionId);
    if (!session || session.spaceId !== spaceId) throw new Error("Rewind session not found.");
    return session;
  }

  private async comparison(spaceId: string, checkpointId: string): Promise<{
    checkpoint: Checkpoint;
    diffs: PhysicalDiff[];
    match: MatchResult;
  }> {
    const observation = this.latest(spaceId);
    const checkpoint = await this.checkpoint(spaceId, checkpointId);
    const diffs = compareStates(checkpoint.state, observation.state);
    return { checkpoint, diffs, match: calculateMatch(diffs) };
  }

  async inspectSpace(input: InspectSpaceInput): Promise<InspectSpaceResult> {
    assertSpaceId(input.spaceId);
    const observed = await this.observer.inspect(input.spaceId);
    if (observed.state.spaceId !== input.spaceId) {
      throw new Error("Observation does not belong to the requested space.");
    }
    assertOpaqueId(observed.observationId, "Observation ID");
    this.rememberObservation(observed);
    return {
      observationId: observed.observationId,
      spaceId: observed.state.spaceId,
      capturedAt: observed.state.capturedAt,
      entityCount: observed.state.entities.length,
      entities: observed.state.entities.map((entity) => ({
        key: entity.key,
        category: entity.category,
        confidence: entity.confidence,
      })),
    };
  }

  async saveCheckpoint(input: SaveCheckpointToolInput): Promise<CheckpointSummary> {
    assertSpaceId(input.spaceId);
    assertCheckpointName(input.name);
    const observation = this.latest(input.spaceId);
    const checkpoint = await this.checkpoints.save({
      spaceId: input.spaceId,
      name: input.name.trim(),
      observationId: observation.observationId,
      state: clone(observation.state),
    });
    return summarizeCheckpoint(checkpoint);
  }

  async listCheckpoints(input: ListCheckpointsToolInput): Promise<CheckpointSummary[]> {
    assertSpaceId(input.spaceId);
    return (await this.checkpoints.list(input.spaceId)).map((checkpoint) => summarizeCheckpoint(checkpoint));
  }

  async compareCheckpoint(input: CompareCheckpointToolInput): Promise<CompareCheckpointResult> {
    assertSpaceId(input.spaceId);
    assertOpaqueId(input.checkpointId, "Checkpoint ID");
    const { checkpoint, diffs, match } = await this.comparison(input.spaceId, input.checkpointId);
    const changes = diffs.filter((diff) => diff.type !== "UNCHANGED");
    return {
      checkpoint: summarizeCheckpoint(checkpoint),
      match: clone(match),
      changeCount: changes.length,
      changes: clone(changes),
    };
  }

  async startRewind(input: StartRewindToolInput): Promise<RewindToolResult> {
    assertSpaceId(input.spaceId);
    assertOpaqueId(input.checkpointId, "Checkpoint ID");
    const { checkpoint, diffs, match } = await this.comparison(input.spaceId, input.checkpointId);
    const plan = buildRestorePlan(diffs);
    const session: AgentRewindSession = {
      id: randomUUID(),
      spaceId: input.spaceId,
      checkpointId: input.checkpointId,
      checkpoint: summarizeCheckpoint(checkpoint),
      state: stateFrom(match, plan),
      match: clone(match),
      plan: clone(plan),
      changes: clone(diffs),
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(session.id, session);
    while (this.sessions.size > 20) {
      const oldest = this.sessions.keys().next().value as string | undefined;
      if (!oldest) break;
      this.sessions.delete(oldest);
    }
    return publicResult(session);
  }

  async verifyRewind(input: VerifyRewindToolInput): Promise<RewindToolResult> {
    assertSpaceId(input.spaceId);
    assertOpaqueId(input.rewindSessionId, "Rewind session ID");
    const session = this.session(input.spaceId, input.rewindSessionId);
    if (session.state === "CANCELLED") throw new Error("Rewind session is cancelled.");

    // Verification always takes a fresh trusted observation; the agent cannot provide one.
    await this.inspectSpace({ spaceId: input.spaceId });
    const checkpoint = await this.checkpoint(session.spaceId, session.checkpointId);
    const observation = this.latest(session.spaceId);
    const diffs = compareStates(checkpoint.state, observation.state);
    const match = calculateMatch(diffs);
    const progress = updateRestoreProgress(session.plan, diffs);
    const blockedUnknowns = diffs.filter((diff) => diff.type === "UNKNOWN").map((diff) => diff.entity);
    const plan: RestorePlan = { actions: progress.actions, blockedUnknowns };

    session.checkpoint = summarizeCheckpoint(checkpoint);
    session.match = clone(match);
    session.plan = clone(plan);
    session.changes = clone(diffs);
    session.progress = clone(progress);
    session.state = stateFrom(match, plan);
    session.updatedAt = new Date().toISOString();
    return publicResult(session);
  }

  async getRewindStatus(input: GetRewindStatusToolInput): Promise<RewindToolResult> {
    assertSpaceId(input.spaceId);
    assertOpaqueId(input.rewindSessionId, "Rewind session ID");
    return publicResult(this.session(input.spaceId, input.rewindSessionId));
  }

  async cancelRewind(input: CancelRewindToolInput): Promise<RewindToolResult> {
    assertSpaceId(input.spaceId);
    assertOpaqueId(input.rewindSessionId, "Rewind session ID");
    const session = this.session(input.spaceId, input.rewindSessionId);
    session.state = "CANCELLED";
    session.updatedAt = new Date().toISOString();
    return publicResult(session);
  }
}
