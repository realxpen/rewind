import { Agent, BedrockModel } from "@strands-agents/sdk";
import type { RewindAgentToolService } from "../../agent-tools/src/index.js";
import { RewindToolController } from "./controller.js";
import {
  detectCriticalIntent,
  operationSatisfied,
  renderCompareResult,
  renderRewindResult,
  type CriticalIntent,
} from "./critical-intent.js";
import type { RewindAgentSessionContext, SessionContinuityStore } from "./session.js";
import { createRewindStrandsTools } from "./tools.js";

export interface RewindAgentInvocation {
  actorId: string;
  sessionId: string;
  prompt: string;
}

export interface RewindAgentInvocationResult {
  text: string;
  stopReason: string;
  session: RewindAgentSessionContext;
}

export interface RewindAgentOrchestratorOptions {
  toolService: RewindAgentToolService;
  continuity: SessionContinuityStore;
  region?: string;
  modelId?: string;
  defaultSpaceId?: string;
}

function textFromMessage(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content.map(block => {
    if (!block || typeof block !== "object") return "";
    const text = (block as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }).filter(Boolean).join("\n").trim();
}

function contextForPrompt(context: RewindAgentSessionContext, defaultSpaceId?: string): string {
  const rows = [
    `actorId=${context.actorId}`,
    `sessionId=${context.sessionId}`,
    context.activeSpaceId ? `activeSpaceId=${context.activeSpaceId}` : "activeSpaceId=none",
    defaultSpaceId ? `defaultSpaceId=${defaultSpaceId}` : "defaultSpaceId=none",
    context.activeCheckpointId ? `activeCheckpointId=${context.activeCheckpointId}` : "activeCheckpointId=none",
    context.activeCheckpointName ? `activeCheckpointName=${context.activeCheckpointName}` : "activeCheckpointName=none",
    context.activeRewindSessionId ? `activeRewindSessionId=${context.activeRewindSessionId}` : "activeRewindSessionId=none",
    context.lastDeterministicState ? `lastDeterministicState=${context.lastDeterministicState}` : "lastDeterministicState=none",
  ];
  return rows.join("\n");
}

function systemPrompt(context: RewindAgentSessionContext, defaultSpaceId?: string): string {
  return `You are REWIND, a physical-state restoration agent. REWIND is Ctrl+Z for reality.

NON-NEGOTIABLE TRUST BOUNDARY
- AI interprets intent and chooses approved tools. Deterministic REWIND code decides physical truth.
- Never invent an observation, checkpoint ID, Rewind session ID, diff, match percentage, restore action, or RESTORED state.
- Never claim the scene is restored unless a REWIND tool result returned state=RESTORED or match.restored=true for the relevant operation.
- Never rewrite checkpoint state or ask the user to provide physical-state JSON.
- UNKNOWN/LOW_CONFIDENCE means re-observe or explain uncertainty. Do not guess.
- A user request to compare, rewind, or verify MUST invoke compare_checkpoint, start_rewind, or verify_rewind respectively in that turn. Never answer those requests from conversational history alone.

SPACE RESOLUTION
- If the session already has activeSpaceId, use it unless the user explicitly names another configured space.
- If no active space exists and defaultSpaceId is present, phrases such as "my studio", "the studio", "my space", or "the room" refer to defaultSpaceId. Call the requested tool immediately; do not ask the user for an internal space ID.
- Never invent a different space ID from free-form language.

FRESHNESS GUARANTEE
- compare_checkpoint performs its own fresh trusted observation before deterministic comparison. Do NOT call inspect_space first unless the user explicitly asked to inspect separately.
- start_rewind performs its own fresh trusted observation before deterministic plan generation. Do NOT call inspect_space first unless the user explicitly asked to inspect separately.
- verify_rewind always performs its own fresh trusted observation.

INTENT TO TOOL GUIDANCE
- inspect/look/check the space -> inspect_space
- save/remember this state -> inspect_space when needed, then save_checkpoint
- list/show checkpoints -> list_checkpoints
- what changed/compare -> compare_checkpoint
- rewind/restore -> start_rewind; present only its returned plan
- check again/verify/did that fix it -> verify_rewind
- status/progress -> get_rewind_status
- stop/cancel -> cancel_rewind

Use the active/default identifiers below when appropriate. If an identifier other than space is missing, use an approved discovery tool rather than fabricating one.

SESSION CONTEXT (continuity metadata only; not physical truth)
${contextForPrompt(context, defaultSpaceId)}

Keep responses concise and action-oriented. When a restoration plan is active, give the next pending instruction and the deterministic match/progress returned by the tool.`;
}

async function enforceCriticalIntent(
  intent: CriticalIntent,
  controller: RewindToolController,
  operationMark: number,
): Promise<string> {
  const operations = controller.operationsSince(operationMark);

  if (!operationSatisfied(intent, operations)) {
    if (intent === "compare_checkpoint") await controller.compareCheckpoint({});
    else if (intent === "start_rewind") await controller.startRewind({});
    else await controller.verifyRewind({});
  }

  if (intent === "compare_checkpoint") {
    const authoritative = controller.latestCompareResult();
    if (!authoritative) throw new Error("Critical compare did not produce an authoritative result.");
    return renderCompareResult(authoritative);
  }

  const authoritative = controller.latestRewindResult();
  if (!authoritative) throw new Error("Critical Rewind operation did not produce an authoritative result.");
  return renderRewindResult(authoritative, intent);
}

export class RewindAgentOrchestrator {
  private readonly model: BedrockModel;

  constructor(private readonly options: RewindAgentOrchestratorOptions) {
    this.model = new BedrockModel({
      region: options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
      modelId: options.modelId ?? process.env.REWIND_AGENT_MODEL_ID ?? "global.amazon.nova-2-lite-v1:0",
      temperature: 0.1,
      maxTokens: 1600,
    });
  }

  async invoke(input: RewindAgentInvocation): Promise<RewindAgentInvocationResult> {
    const prompt = input.prompt.trim();
    if (!prompt || prompt.length > 8_000) throw new Error("Prompt must contain 1 to 8000 characters.");

    const defaultSpaceId = this.options.defaultSpaceId ?? process.env.REWIND_DEFAULT_SPACE_ID;
    const controller = await RewindToolController.create(
      this.options.toolService,
      this.options.continuity,
      input.actorId,
      input.sessionId,
      defaultSpaceId,
    );
    const priorTurns = await this.options.continuity.loadTurns(input.actorId, input.sessionId, 20);
    const startedAt = new Date().toISOString();
    await this.options.continuity.appendTurn(input.actorId, input.sessionId, {
      role: "user",
      text: prompt,
      createdAt: startedAt,
    });

    const operationMark = controller.operationMark();
    const agent = new Agent({
      id: "rewind-orchestrator",
      name: "REWIND",
      description: "Restores a physical space to a saved semantic checkpoint through approved deterministic tools.",
      model: this.model,
      systemPrompt: systemPrompt(controller.snapshot(), defaultSpaceId),
      tools: createRewindStrandsTools(controller),
      messages: priorTurns.map(turn => ({
        role: turn.role,
        content: [{ text: turn.text }],
      })),
      printer: false,
    });

    const result = await agent.invoke(prompt);
    const criticalIntent = detectCriticalIntent(prompt);
    const text = criticalIntent
      ? await enforceCriticalIntent(criticalIntent, controller, operationMark)
      : textFromMessage(result.lastMessage) || result.toString();

    await this.options.continuity.appendTurn(input.actorId, input.sessionId, {
      role: "assistant",
      text,
      createdAt: new Date().toISOString(),
    });

    return {
      text,
      stopReason: String(result.stopReason),
      session: controller.snapshot(),
    };
  }
}
