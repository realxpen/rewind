import {
  BedrockAgentCoreClient,
  CreateEventCommand,
  ListEventsCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import {
  emptySessionContext,
  type ConversationTurn,
  type RewindAgentSessionContext,
  type SessionContinuityStore,
} from "./session.js";

interface AgentCoreMemoryClientLike {
  send(command: unknown): Promise<unknown>;
}

export interface AgentCoreSessionContinuityOptions {
  memoryId: string;
  region?: string;
  client?: AgentCoreMemoryClientLike;
}

function assertMemoryId(value: string): void {
  if (typeof value !== "string" || value.length < 12 || value.length > 220) {
    throw new Error("REWIND AgentCore memory ID is invalid.");
  }
}

function assertSessionToken(value: string, label: string): void {
  if (!/^[A-Za-z0-9._:/=@+-]{1,120}$/.test(value)) throw new Error(`${label} is invalid.`);
}

function eventTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function eventPayloads(event: unknown): unknown[] {
  const record = asRecord(event);
  return Array.isArray(record?.payload) ? record.payload : [];
}

function jsonPayload(payload: unknown): Record<string, unknown> | undefined {
  const wrapper = asRecord(payload);
  const json = asRecord(wrapper?.json);
  return asRecord(json?.content);
}

function conversationalPayload(payload: unknown): { role: string; text: string } | undefined {
  const wrapper = asRecord(payload);
  const conversational = asRecord(wrapper?.conversational);
  const content = asRecord(conversational?.content);
  const role = conversational?.role;
  const text = content?.text;
  return typeof role === "string" && typeof text === "string" ? { role, text } : undefined;
}

/**
 * AgentCore is continuity only. Physical/checkpoint truth remains in REWIND's
 * deterministic services and DynamoDB. All events use extractionMode=SKIP so
 * operational IDs and conversation turns stay short-term rather than becoming
 * long-term learned memory.
 */
export class AgentCoreSessionContinuityStore implements SessionContinuityStore {
  private readonly client: AgentCoreMemoryClientLike;
  private readonly memoryId: string;

  constructor(options: AgentCoreSessionContinuityOptions) {
    assertMemoryId(options.memoryId);
    this.memoryId = options.memoryId;
    this.client = options.client ?? new BedrockAgentCoreClient({
      region: options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
    });
  }

  private async events(actorId: string, sessionId: string): Promise<unknown[]> {
    assertSessionToken(actorId, "Actor ID");
    assertSessionToken(sessionId, "Session ID");
    const response = await this.client.send(new ListEventsCommand({
      memoryId: this.memoryId,
      actorId,
      sessionId,
      includePayloads: true,
      maxResults: 100,
    })) as { events?: unknown[] };
    return [...(response.events ?? [])].sort((a, b) => eventTime(asRecord(a)?.eventTimestamp) - eventTime(asRecord(b)?.eventTimestamp));
  }

  async loadContext(actorId: string, sessionId: string): Promise<RewindAgentSessionContext> {
    const events = await this.events(actorId, sessionId);
    for (let index = events.length - 1; index >= 0; index -= 1) {
      for (const payload of eventPayloads(events[index])) {
        const content = jsonPayload(payload);
        if (content?.kind !== "rewind_session_context") continue;
        const context = asRecord(content.context);
        if (!context) continue;
        return {
          actorId,
          sessionId,
          ...(typeof context.activeSpaceId === "string" ? { activeSpaceId: context.activeSpaceId } : {}),
          ...(typeof context.activeCheckpointId === "string" ? { activeCheckpointId: context.activeCheckpointId } : {}),
          ...(typeof context.activeCheckpointName === "string" ? { activeCheckpointName: context.activeCheckpointName } : {}),
          ...(typeof context.activeRewindSessionId === "string" ? { activeRewindSessionId: context.activeRewindSessionId } : {}),
          ...(typeof context.lastDeterministicState === "string" ? { lastDeterministicState: context.lastDeterministicState } : {}),
          updatedAt: typeof context.updatedAt === "string" ? context.updatedAt : new Date(0).toISOString(),
        };
      }
    }
    return emptySessionContext(actorId, sessionId);
  }

  async saveContext(context: RewindAgentSessionContext): Promise<void> {
    assertSessionToken(context.actorId, "Actor ID");
    assertSessionToken(context.sessionId, "Session ID");
    await this.client.send(new CreateEventCommand({
      memoryId: this.memoryId,
      actorId: context.actorId,
      sessionId: context.sessionId,
      eventTimestamp: new Date(),
      extractionMode: "SKIP",
      payload: [{
        json: {
          content: {
            kind: "rewind_session_context",
            context,
          },
        },
      }],
    }));
  }

  async loadTurns(actorId: string, sessionId: string, limit = 20): Promise<ConversationTurn[]> {
    const turns: ConversationTurn[] = [];
    for (const event of await this.events(actorId, sessionId)) {
      const createdAt = new Date(eventTime(asRecord(event)?.eventTimestamp) || 0).toISOString();
      for (const payload of eventPayloads(event)) {
        const message = conversationalPayload(payload);
        if (!message || !["USER", "ASSISTANT"].includes(message.role)) continue;
        turns.push({
          role: message.role === "USER" ? "user" : "assistant",
          text: message.text,
          createdAt,
        });
      }
    }
    return turns.slice(-Math.max(0, limit));
  }

  async appendTurn(actorId: string, sessionId: string, turn: ConversationTurn): Promise<void> {
    assertSessionToken(actorId, "Actor ID");
    assertSessionToken(sessionId, "Session ID");
    const text = turn.text.trim().slice(0, 8_000);
    if (!text) return;
    await this.client.send(new CreateEventCommand({
      memoryId: this.memoryId,
      actorId,
      sessionId,
      eventTimestamp: new Date(turn.createdAt),
      extractionMode: "SKIP",
      payload: [{
        conversational: {
          content: { text },
          role: turn.role === "user" ? "USER" : "ASSISTANT",
        },
      }],
    }));
  }
}
