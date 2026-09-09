import { createHash, randomUUID } from "node:crypto";
import type { Checkpoint, CheckpointStore, CheckpointSummary, SaveCheckpointInput } from "./contracts.js";

function assertToken(value: string, label: string, max = 80) {
  if (!new RegExp(`^[a-zA-Z0-9._ -]{1,${max}}$`).test(value)) {
    throw new Error(`${label} is invalid.`);
  }
}

export function hashPhysicalState(state: SaveCheckpointInput["state"]): string {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

export function buildCheckpoint(input: SaveCheckpointInput, now = new Date()): Checkpoint {
  assertToken(input.spaceId, "Space ID");
  assertToken(input.name.trim(), "Checkpoint name", 120);
  if (!input.observationId || input.observationId.length > 120) throw new Error("Observation ID is invalid.");
  if (input.state.spaceId !== input.spaceId) throw new Error("Observation does not belong to this space.");

  return {
    id: randomUUID(),
    spaceId: input.spaceId,
    name: input.name.trim(),
    observationId: input.observationId,
    state: input.state,
    stateHash: hashPhysicalState(input.state),
    createdAt: now.toISOString(),
  };
}

export function summarizeCheckpoint(checkpoint: Checkpoint): CheckpointSummary {
  return {
    id: checkpoint.id,
    spaceId: checkpoint.spaceId,
    name: checkpoint.name,
    observationId: checkpoint.observationId,
    stateHash: checkpoint.stateHash,
    createdAt: checkpoint.createdAt,
    entityCount: checkpoint.state.entities.length,
  };
}

export class CheckpointService {
  constructor(private readonly store: CheckpointStore) {}

  async save(input: SaveCheckpointInput): Promise<Checkpoint> {
    const checkpoint = buildCheckpoint(input);
    await this.store.save(checkpoint);
    return checkpoint;
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
