import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { BedrockNovaVisionClient } from "../packages/vision/src/bedrock.js";
import type { TrackedEntityHint } from "../packages/vision/src/contracts.js";
import { extractJsonObject } from "../packages/vision/src/extract-json.js";
import { CheckpointService, DynamoCheckpointStore, summarizeCheckpoint } from "../packages/checkpoints/src/index.js";
import type { Checkpoint } from "../packages/checkpoints/src/contracts.js";
import { compareStates, calculateMatch } from "../packages/diff-engine/src/index.js";
import { buildRestorePlan, updateRestoreProgress } from "../packages/restore-engine/src/index.js";
import type { RewindToolResult } from "../packages/agent-tools/src/contracts.js";
import type { PhysicalState } from "../packages/physical-state-protocol/src/index.js";
import {
  mergeConsensusAdditions,
  reconcileTrackedEntityAliases,
  trackedEntitiesFromReferenceState,
} from "../packages/ring/src/tracked-entities.js";
import type { TrackedAdditionEvidence } from "../packages/ring/src/tracked-entities.js";
import type { AlexaRequestEnvelope, AlexaResponseEnvelope } from "../packages/alexa-skill/src/types.js";

interface RequestLike {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  status(code: number): ResponseLike;
  setHeader(name: string, value: string): void;
  json(value: unknown): void;
  end(value?: string): void;
}

interface RuntimeObservation {
  spaceId: string;
  observationId: string;
  state: PhysicalState;
  evidenceMode: "vision";
  modelId?: string;
  latencyMs?: number;
  updatedAt: string;
}

interface PersistentVoiceState {
  spaceId: string;
  checkpointId?: string;
  checkpointName?: string;
  rewindSessionId?: string;
  latestResult?: RewindToolResult;
  actionIndex: number;
  statusMessage?: string;
  lastSpeech?: string;
  updatedAt: string;
}

interface WebVoiceRequest {
  sessionId?: string;
  spaceId?: string;
  transcript?: string;
  checkpointId?: string;
  checkpointName?: string;
}

interface WebVoiceResponse {
  transcript: string;
  command: "remember" | "rewind" | "check" | "status" | "next" | "list" | "repeat" | "help" | "unknown";
  text: string;
  checkpointName?: string;
  state?: string;
  changeCount?: number;
  pendingActions?: number;
}

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const modelId = process.env.BEDROCK_MODEL_ID ?? "global.amazon.nova-2-lite-v1:0";
const defaultSpaceId = process.env.REWIND_DEFAULT_SPACE_ID?.trim() || "phone-my-room";
const tableName = process.env.DYNAMODB_CHECKPOINTS_TABLE?.trim() || "";

const roleArn = process.env.AWS_ROLE_ARN?.trim();
const credentials = roleArn
  ? awsCredentialsProvider({ roleArn })
  : undefined;

const awsClientConfig = {
  region,
  ...(credentials ? { credentials } : {}),
};

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig));
const bedrockClient = new BedrockRuntimeClient(awsClientConfig);
const nova = new BedrockNovaVisionClient({ region, modelId, client: bedrockClient });
const checkpoints = tableName
  ? new CheckpointService(new DynamoCheckpointStore(tableName, documentClient))
  : undefined;

function requireConfigured(): CheckpointService {
  if (!tableName || !checkpoints) throw new Error("DYNAMODB_CHECKPOINTS_TABLE is not configured.");
  return checkpoints;
}

function validSpaceId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{1,80}$/.test(value);
}

function validOpaqueId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 120;
}

function send(res: ResponseLike, status: number, value: unknown): void {
  res.status(status);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.json(value);
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/checkpoint not found/i.test(message)) return "Checkpoint not found.";
  if (/DYNAMODB_CHECKPOINTS_TABLE/i.test(message)) return "Server storage is not configured.";
  if (/credentials|credential/i.test(message)) return "AWS credentials are not configured for this deployment.";
  if (/access denied|not authorized/i.test(message)) return "AWS rejected this deployment's permissions.";
  if (/Nova returned no text/i.test(message)) return "Nova did not return a usable observation.";
  return "REWIND could not complete this request.";
}

function parseBody(req: RequestLike): Record<string, unknown> {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === "string" && req.body.trim()) {
    return JSON.parse(req.body) as Record<string, unknown>;
  }
  return {};
}

function routePath(req: RequestLike): string {
  const hostHeader = req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const url = new URL(req.url ?? "/", `https://${host || "localhost"}`);
  return url.pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
}

function queryValue(req: RequestLike, name: string): string | undefined {
  const value = req.query?.[name];
  if (Array.isArray(value)) return value[0];
  if (typeof value === "string") return value;
  const hostHeader = req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const url = new URL(req.url ?? "/", `https://${host || "localhost"}`);
  return url.searchParams.get(name) ?? undefined;
}

function runtimePartition(kind: "scene" | "voice", value: string): string {
  return `__rewind_runtime__:${kind}:${value}`;
}

async function putRuntime(spaceId: string, id: string, item: Record<string, unknown>): Promise<void> {
  if (!tableName) throw new Error("DYNAMODB_CHECKPOINTS_TABLE is not configured.");
  await documentClient.send(new PutCommand({
    TableName: tableName,
    // Internal runtime keys must win over payload fields such as observation.spaceId.
    Item: { ...item, spaceId, id },
  }));
}

async function getRuntime<T>(spaceId: string, id: string): Promise<T | undefined> {
  if (!tableName) throw new Error("DYNAMODB_CHECKPOINTS_TABLE is not configured.");
  const result = await documentClient.send(new GetCommand({
    TableName: tableName,
    Key: { spaceId, id },
  })) as { Item?: Record<string, unknown> };
  if (!result.Item) return undefined;
  if (result.Item.payload && typeof result.Item.payload === "object") {
    return result.Item.payload as T;
  }

  // Backward compatibility for runtime rows written before payload wrapping.
  const { spaceId: _spaceId, id: _id, ...rest } = result.Item;
  return rest as T;
}

