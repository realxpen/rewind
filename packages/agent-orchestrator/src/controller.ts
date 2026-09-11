import type {
  CompareCheckpointResult,
  InspectSpaceResult,
  RewindAgentToolService,
  RewindToolResult,
} from "../../agent-tools/src/index.js";
import type { CheckpointSummary } from "../../checkpoints/src/contracts.js";
import type {
  RewindAgentSessionContext,
  SessionContinuityStore,
} from "./session.js";

export interface ContextualSpaceInput { spaceId?: string | undefined }
export interface ContextualSaveCheckpointInput extends ContextualSpaceInput { name: string }
export interface ContextualCheckpointInput extends ContextualSpaceInput { checkpointId?: string | undefined }
export interface ContextualRewindInput extends ContextualSpaceInput { rewindSessionId?: string | undefined }

export class RewindToolController {
  private constructor(
    private readonly service: RewindAgentToolService,
    private readonly continuity: SessionContinuityStore,
    private context: RewindAgentSessionContext,
    private readonly defaultSpaceId: string | undefined,
  ) {}

  static async create(
    service: RewindAgentToolService,
    continuity: SessionContinuityStore,
    actorId: string,
    sessionId: string,
    defaultSpaceId?: string,
  ): Promise<RewindToolController> {
    const context = await continuity.loadContext(actorId, sessionId);
    return new RewindToolController(service, continuity, context, defaultSpaceId);
  }

  snapshot(): RewindAgentSessionContext {
    return structuredClone(this.context);
  }

  private spaceId(candidate?: string): string {
    const value = candidate ?? this.context.activeSpaceId ?? this.defaultSpaceId;
    if (!value) throw new Error("No active space. Inspect a space first or provide spaceId.");
    return value;
  }

  private checkpointId(candidate?: string): string {
    const value = candidate ?? this.context.activeCheckpointId;
    if (!value) throw new Error("No active checkpoint. Save or list/select a checkpoint first.");
    return value;
  }

  private rewindSessionId(candidate?: string): string {
    const value = candidate ?? this.context.activeRewindSessionId;
    if (!value) throw new Error("No active Rewind session. Start Rewind first.");
    return value;
  }

  private async persist(patch: Partial<RewindAgentSessionContext>): Promise<void> {
    this.context = {
      ...this.context,
      ...patch,
      actorId: this.context.actorId,
      sessionId: this.context.sessionId,
      updatedAt: new Date().toISOString(),
    };
    await this.continuity.saveContext(this.context);
  }

  async inspectSpace(input: ContextualSpaceInput): Promise<InspectSpaceResult> {
    const spaceId = this.spaceId(input.spaceId);
    const result = await this.service.inspectSpace({ spaceId });
    await this.persist({ activeSpaceId: result.spaceId });
    return result;
  }

  async saveCheckpoint(input: ContextualSaveCheckpointInput): Promise<CheckpointSummary> {
    const spaceId = this.spaceId(input.spaceId);
    const result = await this.service.saveCheckpoint({ spaceId, name: input.name });
    await this.persist({
      activeSpaceId: spaceId,
      activeCheckpointId: result.id,
      activeCheckpointName: result.name,
    });
    return result;
  }

  async listCheckpoints(input: ContextualSpaceInput): Promise<CheckpointSummary[]> {
    const spaceId = this.spaceId(input.spaceId);
    const results = await this.service.listCheckpoints({ spaceId });
    await this.persist({ activeSpaceId: spaceId });
    return results;
  }

  async compareCheckpoint(input: ContextualCheckpointInput): Promise<CompareCheckpointResult> {
    const spaceId = this.spaceId(input.spaceId);
    const checkpointId = this.checkpointId(input.checkpointId);

    // Comparison must never rely on a stale cached observation. Refresh physical
    // reality at the deterministic boundary even if Strands omits inspect_space.
    await this.service.inspectSpace({ spaceId });
    const result = await this.service.compareCheckpoint({ spaceId, checkpointId });
    await this.persist({
      activeSpaceId: spaceId,
      activeCheckpointId: checkpointId,
      activeCheckpointName: result.checkpoint.name,
      lastDeterministicState: result.match.restored ? "RESTORED" : "DIFF_READY",
    });
    return result;
  }

  async startRewind(input: ContextualCheckpointInput): Promise<RewindToolResult> {
    const spaceId = this.spaceId(input.spaceId);
    const checkpointId = this.checkpointId(input.checkpointId);

    // Rewind planning also starts from a fresh trusted observation so a previous
    // comparison cannot become stale after the user changes the physical scene.
    await this.service.inspectSpace({ spaceId });
    const result = await this.service.startRewind({ spaceId, checkpointId });
    await this.persist({
      activeSpaceId: spaceId,
      activeCheckpointId: checkpointId,
      activeCheckpointName: result.checkpoint.name,
      activeRewindSessionId: result.rewindSessionId,
      lastDeterministicState: result.state,
    });
    return result;
  }

  async verifyRewind(input: ContextualRewindInput): Promise<RewindToolResult> {
    const spaceId = this.spaceId(input.spaceId);
    const rewindSessionId = this.rewindSessionId(input.rewindSessionId);
    const result = await this.service.verifyRewind({ spaceId, rewindSessionId });
    await this.persist({
      activeSpaceId: spaceId,
      activeCheckpointId: result.checkpoint.id,
      activeCheckpointName: result.checkpoint.name,
      activeRewindSessionId: rewindSessionId,
      lastDeterministicState: result.state,
    });
    return result;
  }

  async getRewindStatus(input: ContextualRewindInput): Promise<RewindToolResult> {
    const spaceId = this.spaceId(input.spaceId);
    const rewindSessionId = this.rewindSessionId(input.rewindSessionId);
    const result = await this.service.getRewindStatus({ spaceId, rewindSessionId });
    await this.persist({
      activeSpaceId: spaceId,
      activeCheckpointId: result.checkpoint.id,
      activeCheckpointName: result.checkpoint.name,
      activeRewindSessionId: rewindSessionId,
      lastDeterministicState: result.state,
    });
    return result;
  }

  async cancelRewind(input: ContextualRewindInput): Promise<RewindToolResult> {
    const spaceId = this.spaceId(input.spaceId);
    const rewindSessionId = this.rewindSessionId(input.rewindSessionId);
    const result = await this.service.cancelRewind({ spaceId, rewindSessionId });
    const { activeRewindSessionId: _removed, ...withoutActiveRewind } = this.context;
    this.context = {
      ...withoutActiveRewind,
      activeSpaceId: spaceId,
      lastDeterministicState: result.state,
      updatedAt: new Date().toISOString(),
    };
    await this.continuity.saveContext(this.context);
    return result;
  }
}
