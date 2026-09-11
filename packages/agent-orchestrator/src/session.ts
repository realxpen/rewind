export interface RewindAgentSessionContext {
  actorId: string;
  sessionId: string;
  activeSpaceId?: string;
  activeCheckpointId?: string;
  activeCheckpointName?: string;
  activeRewindSessionId?: string;
  lastDeterministicState?: string;
  updatedAt: string;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

export interface SessionContinuityStore {
  loadContext(actorId: string, sessionId: string): Promise<RewindAgentSessionContext>;
  saveContext(context: RewindAgentSessionContext): Promise<void>;
  loadTurns(actorId: string, sessionId: string, limit?: number): Promise<ConversationTurn[]>;
  appendTurn(actorId: string, sessionId: string, turn: ConversationTurn): Promise<void>;
}

export function emptySessionContext(actorId: string, sessionId: string): RewindAgentSessionContext {
  return {
    actorId,
    sessionId,
    updatedAt: new Date(0).toISOString(),
  };
}

export class InMemorySessionContinuityStore implements SessionContinuityStore {
  private readonly contexts = new Map<string, RewindAgentSessionContext>();
  private readonly turns = new Map<string, ConversationTurn[]>();

  private key(actorId: string, sessionId: string): string {
    return `${actorId}\u0000${sessionId}`;
  }

  async loadContext(actorId: string, sessionId: string): Promise<RewindAgentSessionContext> {
    return structuredClone(this.contexts.get(this.key(actorId, sessionId)) ?? emptySessionContext(actorId, sessionId));
  }

  async saveContext(context: RewindAgentSessionContext): Promise<void> {
    this.contexts.set(this.key(context.actorId, context.sessionId), structuredClone(context));
  }

  async loadTurns(actorId: string, sessionId: string, limit = 20): Promise<ConversationTurn[]> {
    const rows = this.turns.get(this.key(actorId, sessionId)) ?? [];
    return structuredClone(rows.slice(-Math.max(0, limit)));
  }

  async appendTurn(actorId: string, sessionId: string, turn: ConversationTurn): Promise<void> {
    const key = this.key(actorId, sessionId);
    const rows = this.turns.get(key) ?? [];
    rows.push(structuredClone(turn));
    this.turns.set(key, rows.slice(-100));
  }
}
