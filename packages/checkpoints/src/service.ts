import { createHash, randomUUID } from "node:crypto";
import type {
  AddCheckpointViewInput,
  Checkpoint,
  CheckpointStore,
  CheckpointSummary,
  CheckpointView,
  SaveCheckpointInput,
} from "./contracts.js";

function assertToken(value: string, label: string, max = 80) {
  if (!new RegExp(`^[a-zA-Z0-9._ -]{1,${max}}$`).test(value)) {
    throw new Error(`${label} is invalid.`);
  }
}

function assertCheckpointName(value: string) {
  if (!/^[a-zA-Z0-9._ ()-]{1,120}$/.test(value)) {
    throw new Error("Checkpoint name is invalid.");
  }
}

function assertImageHash(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("Source image hash is invalid.");
}

function assertObservation(input: {
  spaceId: string;
  observationId: string;
  state: SaveCheckpointInput["state"];
  sourceImageHash?: string;
}) {
  assertToken(input.spaceId, "Space ID");
  if (!input.observationId || input.observationId.length > 120) throw new Error("Observation ID is invalid.");
  if (input.state.spaceId !== input.spaceId) throw new Error("Observation does not belong to this space.");
  if (input.sourceImageHash !== undefined) assertImageHash(input.sourceImageHash);
}

export function hashPhysicalState(state: SaveCheckpointInput["state"]): string {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

export function buildCheckpointView(
  input: Pick<SaveCheckpointInput, "observationId" | "state" | "sourceImageHash">,
  now = new Date(),
  id = randomUUID(),
): CheckpointView {
  const stateHash = hashPhysicalState(input.state);
  return {
    id,
    observationId: input.observationId,
    state: structuredClone(input.state),
    stateHash,
    ...(input.sourceImageHash ? { sourceImageHash: input.sourceImageHash } : {}),
    createdAt: now.toISOString(),
  };
}

export function checkpointViews(checkpoint: Checkpoint): CheckpointView[] {
  if (checkpoint.views?.length) return checkpoint.views;
  return [{
    id: "legacy-primary",
    observationId: checkpoint.observationId,
    state: checkpoint.state,
    stateHash: checkpoint.stateHash,
    ...(checkpoint.sourceImageHash ? { sourceImageHash: checkpoint.sourceImageHash } : {}),
    createdAt: checkpoint.createdAt,
  }];
}

export function buildCheckpoint(input: SaveCheckpointInput, now = new Date()): Checkpoint {
  assertObservation(input);
  assertCheckpointName(input.name.trim());

  const primaryView = buildCheckpointView(input, now, "primary");

  return {
    id: randomUUID(),
    spaceId: input.spaceId,
    name: input.name.trim(),
    observationId: input.observationId,
    state: structuredClone(input.state),
    stateHash: primaryView.stateHash,
    ...(input.sourceImageHash ? { sourceImageHash: input.sourceImageHash } : {}),
    views: [primaryView],
    createdAt: now.toISOString(),
  };
}

export function summarizeCheckpoint(checkpoint: Checkpoint): CheckpointSummary {
  const views = checkpointViews(checkpoint);
  return {
    id: checkpoint.id,
    spaceId: checkpoint.spaceId,
    name: checkpoint.name,
    observationId: checkpoint.observationId,
    stateHash: checkpoint.stateHash,
    createdAt: checkpoint.createdAt,
    entityCount: checkpoint.state.entities.length,
    viewCount: views.length,
    exactImageVerificationAvailable: views.some(view => Boolean(view.sourceImageHash)),
  };
}

export class CheckpointService {
  constructor(private readonly store: CheckpointStore) {}

  async save(input: SaveCheckpointInput): Promise<Checkpoint> {
    const checkpoint = buildCheckpoint(input);
    await this.store.save(checkpoint);
    return checkpoint;
  }

  async addView(input: AddCheckpointViewInput): Promise<Checkpoint> {
    assertObservation(input);
    if (!input.checkpointId || input.checkpointId.length > 120) throw new Error("Checkpoint ID is invalid.");

    const checkpoint = await this.store.get(input.spaceId, input.checkpointId);
    if (!checkpoint) throw new Error("Checkpoint not found.");

    const views = checkpointViews(checkpoint).map(view => structuredClone(view));
    if (views.length >= 5) throw new Error("Checkpoint already has the maximum of 5 semantic views.");

    const newView = buildCheckpointView(input);
    const duplicateFingerprint = newView.sourceImageHash &&
      views.some(view => view.sourceImageHash === newView.sourceImageHash);
    if (duplicateFingerprint) throw new Error("This checkpoint view has already been saved.");

    const updated: Checkpoint = {
      ...checkpoint,
      views: [...views, newView],
    };

    await this.store.update(updated);
    return updated;
  }

  async list(spaceId: string): Promise<Checkpoint[]> {
    assertToken(spaceId, "Space ID");
    return this.store.list(spaceId);
  }

  async get(spaceId: string, checkpointId: string): Promise<Checkpoint | undefined> {
    assertToken(spaceId, "Space ID");
    if (!checkpointId || checkpointId.length > 120) throw new Error("Checkpoint ID is invalid.");
    return this.store.get(spaceId, checkpointId);
  }
}