async function saveLatestObservation(observation: RuntimeObservation): Promise<void> {
  await putRuntime(runtimePartition("scene", observation.spaceId), "latest", {
    kind: "LATEST_OBSERVATION",
    ...observation,
  });
}

async function latestObservation(spaceId: string): Promise<RuntimeObservation> {
  const observation = await getRuntime<RuntimeObservation>(runtimePartition("scene", spaceId), "latest");
  if (observation) {
    return {
      ...observation,
      spaceId: validSpaceId(observation.spaceId) ? observation.spaceId : spaceId,
    };
  }

  // Compatibility path for observations written before runtime partition keys
  // were made authoritative. Migrate the legacy row forward on first read.
  const legacy = await getRuntime<RuntimeObservation & { kind?: string }>(spaceId, "latest");
  if (legacy?.kind === "LATEST_OBSERVATION" && legacy.observationId && legacy.state) {
    const migrated: RuntimeObservation = {
      spaceId,
      observationId: legacy.observationId,
      state: legacy.state,
      evidenceMode: "vision",
      ...(legacy.modelId ? { modelId: legacy.modelId } : {}),
      ...(typeof legacy.latencyMs === "number" ? { latencyMs: legacy.latencyMs } : {}),
      updatedAt: legacy.updatedAt ?? new Date().toISOString(),
    };
    await saveLatestObservation(migrated);
    return migrated;
  }

  throw new Error("Analyze a photo for this space first.");
}

function voiceKey(envelope: AlexaRequestEnvelope): string {
  const userId = envelope.context?.System?.user?.userId
    ?? envelope.session?.user?.userId
    ?? "rewind-alexa-demo-user";
  return createHash("sha256").update(userId).digest("hex");
}

async function loadVoiceStateByKey(key: string): Promise<PersistentVoiceState> {
  const stored = await getRuntime<PersistentVoiceState>(runtimePartition("voice", key), "state");
  if (stored) {
    return {
      ...stored,
      spaceId: validSpaceId(stored.spaceId) ? stored.spaceId : defaultSpaceId,
      actionIndex: Number.isInteger(stored.actionIndex) ? stored.actionIndex : 0,
    };
  }
  return {
    spaceId: defaultSpaceId,
    actionIndex: 0,
    updatedAt: new Date().toISOString(),
  };
}

async function saveVoiceStateByKey(key: string, state: PersistentVoiceState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await putRuntime(runtimePartition("voice", key), "state", state as unknown as Record<string, unknown>);
}

async function loadVoiceState(envelope: AlexaRequestEnvelope): Promise<PersistentVoiceState> {
  return loadVoiceStateByKey(voiceKey(envelope));
}

async function saveVoiceState(envelope: AlexaRequestEnvelope, state: PersistentVoiceState): Promise<void> {
  await saveVoiceStateByKey(voiceKey(envelope), state);
}

function alexaResponse(text: string, shouldEndSession = false, reprompt?: string): AlexaResponseEnvelope {
  return {
    version: "1.0",
    response: {
      outputSpeech: { type: "PlainText", text },
      ...(reprompt ? {
        reprompt: { outputSpeech: { type: "PlainText", text: reprompt } },
      } : {}),
      shouldEndSession,
    },
  };
}

function humanEntityKey(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/\bmain\b/gi, "").replace(/\s+/g, " ").trim();
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function checkpointSlot(envelope: AlexaRequestEnvelope): string | undefined {
  const slots = envelope.request?.intent?.slots;
  return slots?.checkpointName?.value?.trim()
    || slots?.stateName?.value?.trim()
    || slots?.checkpoint?.value?.trim();
}

function pendingActions(result: RewindToolResult | undefined) {
  return result?.plan.actions.filter(action => action.status === "PENDING") ?? [];
}

function resultSpeech(result: RewindToolResult, checkpointName?: string): string {
  const name = checkpointName || result.checkpoint.name;
  const actions = pendingActions(result);
  if (actions.length > 0) {
    return `I found ${actions.length} important ${actions.length === 1 ? "change" : "changes"} from ${name}. First, ${actions[0]!.instruction} Say next step to hear another instruction, or analyze another photo and say check again.`;
  }
  if (result.state === "LOW_CONFIDENCE" || result.plan.blockedUnknowns.length > 0) {
    const blocked = result.plan.blockedUnknowns.map(humanEntityKey).filter(Boolean);
    const named = blocked.slice(0, 2);
    const itemPhrase = named.length
      ? ` I couldn't confidently verify ${named.join(named.length === 2 ? " and " : "")}${blocked.length > 2 ? ` and ${blocked.length - 2} more` : ""}.`
      : "";
    return `I don't see a confirmed important change from ${name}, but I don't have enough visual evidence to call it fully restored yet.${itemPhrase} Analyze a clearer photo and ask me to check again.`;
  }
  return `The important visible parts of ${name} are restored. I don't need a perfect pixel match to stop guiding you.`;
}

function stateFromResult(match: ReturnType<typeof calculateMatch>, plan: ReturnType<typeof buildRestorePlan>) {
  if (match.restored) return "RESTORED" as const;
  if (plan.actions.length === 0 && plan.blockedUnknowns.length > 0) return "LOW_CONFIDENCE" as const;
  return "GUIDING" as const;
}

function computeResult(checkpoint: Checkpoint, observation: RuntimeObservation, rewindSessionId?: string): RewindToolResult {
  const diffs = compareStates(checkpoint.state, observation.state, { evidenceMode: "vision" });
  const match = calculateMatch(diffs);
  const plan = buildRestorePlan(diffs);
  const progress = updateRestoreProgress(plan, diffs);
  const finalPlan = { actions: progress.actions, blockedUnknowns: plan.blockedUnknowns };
  const changes = diffs.filter(diff => diff.type !== "UNCHANGED");
  return {
    rewindSessionId: rewindSessionId ?? randomUUID(),
    checkpoint: summarizeCheckpoint(checkpoint),
    state: stateFromResult(match, finalPlan),
    match,
    plan: finalPlan,
    changeCount: changes.length,
    changes,
    progress,
  };
}

