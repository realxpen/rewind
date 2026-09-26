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
import { trackedEntitiesFromReferenceState } from "../packages/ring/src/tracked-entities.js";
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

async function loadVoiceState(envelope: AlexaRequestEnvelope): Promise<PersistentVoiceState> {
  const key = voiceKey(envelope);
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

async function saveVoiceState(envelope: AlexaRequestEnvelope, state: PersistentVoiceState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await putRuntime(runtimePartition("voice", voiceKey(envelope)), "state", state as unknown as Record<string, unknown>);
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
  console.info("Alexa request", {
    type,
    intent: intent ?? null,
    checkpointName: checkpointSlot(envelope) ?? null,
  });
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
}

async function auditTrackedAbsence(
  imageBytes: Uint8Array,
  hint: TrackedEntityHint,
): Promise<{ result?: PresenceAuditResult; latencyMs: number }> {
  const prompt = [
    "You are REWIND's focused visual presence auditor.",
    "Inspect the current image only. The checkpoint description is a search hint, not evidence that the object is currently present.",
    "Decide whether this exact saved object is PRESENT, ABSENT, or UNCERTAIN.",
    "Use ABSENT only when the saved support/location area is clearly visible and unoccluded and the exact saved object is not there.",
    "A different object, different color, or merely similar category does not count as the saved object.",
    "Use UNCERTAIN if the support area is hidden, cropped, ambiguous, or identity cannot be resolved.",
    "Return exactly one JSON object and no prose.",
    `Tracked key: ${hint.key}`,
    `Category: ${hint.category}`,
    `Saved identity/location hints: ${hint.description ?? "none"}`,
    'JSON shape: {"key":"exact.key","status":"PRESENT|ABSENT|UNCERTAIN","supportVisible":true,"confidence":0.0}',
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
      maxTokens: 300,
      temperature: 0,
      topP: 0.1,
    },
  }));
  const latencyMs = Date.now() - startedAt;

  const content = response.output?.message?.content ?? [];
  const textBlock = content.find(block => "text" in block && typeof block.text === "string");
  if (!textBlock || !("text" in textBlock) || typeof textBlock.text !== "string") {
    return { latencyMs };
  }

  try {
    const parsed = JSON.parse(extractJsonObject(textBlock.text)) as Partial<PresenceAuditResult>;
    if (
      parsed.key !== hint.key
      || (parsed.status !== "PRESENT" && parsed.status !== "ABSENT" && parsed.status !== "UNCERTAIN")
      || typeof parsed.supportVisible !== "boolean"
      || typeof parsed.confidence !== "number"
      || !Number.isFinite(parsed.confidence)
      || parsed.confidence < 0
      || parsed.confidence > 1
    ) {
      return { latencyMs };
    }
    return { result: parsed as PresenceAuditResult, latencyMs };
  } catch {
    return { latencyMs };
  }
}

function mergeExplicitAbsence(
  state: PhysicalState,
  hint: TrackedEntityHint,
  audit: PresenceAuditResult | undefined,
): PhysicalState {
  if (state.entities.some(entity => entity.key === hint.key)) return state;
  if (
    !audit
    || audit.status !== "ABSENT"
    || audit.supportVisible !== true
    || audit.confidence < 0.85
  ) {
    return state;
  }

  return {
    ...state,
    entities: [
      ...state.entities,
      {
        key: hint.key,
        category: hint.category,
        confidence: audit.confidence,
        attributes: { present: false },
        relations: [],
      },
    ],
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
  const missingPresence = missingTrackedPresenceHints(referenceState, trackedEntities, result.state);
  if (missingPresence.length > 0) {
    for (const hint of missingPresence) {
      const audit = await auditTrackedAbsence(bytes, hint);
      totalLatencyMs += audit.latencyMs;
      const merged = mergeExplicitAbsence(finalState, hint, audit.result);
      presenceAuditCount += merged.entities.length - finalState.entities.length;
      finalState = merged;
    }
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

    if (path === "alexa-relay" && req.method === "POST") {
      const expected = process.env.REWIND_ALEXA_RELAY_SECRET?.trim();
      const raw = req.headers["x-rewind-relay-secret"];
      const supplied = Array.isArray(raw) ? raw[0] : raw;
      if (!expected || !secretMatches(supplied, expected)) {
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