async function findCheckpoint(spaceId: string, spokenName?: string): Promise<Checkpoint | undefined> {
  const all = await requireConfigured().list(spaceId);
  if (!all.length) return undefined;
  if (!spokenName) return all[0];
  const wanted = normalized(spokenName);
  return all.find(item => normalized(item.name) === wanted)
    ?? all.find(item => normalized(item.name).includes(wanted) || wanted.includes(normalized(item.name)));
}

function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function relayAuthorized(req: RequestLike): boolean {
  const expected = process.env.REWIND_ALEXA_RELAY_SECRET?.trim();
  const raw = req.headers["x-rewind-relay-secret"];
  const supplied = Array.isArray(raw) ? raw[0] : raw;
  return Boolean(expected && secretMatches(supplied, expected));
}

async function handleAlexa(envelope: AlexaRequestEnvelope): Promise<AlexaResponseEnvelope> {
  const expectedSkillId = process.env.REWIND_ALEXA_SKILL_ID?.trim();
  const actualSkillId = envelope.context?.System?.application?.applicationId
    ?? envelope.session?.application?.applicationId;
  if (expectedSkillId && actualSkillId !== expectedSkillId) {
    return alexaResponse("This request was not intended for this REWIND skill.", true);
  }

  const state = await loadVoiceState(envelope);
  const type = envelope.request?.type;
  if (type === "LaunchRequest") {
    state.lastSpeech = "REWIND is ready. Analyze a scene on the REWIND web app, then ask me to remember it or rewind to a saved setup.";
    await saveVoiceState(envelope, state);
    return alexaResponse(state.lastSpeech, false, "Try saying, remember this room as desk baseline.");
  }
  if (type === "SessionEndedRequest") return alexaResponse("", true);
  if (type !== "IntentRequest") return alexaResponse("I didn't understand that REWIND request.");

  const intent = envelope.request?.intent?.name;
  if (intent === "AMAZON.StopIntent" || intent === "AMAZON.CancelIntent") {
    return alexaResponse("Okay. REWIND will stop talking for now.", true);
  }
  if (intent === "AMAZON.HelpIntent") {
    return alexaResponse("Analyze a photo in the REWIND web app. Then say remember this room as desk baseline, rewind to desk baseline, check again, or what's next.");
  }
  if (intent === "RepeatStepIntent" || intent === "AMAZON.RepeatIntent") {
    return alexaResponse(state.lastSpeech ?? "There isn't a REWIND instruction to repeat yet.");
  }

  if (intent === "ListCheckpointsIntent") {
    const items = await requireConfigured().list(state.spaceId);
    const text = items.length
      ? `Your saved states are ${items.slice(0, 5).map(item => item.name).join(", ")}.`
      : "You don't have any saved REWIND states for this space yet.";
    state.lastSpeech = text;
    await saveVoiceState(envelope, state);
    return alexaResponse(text);
  }

  if (intent === "SaveCheckpointIntent") {
    const name = checkpointSlot(envelope);
    if (!name) return alexaResponse("What should I call this setup?", false, "For example, say desk baseline.");
    const observation = await latestObservation(state.spaceId);
    const checkpoint = await requireConfigured().save({
      spaceId: state.spaceId,
      name,
      observationId: observation.observationId,
      state: observation.state,
    });
    state.checkpointId = checkpoint.id;
    state.checkpointName = checkpoint.name;
    delete state.rewindSessionId;
    delete state.latestResult;
    state.actionIndex = 0;
    state.statusMessage = `Saved ${checkpoint.name}. REWIND now remembers its semantic state.`;
    state.lastSpeech = `I'm saving the analyzed scene as ${checkpoint.name}. Ask me for status in a moment.`;
    await saveVoiceState(envelope, state);
    return alexaResponse(state.lastSpeech, true);
  }

  if (intent === "StartRewindIntent") {
    const spokenName = checkpointSlot(envelope);
    const checkpoint = await findCheckpoint(state.spaceId, spokenName);
    if (!checkpoint) {
      const text = spokenName
        ? `I couldn't find a saved state called ${spokenName}.`
        : "You don't have a saved state for this space yet.";
      state.lastSpeech = text;
      await saveVoiceState(envelope, state);
      return alexaResponse(text);
    }
    const observation = await latestObservation(state.spaceId);
    const result = computeResult(checkpoint, observation);
    state.checkpointId = checkpoint.id;
    state.checkpointName = checkpoint.name;
    state.rewindSessionId = result.rewindSessionId;
    state.latestResult = result;
    state.actionIndex = 0;
    delete state.statusMessage;
    state.lastSpeech = `I'm checking the analyzed scene against ${checkpoint.name}. Ask me what's the status in a moment.`;
    await saveVoiceState(envelope, state);
    return alexaResponse(state.lastSpeech, true);
  }

  if (intent === "CheckAgainIntent") {
    if (!state.checkpointId || !state.rewindSessionId) {
      return alexaResponse("Start a rewind first, then I can check your progress.");
    }
    const checkpoint = await requireConfigured().get(state.spaceId, state.checkpointId);
    if (!checkpoint) return alexaResponse("I couldn't find that saved state.");
    const observation = await latestObservation(state.spaceId);
    state.latestResult = computeResult(checkpoint, observation, state.rewindSessionId);
    state.actionIndex = 0;
    delete state.statusMessage;
    state.lastSpeech = "I'm checking the latest analyzed photo. Ask me what's the status in a moment.";
    await saveVoiceState(envelope, state);
    return alexaResponse(state.lastSpeech, true);
  }

  if (intent === "StatusIntent") {
    const text = state.statusMessage
      ?? (state.latestResult ? resultSpeech(state.latestResult, state.checkpointName) : "REWIND isn't restoring anything right now.");
    state.lastSpeech = text;
    await saveVoiceState(envelope, state);
    return alexaResponse(text);
  }

  if (intent === "NextStepIntent") {
    const actions = pendingActions(state.latestResult);
    if (!actions.length) {
      const text = state.latestResult
        ? resultSpeech(state.latestResult, state.checkpointName)
        : "Start a rewind first and I'll guide you one step at a time.";
      state.lastSpeech = text;
      await saveVoiceState(envelope, state);
      return alexaResponse(text);
    }
    state.actionIndex = Math.min(state.actionIndex + 1, actions.length - 1);
    const text = `Next, ${actions[state.actionIndex]!.instruction} Analyze another photo and say check again when you want me to verify it.`;
    state.lastSpeech = text;
    await saveVoiceState(envelope, state);
    return alexaResponse(text);
  }

  return alexaResponse("I can remember an analyzed scene, rewind to it, check progress, or tell you the next restore step.");
}

function webVoiceKey(sessionId: string): string {
  return createHash("sha256").update(`rewind-web:${sessionId}`).digest("hex");
}

function parseWebVoiceCommand(transcript: string): WebVoiceResponse["command"] {
  const value = normalized(transcript);
  if (!value) return "unknown";
  if (/\b(help|what can you do|commands)\b/.test(value)) return "help";
  if (/\b(list|show)\b.*\b(saved|states|checkpoints)\b/.test(value)) return "list";
  if (/\b(repeat|say that again)\b/.test(value)) return "repeat";
  if (/\b(next|next step|another step)\b/.test(value)) return "next";
  if (/\b(check again|verify|check progress|verify again)\b/.test(value)) return "check";
  if (/\b(status|what changed|what is the status|whats the status)\b/.test(value)) return "status";
  if (/\b(remember|save)\b/.test(value)) return "remember";
  if (/\b(rewind|restore|go back)\b/.test(value)) return "rewind";
  return "unknown";
}

function checkpointNameFromTranscript(transcript: string): string | undefined {
  const raw = transcript.trim();
  const patterns = [
    /(?:remember|save)(?: this (?:room|space|scene))?(?: as| called| named)\s+(.+)$/i,
    /(?:rewind|restore)(?: this (?:room|space|scene))?(?: to| back to)\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const value = match?.[1]?.trim().replace(/[.!?]+$/, "");
    if (value) return value;
  }
  return undefined;
}

async function handleWebVoice(req: RequestLike, res: ResponseLike): Promise<void> {
  const body = parseBody(req) as WebVoiceRequest;
  const sessionId = body.sessionId?.trim();
  const transcript = body.transcript?.trim();
  const requestedSpaceId = body.spaceId?.trim() || defaultSpaceId;

  if (!sessionId || sessionId.length < 8 || sessionId.length > 200) {
    send(res, 400, { error: "Voice session ID is invalid." });
    return;
  }
  if (!validSpaceId(requestedSpaceId)) {
    send(res, 400, { error: "Space ID is invalid." });
    return;
  }
  if (!transcript || transcript.length > 500) {
    send(res, 400, { error: "Voice command is empty or too long." });
    return;
  }

  const key = webVoiceKey(sessionId);
  const state = await loadVoiceStateByKey(key);
  state.spaceId = requestedSpaceId;

  const command = parseWebVoiceCommand(transcript);
  const transcriptCheckpointName = checkpointNameFromTranscript(transcript);
  const spokenName = command === "remember"
    ? transcriptCheckpointName
    : (body.checkpointName?.trim() || transcriptCheckpointName);
  const respond = async (text: string, extra: Partial<WebVoiceResponse> = {}) => {
    state.lastSpeech = text;
    await saveVoiceStateByKey(key, state);
    send(res, 200, {
      transcript,
      command,
      text,
      ...(state.checkpointName ? { checkpointName: state.checkpointName } : {}),
      ...(state.latestResult ? {
        state: state.latestResult.state,
        changeCount: state.latestResult.changeCount,
        pendingActions: pendingActions(state.latestResult).length,
      } : {}),
      ...extra,
    } satisfies WebVoiceResponse);
  };

  if (command === "help") {
    await respond("Try saying remember this room as desk baseline, rewind to desk baseline, what's the status, next step, or check again.");
    return;
  }

  if (command === "repeat") {
    await respond(state.lastSpeech ?? "There isn't a REWIND instruction to repeat yet.");
    return;
  }

  if (command === "list") {
    const items = await requireConfigured().list(state.spaceId);
    await respond(items.length
      ? `Your saved states are ${items.slice(0, 5).map(item => item.name).join(", ")}.`
      : "You don't have any saved REWIND states for this space yet.");
    return;
  }

  if (command === "remember") {
    if (!spokenName) {
      await respond("Tell me what to call this saved state. For example, say remember this room as kitchen baseline.");
      return;
    }
    const name = spokenName;
    const observation = await latestObservation(state.spaceId);
    const checkpoint = await requireConfigured().save({
      spaceId: state.spaceId,
      name,
      observationId: observation.observationId,
      state: observation.state,
    });
    state.checkpointId = checkpoint.id;
    state.checkpointName = checkpoint.name;
    delete state.rewindSessionId;
    delete state.latestResult;
    state.actionIndex = 0;
    state.statusMessage = `Saved ${checkpoint.name}. REWIND now remembers its semantic state.`;
    await respond(state.statusMessage, { checkpointName: checkpoint.name });
    return;
  }

  if (command === "rewind") {
    let checkpoint: Checkpoint | undefined;
    if (body.checkpointId && validOpaqueId(body.checkpointId)) {
      checkpoint = await requireConfigured().get(state.spaceId, body.checkpointId);
    }
    checkpoint ??= await findCheckpoint(state.spaceId, spokenName);
    if (!checkpoint) {
      await respond(spokenName
        ? `I couldn't find a saved state called ${spokenName}.`
        : "You don't have a saved state for this space yet.");
      return;
    }
    const observation = await latestObservation(state.spaceId);
    const result = computeResult(checkpoint, observation);
    state.checkpointId = checkpoint.id;
    state.checkpointName = checkpoint.name;
    state.rewindSessionId = result.rewindSessionId;
    state.latestResult = result;
    state.actionIndex = 0;
    delete state.statusMessage;
    await respond(resultSpeech(result, checkpoint.name), {
      checkpointName: checkpoint.name,
      state: result.state,
      changeCount: result.changeCount,
      pendingActions: pendingActions(result).length,
    });
    return;
  }

  if (command === "check") {
    if (!state.checkpointId || !state.rewindSessionId) {
      await respond("Start a rewind first, then I can check your progress.");
      return;
    }
    const checkpoint = await requireConfigured().get(state.spaceId, state.checkpointId);
    if (!checkpoint) {
      await respond("I couldn't find that saved state.");
      return;
    }
    const observation = await latestObservation(state.spaceId);
    state.latestResult = computeResult(checkpoint, observation, state.rewindSessionId);
    state.actionIndex = 0;
    delete state.statusMessage;
    await respond(resultSpeech(state.latestResult, state.checkpointName));
    return;
  }

  if (command === "status") {
    await respond(state.statusMessage
      ?? (state.latestResult ? resultSpeech(state.latestResult, state.checkpointName) : "REWIND isn't restoring anything right now."));
    return;
  }

  if (command === "next") {
    const actions = pendingActions(state.latestResult);
    if (!actions.length) {
      await respond(state.latestResult
        ? resultSpeech(state.latestResult, state.checkpointName)
        : "Start a rewind first and I'll guide you one step at a time.");
      return;
    }
    const nextIndex = state.actionIndex + 1;
    if (nextIndex >= actions.length) {
      await respond("That was the last pending step. Analyze another photo and say check again when you want me to verify the restoration.");
      return;
    }
    state.actionIndex = nextIndex;
    await respond(`Next, ${actions[state.actionIndex]!.instruction} Analyze another photo and say check again when you want me to verify it.`);
    return;
  }

  await respond("I didn't understand that command. Try saying rewind to desk baseline, what's the status, next step, or check again.");
}

function missingTrackedPresenceHints(
  referenceState: PhysicalState | undefined,
  trackedEntities: TrackedEntityHint[] | undefined,
  observedState: PhysicalState,
): TrackedEntityHint[] {
  if (!referenceState || !trackedEntities?.length) return [];

  const observedKeys = new Set(observedState.entities.map(entity => entity.key));
  const referenceByKey = new Map(referenceState.entities.map(entity => [entity.key, entity]));

  return trackedEntities
    .filter(hint => {
      const reference = referenceByKey.get(hint.key);
      return reference?.attributes?.present === true
        && !observedKeys.has(hint.key)
        && Boolean(hint.observableAttributes?.present);
    })
    .map(hint => ({
      ...hint,
      description: [
        hint.description ?? "",
        "FOCUSED ABSENCE AUDIT: inspect only this saved object against the current image. Return this exact tracked key. Emit present=false with confidence >= 0.85 only when the saved support/location area is visible and unoccluded and this exact saved object is clearly absent. If the object appears visible, do not use this fallback to assert presence; return the key below 0.60 confidence and omit present. If identity or visibility is uncertain, also omit present.",
      ].filter(Boolean).join(" "),
    }));
}

interface PresenceAuditResult {
  key: string;
  status: "PRESENT" | "ABSENT" | "UNCERTAIN";
  supportVisible: boolean;
  confidence: number;
  matchedCurrentKey?: string | null;
}

function visiblePeerSummary(state: PhysicalState, hint: TrackedEntityHint): string {
  const peers = state.entities
    .filter(entity => entity.category === hint.category && entity.key !== hint.key)
    .slice(0, 8)
    .map(entity => ({
      key: entity.key,
      category: entity.category,
      confidence: entity.confidence,
      attributes: entity.attributes ?? {},
      relations: entity.relations ?? [],
    }));
  return JSON.stringify(peers);
}

async function runPresenceAudit(
  imageBytes: Uint8Array,
  hints: TrackedEntityHint[],
  observedState: PhysicalState,
  mode: "ABSENCE_CHECK" | "LOCALIZATION_CHECK",
): Promise<{ results: Map<string, PresenceAuditResult>; latencyMs: number }> {
  if (!hints.length) return { results: new Map(), latencyMs: 0 };

  const targets = hints.map(hint => ({
    key: hint.key,
    category: hint.category,
    savedHints: hint.description ?? "",
    visibleSameCategoryCandidates: JSON.parse(visiblePeerSummary(observedState, hint)) as unknown,
  }));

  const modeInstruction = mode === "ABSENCE_CHECK"
    ? "For every target, actively test whether it is absent. Do not treat the checkpoint description as evidence that it is present."
    : "For every target, actively try to locate an exact current-image match. If no exact match exists and its saved support/location area is clearly visible and unoccluded, classify it ABSENT.";

  const prompt = [
    "You are REWIND's contrastive tracked-object presence auditor.",
    "Inspect only the current image. Saved checkpoint details are search hints, never current-state evidence.",
    modeInstruction,
    "Evaluate EVERY target independently and return one result for every target key.",
    "Do not match an object merely because it has the same category. Identity cues such as color, appearance, role, and saved location matter.",
    "The supplied visibleSameCategoryCandidates came from a separate whole-scene vision pass. Treat them as candidate distractors: compare them against the target identity instead of assuming they are the target.",
    "Use ABSENT only when the target's saved support/location area is clearly visible and unoccluded and the exact target object cannot be found there or elsewhere in the visible scene.",
    "Use PRESENT only when an exact identity match is visually supported.",
    "If PRESENT and the matching object already appears in visibleSameCategoryCandidates under a different current key, return that exact candidate key as matchedCurrentKey. Never invent a candidate key. Use null when no listed candidate is the exact match.",
    "For ABSENT or UNCERTAIN, matchedCurrentKey must be null.",
    "Use UNCERTAIN when the support area is cropped/occluded, identity is ambiguous, or evidence is insufficient.",
    "Return JSON only, no prose.",
    `Targets: ${JSON.stringify(targets)}`,
    'JSON shape: {"results":[{"key":"exact.saved.key","status":"PRESENT|ABSENT|UNCERTAIN","supportVisible":true,"confidence":0.0,"matchedCurrentKey":"candidate.key.or.null"}]}',
  ].join("\n");

  const startedAt = Date.now();
  const response = await bedrockClient.send(new ConverseCommand({
    modelId,
    messages: [{
      role: "user",
      content: [
        {
          image: {
            format: "jpeg",
            source: { bytes: imageBytes },
          },
        },
        { text: prompt },
      ],
    }],
    inferenceConfig: {
      maxTokens: 900,
      temperature: 0,
      topP: 0.1,
    },
  }));
  const latencyMs = Date.now() - startedAt;
  const out = new Map<string, PresenceAuditResult>();

  const content = response.output?.message?.content ?? [];
  const textBlock = content.find(block => "text" in block && typeof block.text === "string");
  if (!textBlock || !("text" in textBlock) || typeof textBlock.text !== "string") {
    return { results: out, latencyMs };
  }

  try {
    const parsed = JSON.parse(extractJsonObject(textBlock.text)) as {
      results?: Array<Partial<PresenceAuditResult>>;
    };
    const allowed = new Set(hints.map(hint => hint.key));

    for (const item of parsed.results ?? []) {
      if (
        typeof item.key !== "string"
        || !allowed.has(item.key)
        || (item.status !== "PRESENT" && item.status !== "ABSENT" && item.status !== "UNCERTAIN")
        || typeof item.supportVisible !== "boolean"
        || typeof item.confidence !== "number"
        || !Number.isFinite(item.confidence)
        || item.confidence < 0
        || item.confidence > 1
        || (
          item.matchedCurrentKey !== undefined
          && item.matchedCurrentKey !== null
          && (typeof item.matchedCurrentKey !== "string" || !validOpaqueId(item.matchedCurrentKey))
        )
      ) {
        continue;
      }
      out.set(item.key, item as PresenceAuditResult);
    }
  } catch {
    // Invalid focused-audit JSON contributes no evidence.
  }

  return { results: out, latencyMs };
}


async function runAdditionAudit(
  imageBytes: Uint8Array,
  referenceState: PhysicalState,
  observedState: PhysicalState,
  mode: "OPEN_EXTRA_SCAN" | "CONTRASTIVE_EXTRA_SCAN",
): Promise<{ results: Map<string, TrackedAdditionEvidence>; latencyMs: number }> {
  const checkpointInventory = referenceState.entities.map(entity => ({
    key: entity.key,
    category: entity.category,
    attributes: entity.attributes ?? {},
    relations: entity.relations ?? [],
  }));
  const alreadyObserved = observedState.entities.map(entity => ({
    key: entity.key,
    category: entity.category,
    attributes: entity.attributes ?? {},
    relations: entity.relations ?? [],
  }));

  const modeInstruction = mode === "OPEN_EXTRA_SCAN"
    ? "Scan the entire current image from scratch for obvious loose/movable/restorable objects. Then exclude anything already represented by the checkpoint or alreadyObserved list."
    : "Contrast the current image against the checkpoint inventory and actively search for obvious loose/movable/restorable objects that exist now but were not represented in the checkpoint. Exclude anything alreadyObserved.";

  const prompt = [
    "You are REWIND's additional-object auditor.",
    "Inspect only the CURRENT image. The checkpoint is reference inventory, not current-state evidence.",
    modeInstruction,
    "Return only genuinely additional movable/restorable physical objects. Do not return walls, floors, counters/tables, built-in fixtures, large fixed furniture, decorative plants, wall art, or lighting.",
    "Do not return a checkpoint object under a new alias. If a visible object could reasonably correspond to any checkpoint entity, omit it from extras.",
    "Do not return an object already represented in alreadyObserved, even if you would personally choose a different key or category name.",
    "For each true extra, create a canonicalKey in lower-case semantic form category.identity-token. Use an obvious color as the identity token when visually clear; otherwise use a stable role/location token. Keep it concise and use only letters, digits, dots, hyphens, or underscores.",
    "Use a singular common-noun category. Set confidence >= 0.90 only for clearly visible, unambiguous extras.",
    "color is optional and must be a simple visible color word. appearance is optional and must be a short literal visual phrase.",
    "Return at most 8 extras. If uncertain, omit the object.",
    "Return JSON only, no prose.",
    `Checkpoint inventory: ${JSON.stringify(checkpointInventory)}`,
    `Already observed current entities: ${JSON.stringify(alreadyObserved)}`,
    'JSON shape: {"results":[{"canonicalKey":"category.identity","category":"category","confidence":0.0,"color":"color-or-null","appearance":"short phrase or null"}]}',
  ].join("\n");

  const startedAt = Date.now();
  const response = await bedrockClient.send(new ConverseCommand({
    modelId,
    messages: [{
      role: "user",
      content: [
        {
          image: {
            format: "jpeg",
            source: { bytes: imageBytes },
          },
        },
        { text: prompt },
      ],
    }],
    inferenceConfig: {
      maxTokens: 900,
      temperature: 0,
      topP: 0.1,
    },
  }));
  const latencyMs = Date.now() - startedAt;
  const out = new Map<string, TrackedAdditionEvidence>();

  const content = response.output?.message?.content ?? [];
  const textBlock = content.find(block => "text" in block && typeof block.text === "string");
  if (!textBlock || !("text" in textBlock) || typeof textBlock.text !== "string") {
    return { results: out, latencyMs };
  }

  try {
    const parsed = JSON.parse(extractJsonObject(textBlock.text)) as {
      results?: Array<Partial<TrackedAdditionEvidence>>;
    };
    for (const item of parsed.results ?? []) {
      if (
        typeof item.canonicalKey !== "string"
        || !/^[a-z0-9][a-z0-9._-]{1,79}$/.test(item.canonicalKey)
        || typeof item.category !== "string"
        || !item.category.trim()
        || typeof item.confidence !== "number"
        || !Number.isFinite(item.confidence)
        || item.confidence < 0
        || item.confidence > 1
        || (item.color !== undefined && item.color !== null && typeof item.color !== "string")
        || (item.appearance !== undefined && item.appearance !== null && typeof item.appearance !== "string")
      ) {
        continue;
      }
      out.set(item.canonicalKey, item as TrackedAdditionEvidence);
    }
  } catch {
    // Invalid extra-audit JSON contributes no evidence.
  }

  return { results: out, latencyMs };
}

function mergeConsensusAbsences(
  state: PhysicalState,
  hints: TrackedEntityHint[],
  first: Map<string, PresenceAuditResult>,
  second: Map<string, PresenceAuditResult>,
): { state: PhysicalState; added: number } {
  const existing = new Set(state.entities.map(entity => entity.key));
  const additions = [];

  for (const hint of hints) {
    if (existing.has(hint.key)) continue;
    const a = first.get(hint.key);
    const b = second.get(hint.key);
    if (
      a?.status === "ABSENT"
      && b?.status === "ABSENT"
      && a.supportVisible === true
      && b.supportVisible === true
      && a.confidence >= 0.85
      && b.confidence >= 0.85
    ) {
      additions.push({
        key: hint.key,
        category: hint.category,
        confidence: Math.min(a.confidence, b.confidence),
        attributes: { present: false },
        relations: [],
      });
    }
  }

  if (!additions.length) return { state, added: 0 };
  return {
    state: {
      ...state,
      entities: [...state.entities, ...additions],
    },
    added: additions.length,
  };
}

async function handleObserve(req: RequestLike, res: ResponseLike): Promise<void> {
  const body = parseBody(req);
  if (!validSpaceId(body.spaceId) || typeof body.capturedAt !== "string" || !Number.isFinite(Date.parse(body.capturedAt))) {
    send(res, 400, { error: "A valid space and capture time are required." });
    return;
  }
  if (typeof body.image !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.image)) {
    send(res, 400, { error: "A base64 JPEG is required." });
    return;
  }
  const bytes = Buffer.from(body.image, "base64");
  if (bytes.length < 4 || bytes.length > 3_500_000 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) {
    send(res, 400, { error: "Upload a JPEG under 3.5 MB." });
    return;
  }

  let referenceState: PhysicalState | undefined;
  if (body.checkpointId !== undefined) {
    if (!validOpaqueId(body.checkpointId)) {
      send(res, 400, { error: "Checkpoint ID is invalid." });
      return;
    }
    const checkpoint = await requireConfigured().get(body.spaceId, body.checkpointId);
    if (!checkpoint) {
      send(res, 404, { error: "Checkpoint not found." });
      return;
    }
    referenceState = checkpoint.state;
  }

  const trackedEntities = trackedEntitiesFromReferenceState(referenceState);
  const result = await nova.observe({
    imageBytes: bytes,
    format: "jpeg",
    context: {
      spaceId: body.spaceId,
      capturedAt: body.capturedAt,
      ...(trackedEntities ? { trackedEntities } : {}),
    },
  });

  let finalState = result.state;
  let totalLatencyMs = result.latencyMs;
  let presenceAuditCount = 0;
  let identityReconciliationCount = 0;
  let additionAuditCount = 0;
  const missingPresence = missingTrackedPresenceHints(referenceState, trackedEntities, result.state);

  const absencePromise = missingPresence.length > 0
    ? runPresenceAudit(bytes, missingPresence, result.state, "ABSENCE_CHECK")
    : Promise.resolve({ results: new Map<string, PresenceAuditResult>(), latencyMs: 0 });
  const localizationPromise = missingPresence.length > 0
    ? runPresenceAudit(bytes, missingPresence, result.state, "LOCALIZATION_CHECK")
    : Promise.resolve({ results: new Map<string, PresenceAuditResult>(), latencyMs: 0 });
  const openExtraPromise = referenceState
    ? runAdditionAudit(bytes, referenceState, result.state, "OPEN_EXTRA_SCAN")
    : Promise.resolve({ results: new Map<string, TrackedAdditionEvidence>(), latencyMs: 0 });
  const contrastiveExtraPromise = referenceState
    ? runAdditionAudit(bytes, referenceState, result.state, "CONTRASTIVE_EXTRA_SCAN")
    : Promise.resolve({ results: new Map<string, TrackedAdditionEvidence>(), latencyMs: 0 });

  const [absenceCheck, localizationCheck, openExtraCheck, contrastiveExtraCheck] = await Promise.all([
    absencePromise,
    localizationPromise,
    openExtraPromise,
    contrastiveExtraPromise,
  ]);
  totalLatencyMs += Math.max(
    absenceCheck.latencyMs,
    localizationCheck.latencyMs,
    openExtraCheck.latencyMs,
    contrastiveExtraCheck.latencyMs,
  );

  if (referenceState && missingPresence.length > 0) {
    const identityConsensus = reconcileTrackedEntityAliases(
      finalState,
      referenceState,
      absenceCheck.results,
      localizationCheck.results,
    );
    identityReconciliationCount = identityConsensus.reconciled;
    finalState = identityConsensus.state;

    const absenceConsensus = mergeConsensusAbsences(
      finalState,
      missingPresence,
      absenceCheck.results,
      localizationCheck.results,
    );
    presenceAuditCount = absenceConsensus.added;
    finalState = absenceConsensus.state;
  }

  if (referenceState) {
    const additionConsensus = mergeConsensusAdditions(
      finalState,
      referenceState,
      openExtraCheck.results,
      contrastiveExtraCheck.results,
    );
    additionAuditCount = additionConsensus.added;
    finalState = additionConsensus.state;
  }

  const observation: RuntimeObservation = {
    spaceId: body.spaceId,
    observationId: `vercel-photo-${randomUUID()}`,
    state: finalState,
    evidenceMode: "vision",
    ...(result.modelId ? { modelId: result.modelId } : {}),
    ...(typeof totalLatencyMs === "number" ? { latencyMs: totalLatencyMs } : {}),
    updatedAt: new Date().toISOString(),
  };
  await saveLatestObservation(observation);
  send(res, 200, {
    observationId: observation.observationId,
    state: observation.state,
    modelId: observation.modelId,
    latencyMs: observation.latencyMs,
    presenceAuditCount,
    identityReconciliationCount,
    additionAuditCount,
    source: "photo",
    persisted: "semantic-state-only",
  });
}

async function handleCheckpoints(req: RequestLike, res: ResponseLike): Promise<void> {
  if (req.method === "GET") {
    const spaceId = queryValue(req, "spaceId");
    if (!validSpaceId(spaceId)) {
      send(res, 400, { error: "Space ID is invalid." });
      return;
    }
    const items = await requireConfigured().list(spaceId);
    send(res, 200, items.map(summarizeCheckpoint));
    return;
  }

  const body = parseBody(req);
  if (!validSpaceId(body.spaceId) || typeof body.name !== "string" || !body.name.trim()) {
    send(res, 400, { error: "Space and checkpoint name are required." });
    return;
  }
  const observation = await latestObservation(body.spaceId);
  if (body.observationId && body.observationId !== observation.observationId) {
    send(res, 409, { error: "Analyze the current photo again before saving it." });
    return;
  }
  const checkpoint = await requireConfigured().save({
    spaceId: body.spaceId,
    name: body.name.trim(),
    observationId: observation.observationId,
    state: observation.state,
  });
  send(res, 201, summarizeCheckpoint(checkpoint));
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const path = routePath(req);
    if (path === "health" && req.method === "GET") {
      send(res, 200, {
        ok: true,
        service: "REWIND Vercel Submission Runtime",
        region,
        modelId,
        defaultSpaceId,
        storageConfigured: Boolean(tableName),
        awsAuth: roleArn ? "vercel-oidc" : "default-provider-chain",
        alexaRelayConfigured: Boolean(process.env.REWIND_ALEXA_RELAY_SECRET?.trim()),
        photoPersistence: "semantic-state-only",
      });
      return;
    }

    if (path === "observe" && req.method === "POST") {
      await handleObserve(req, res);
      return;
    }

    if (path === "current-scene" && req.method === "GET") {
      if (!relayAuthorized(req)) {
        send(res, 401, { error: "Unauthorized." });
        return;
      }
      const spaceId = queryValue(req, "spaceId");
      if (!validSpaceId(spaceId)) {
        send(res, 400, { error: "Space ID is invalid." });
        return;
      }
      const observation = await latestObservation(spaceId);
      send(res, 200, {
        ready: true,
        spaceId: observation.spaceId,
        observationId: observation.observationId,
        entityCount: observation.state.entities.length,
        updatedAt: observation.updatedAt,
        entities: observation.state.entities.map(entity => ({
          key: entity.key,
          category: entity.category,
          confidence: entity.confidence,
          present: entity.attributes?.present,
          relations: (entity.relations ?? []).map(relation => ({
            type: relation.type,
            target: relation.target,
            confidence: relation.confidence,
          })),
        })),
      });
      return;
    }

    if (path === "checkpoint-diagnostic" && req.method === "GET") {
      if (!relayAuthorized(req)) {
        send(res, 401, { error: "Unauthorized." });
        return;
      }
      const spaceId = queryValue(req, "spaceId");
      const checkpointId = queryValue(req, "checkpointId");
      if (!validSpaceId(spaceId) || !validOpaqueId(checkpointId)) {
        send(res, 400, { error: "Space ID or checkpoint ID is invalid." });
        return;
      }
      const checkpoint = await requireConfigured().get(spaceId, checkpointId);
      if (!checkpoint) {
        send(res, 404, { error: "Checkpoint not found." });
        return;
      }
      send(res, 200, {
        id: checkpoint.id,
        name: checkpoint.name,
        entities: checkpoint.state.entities.map(entity => ({
          key: entity.key,
          category: entity.category,
          confidence: entity.confidence,
          present: entity.attributes?.present,
          color: entity.attributes?.color ?? entity.attributes?.colour,
          appearance: entity.attributes?.appearance,
          relations: (entity.relations ?? []).map(relation => ({
            type: relation.type,
            target: relation.target,
            confidence: relation.confidence,
          })),
        })),
      });
      return;
    }

    if (path === "checkpoints" && (req.method === "GET" || req.method === "POST")) {
      await handleCheckpoints(req, res);
      return;
    }

    if (path === "voice" && req.method === "POST") {
      await handleWebVoice(req, res);
      return;
    }

    if (path === "alexa-relay" && req.method === "POST") {
      if (!relayAuthorized(req)) {
        send(res, 401, { error: "Unauthorized." });
        return;
      }
      const envelope = parseBody(req) as unknown as AlexaRequestEnvelope;
      send(res, 200, await handleAlexa(envelope));
      return;
    }

    send(res, 404, { error: "Not found." });
  } catch (error) {
    console.error("REWIND Vercel request failed:", error instanceof Error ? error.message : "unknown error");
    send(res, 500, { error: safeMessage(error) });
  }
}
