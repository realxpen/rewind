import { observationErrorMessage } from "./observation-error.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import type { RingDevice, RingWhepSession } from "./contracts.js";
import type { VisionObservationRequest, VisionObservation } from "../../vision/src/contracts.js";
import type { AddCheckpointViewInput, Checkpoint, SaveCheckpointInput } from "../../checkpoints/src/contracts.js";
import { checkpointViews, summarizeCheckpoint } from "../../checkpoints/src/service.js";
import { findCheckpointViewByImageHash, selectBestCheckpointView } from "../../checkpoints/src/view-match.js";
import { calculateMatch, compareStates } from "../../diff-engine/src/index.js";
import { buildRestorePlan, updateRestoreProgress, type RestorePlan } from "../../restore-engine/src/index.js";
import { demoReady, messy, partial, restored } from "../../physical-state-protocol/fixtures/studio.js";

export interface PreviewAgentInput {
  prompt: string;
  spaceId: string;
  observationId: string;
  state: VisionObservation["state"];
  modelId?: string;
  latencyMs?: number;
}

export interface PreviewAgentResult {
  text: string;
  stopReason: string;
  session: unknown;
}

export interface PreviewObservationRequest {
  id: string;
  spaceId: string;
  requestedAt: number;
}

export interface PreviewServices {
  devices(): Promise<RingDevice[]>;
  start(deviceId: string, offer: string): Promise<RingWhepSession>;
  stop(url: string): Promise<void>;
  observe(request: VisionObservationRequest): Promise<VisionObservation>;
  /** Optional perception call used only for multi-view view selection; it should not publish intermediate state externally. */
  observeUnpublished?(request: VisionObservationRequest): Promise<VisionObservation>;
  saveCheckpoint?(input: SaveCheckpointInput): Promise<Checkpoint>;
  addCheckpointView?(input: AddCheckpointViewInput): Promise<Checkpoint>;
  listCheckpoints?(spaceId: string): Promise<Checkpoint[]>;
  getCheckpoint?(spaceId: string, checkpointId: string): Promise<Checkpoint | undefined>;
  invokeAgent?(input: PreviewAgentInput): Promise<PreviewAgentResult>;
  pendingMcpObservationRequest?(spaceId: string): PreviewObservationRequest | undefined;
  publishLiveFrame?(input: { spaceId: string; imageBytes: Uint8Array; capturedAt: string }): void;
  publishPhotoFrame?(input: { spaceId: string; imageBytes: Uint8Array; capturedAt: string }): void;
  setLiveSource?(input: { spaceId: string; source: "ring" | "camera" | "photo" }): void;
}

interface RewindSession {
  id: string;
  spaceId: string;
  checkpointId: string;
  checkpointViewId?: string;
  plan: RestorePlan;
  touched: number;
}

type ObservationBasis = "controlled-demo" | "nova-open" | "nova-tracked" | "exact-image";

interface StoredObservation {
  spaceId: string;
  state: VisionObservation["state"];
  modelId?: string;
  latencyMs?: number;
  sourceImageHash?: string;
  basis?: ObservationBasis;
  checkpointViewId?: string;
  viewSelectionScore?: number;
  receivedAt: number;
}

type ControlledDemoScenario = "demo-ready" | "messy" | "partial" | "restored";
const controlledDemoStates = {
  "demo-ready": demoReady,
  messy,
  partial,
  restored,
} as const;

class InputError extends Error {}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 5_000_000) throw new InputError("Request is too large.");
    chunks.push(Buffer.from(chunk));
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new InputError("Invalid request."); }
}
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}
function validSpaceId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{1,80}$/.test(value);
}
function validOpaqueId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 120;
}
function validControlledDemoScenario(value: unknown): value is ControlledDemoScenario {
  return typeof value === "string" && Object.hasOwn(controlledDemoStates, value);
}
function validWaitMs(value: string | null): number {
  if (value === null || value === "") return 15_000;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 10 || parsed > 20_000) {
    throw new InputError("waitMs must be an integer between 10 and 20000.");
  }
  return parsed;
}
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function hashImage(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function createControlledDemoObservation(scenario: ControlledDemoScenario, spaceId: string): VisionObservation {
  const state = structuredClone(controlledDemoStates[scenario]);
  state.spaceId = spaceId;
  state.capturedAt = new Date().toISOString();
  return {
    state,
    rawText: `controlled-demo:${scenario}`,
    modelId: "rewind-controlled-demo",
    latencyMs: 0,
  };
}
function createExactImageObservation(stateInput: VisionObservation["state"], capturedAt: string): VisionObservation {
  const state = structuredClone(stateInput);
  state.capturedAt = capturedAt;
  return {
    state,
    rawText: "exact-image-fingerprint-match",
    modelId: "rewind-exact-image-match",
    latencyMs: 0,
  };
}
function safeAgentError(error: unknown): string {
  if (error instanceof Error && /^(No active |No fresh trusted |Checkpoint not found|Rewind session not found|Prompt must)/.test(error.message)) {
    return error.message;
  }
  return "REWIND agent request failed. Check AWS credentials, AgentCore Memory, and Bedrock access, then retry.";
}
function trackedEntitiesFromState(state: VisionObservation["state"]): NonNullable<VisionObservationRequest["context"]["trackedEntities"]> {
  return state.entities.map(entity => {
    const hint: NonNullable<VisionObservationRequest["context"]["trackedEntities"]>[number] = {
      key: entity.key,
      category: entity.category,
      description: `This is the checkpoint identity ${entity.key}. Match the corresponding visible ${entity.category} to this exact key; never replace, split, or rename it.`,
    };
    if (entity.attributes && Object.keys(entity.attributes).length > 0) {
      hint.observableAttributes = Object.fromEntries(
        Object.keys(entity.attributes).map(attribute => [attribute, `Observe only the current visible value for \"${attribute}\" on this tracked entity. Omit it if the image does not support a value.`]),
      );
    }
    if (entity.relations?.length) {
      hint.observableRelations = entity.relations.map(relation => ({
        type: relation.type,
        ...(relation.target ? { target: relation.target } : {}),
        description: relation.target
          ? `Re-check whether ${entity.key} is still ${relation.type} ${relation.target}. If visibly true, emit this exact relation. If uncertain, omit it. If clearly false, report only visually clear contradictory current evidence.`
          : `Re-check whether ${entity.key} is still in checkpoint state ${relation.type}. If visibly true, emit this exact relation; otherwise omit or report only a clear contradiction.`,
      }));
    }
    return hint;
  });
}
function comparisonEvidenceMode(observation: StoredObservation): "strict" | "vision" {
  return observation.basis === "controlled-demo" ? "strict" : "vision";
}

/** Loopback-only development surface; one stream, no persistent media or credentials in the browser. */
export function createPreviewServer(
  services: PreviewServices,
  assets: { html: string; js: string; verifyJs?: string },
) {
  let active: { id: string; url: string; touched: number } | undefined;
  let busy = false;
  let observing = false;
  let agentRunning = false;
  const observations = new Map<string, StoredObservation>();
  const rewindSessions = new Map<string, RewindSession>();

  async function cleanup() {
    if (!active) return;
    await services.stop(active.url);
    active = undefined;
  }
  function rememberObservation(
    spaceId: string,
    result: VisionObservation,
    sourceImageHash?: string,
    basis?: ObservationBasis,
    checkpointViewId?: string,
    viewSelectionScore?: number,
  ) {
    const id = randomUUID();
    const row: StoredObservation = {
      spaceId,
      state: result.state,
      receivedAt: Date.now(),
    };
    if (result.modelId !== undefined) row.modelId = result.modelId;
    if (result.latencyMs !== undefined) row.latencyMs = result.latencyMs;
    if (sourceImageHash !== undefined) row.sourceImageHash = sourceImageHash;
    if (basis !== undefined) row.basis = basis;
    if (checkpointViewId !== undefined) row.checkpointViewId = checkpointViewId;
    if (viewSelectionScore !== undefined) row.viewSelectionScore = viewSelectionScore;
    observations.set(id, row);
    while (observations.size > 20) {
      const oldest = observations.keys().next().value as string | undefined;
      if (!oldest) break;
      observations.delete(oldest);
    }
    return id;
  }
  function rememberRewindSession(
    spaceId: string,
    checkpointId: string,
    plan: RestorePlan,
    checkpointViewId?: string,
  ) {
    const session: RewindSession = {
      id: randomUUID(),
      spaceId,
      checkpointId,
      ...(checkpointViewId ? { checkpointViewId } : {}),
      plan,
      touched: Date.now(),
    };
    rewindSessions.set(session.id, session);
    while (rewindSessions.size > 20) {
      const oldest = rewindSessions.keys().next().value as string | undefined;
      if (!oldest) break;
      rewindSessions.delete(oldest);
    }
    return session;
  }
  async function checkpointForId(spaceId: string, checkpointId: string) {
    if (!services.getCheckpoint) return undefined;
    const checkpoint = await services.getCheckpoint(spaceId, checkpointId);
    if (!checkpoint) throw new InputError("Checkpoint not found.");
    return checkpoint;
  }
  function stateForCheckpointView(checkpoint: Checkpoint, checkpointViewId?: string) {
    if (!checkpointViewId) return checkpoint.state;
    return checkpointViews(checkpoint).find(view => view.id === checkpointViewId)?.state ?? checkpoint.state;
  }
  async function checkpointForActiveRewind(spaceId: string) {
    const session = [...rewindSessions.values()]
      .filter(candidate => candidate.spaceId === spaceId)
      .sort((left, right) => right.touched - left.touched)[0];
    if (!session) return undefined;
    return checkpointForId(spaceId, session.checkpointId);
  }

  const server = createServer(async (req, res) => {
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 0;
    const hosts = [`localhost:${port}`, `127.0.0.1:${port}`];
    if (!hosts.includes(req.headers.host ?? "")) { send(res, 403, { error: "Local access only." }); return; }
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
      send(res, 403, { error: "Origin rejected." }); return;
    }
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = requestUrl.pathname;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'");
    try {
      if (req.method === "GET" && ["/", "/preview.js", "/verify.js"].includes(path)) {
        if (path === "/verify.js" && assets.verifyJs === undefined) { send(res, 404, { error: "Not found." }); return; }
        res.setHeader("Content-Type", path === "/" ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8");
        res.end(path === "/" ? assets.html : path === "/preview.js" ? assets.js : assets.verifyJs); return;
      }
      if (req.method === "GET" && path === "/api/devices") {
        send(res, 200, await services.devices()); return;
      }
      if (req.method === "GET" && path === "/api/checkpoints") {
        if (!services.listCheckpoints) { send(res, 503, { error: "Checkpoint persistence is not configured." }); return; }
        const spaceId = requestUrl.searchParams.get("spaceId");
        if (!validSpaceId(spaceId)) throw new InputError("Choose a valid space before loading checkpoints.");
        const checkpoints = await services.listCheckpoints(spaceId);
        send(res, 200, checkpoints.map(summarizeCheckpoint)); return;
      }
      if (req.method === "GET" && path === "/api/mcp-observation-request") {
        if (!services.pendingMcpObservationRequest) { send(res, 503, { error: "MCP observation bridge is not configured." }); return; }
        const spaceId = requestUrl.searchParams.get("spaceId");
        if (!validSpaceId(spaceId)) throw new InputError("A valid spaceId is required.");
        const pending = services.pendingMcpObservationRequest(spaceId);
        send(res, 200, pending
          ? { requested: true, requestId: pending.id, requestedAt: pending.requestedAt }
          : { requested: false });
        return;
      }
      if (req.method === "GET" && path === "/api/mcp-observation-wait") {
        if (!services.pendingMcpObservationRequest) { send(res, 503, { error: "MCP observation bridge is not configured." }); return; }
        const spaceId = requestUrl.searchParams.get("spaceId");
        if (!validSpaceId(spaceId)) throw new InputError("A valid spaceId is required.");
        const waitMs = validWaitMs(requestUrl.searchParams.get("waitMs"));
        const deadline = Date.now() + waitMs;
        let pending = services.pendingMcpObservationRequest(spaceId);
        while (!pending && Date.now() < deadline && !res.destroyed) {
          await delay(100);
          pending = services.pendingMcpObservationRequest(spaceId);
        }
        if (res.destroyed) return;
        send(res, 200, pending
          ? { requested: true, requestId: pending.id, requestedAt: pending.requestedAt }
          : { requested: false });
        return;
      }
      if (req.method !== "POST" || ![
        "/api/start",
        "/api/stop",
        "/api/heartbeat",
        "/api/observe",
        "/api/live-frame",
        "/api/live-source",
        "/api/demo/observe",
        "/api/agent",
        "/api/checkpoints",
        "/api/checkpoints/view",
        "/api/diff",
        "/api/rewind",
        "/api/rewind/verify",
      ].includes(path)) {
        send(res, 404, { error: "Not found." }); return;
      }
      if (req.headers.origin !== `http://${req.headers.host}` || req.headers["content-type"] !== "application/json") {
        send(res, 403, { error: "Use the local preview page." }); return;
      }
      const data = await body(req);
      if (path === "/api/live-source") {
        if (!services.setLiveSource) { send(res, 503, { error: "Live source selection is not configured." }); return; }
        if (!validSpaceId(data.spaceId) || !["ring", "camera", "photo"].includes(String(data.source))) {
          throw new InputError("Choose a valid observation source and space.");
        }
        services.setLiveSource({ spaceId: data.spaceId, source: data.source });
        send(res, 200, { ok: true, source: data.source });
        return;
      }
      if (path === "/api/live-frame") {
        if (!services.publishLiveFrame) { send(res, 503, { error: "Live frame buffer is not configured." }); return; }
        if (typeof data.image !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.image) ||
            !validSpaceId(data.spaceId) || typeof data.capturedAt !== "string" || !Number.isFinite(Date.parse(data.capturedAt))) {
          throw new InputError("A live JPEG frame, space name, and capture time are required.");
        }
        const bytes = Buffer.from(data.image, "base64");
        if (bytes.length < 4 || bytes.length > 3_500_000 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) {
          throw new InputError("Capture a JPEG frame under 3.5 MB.");
        }
        services.publishLiveFrame({
          spaceId: data.spaceId,
          imageBytes: bytes,
          capturedAt: data.capturedAt,
        });
        send(res, 202, { ok: true });
        return;
      }
      if (path === "/api/demo/observe") {
        if (!validSpaceId(data.spaceId) || !validControlledDemoScenario(data.scenario)) {
          throw new InputError("Choose a valid controlled demo scenario and space.");
        }
        const result = createControlledDemoObservation(data.scenario, data.spaceId);
        const observationId = rememberObservation(data.spaceId, result, undefined, "controlled-demo");
        send(res, 200, {
          observationId,
          state: result.state,
          modelId: result.modelId,
          latencyMs: result.latencyMs,
          source: "controlled-demo",
          scenario: data.scenario,
          observationBasis: "controlled-demo",
        });
        return;
      }
      if (path === "/api/observe") {
        if (observing) { send(res, 409, { error: "An observation is already running." }); return; }
        if (typeof data.image !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.image) ||
            !validSpaceId(data.spaceId) || typeof data.capturedAt !== "string" || !Number.isFinite(Date.parse(data.capturedAt))) {
          throw new InputError("A captured JPEG, space name, and capture time are required.");
        }
        if (data.checkpointId !== undefined && !validOpaqueId(data.checkpointId)) {
          throw new InputError("Choose a valid saved state before analyzing this photo.");
        }
        const bytes = Buffer.from(data.image, "base64");
        if (bytes.length < 4 || bytes.length > 3_500_000 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) {
          throw new InputError("Capture a JPEG frame under 3.5 MB.");
        }
        observing = true;
        try {
          const sourceImageHash = hashImage(bytes);
          const checkpoint = validOpaqueId(data.checkpointId)
            ? await checkpointForId(data.spaceId, data.checkpointId)
            : await checkpointForActiveRewind(data.spaceId);

          const exactView = checkpoint
            ? findCheckpointViewByImageHash(checkpoint, sourceImageHash)
            : undefined;
          const exactImageMatch = Boolean(exactView);

          let result: VisionObservation;
          let basis: ObservationBasis;
          let checkpointViewId: string | undefined;
          let viewSelectionScore: number | undefined;

          if (checkpoint && exactView) {
            checkpointViewId = exactView.id;
            basis = "exact-image";
            result = createExactImageObservation(exactView.state, data.capturedAt);
          } else if (checkpoint) {
            const views = checkpointViews(checkpoint);
            let selectedView = views[0]!;

            if (views.length > 1) {
              const scan = await (services.observeUnpublished ?? services.observe)({
                imageBytes: bytes,
                format: "jpeg",
                context: {
                  spaceId: data.spaceId,
                  capturedAt: data.capturedAt,
                },
              });
              const selected = selectBestCheckpointView(checkpoint, scan.state);
              selectedView = selected.view;
              viewSelectionScore = selected.score;
            }

            checkpointViewId = selectedView.id;
            basis = "nova-tracked";
            result = await services.observe({
              imageBytes: bytes,
              format: "jpeg",
              context: {
                spaceId: data.spaceId,
                capturedAt: data.capturedAt,
                trackedEntities: trackedEntitiesFromState(selectedView.state),
              },
            });
          } else {
            basis = "nova-open";
            result = await services.observe({
              imageBytes: bytes,
              format: "jpeg",
              context: {
                spaceId: data.spaceId,
                capturedAt: data.capturedAt,
              },
            });
          }

          const observationId = rememberObservation(
            data.spaceId,
            result,
            sourceImageHash,
            basis,
            checkpointViewId,
            viewSelectionScore,
          );
          services.publishPhotoFrame?.({
            spaceId: data.spaceId,
            imageBytes: bytes,
            capturedAt: data.capturedAt,
          });
          services.setLiveSource?.({ spaceId: data.spaceId, source: "photo" });
          send(res, 200, {
            observationId,
            state: result.state,
            modelId: result.modelId,
            latencyMs: result.latencyMs,
            observationBasis: basis,
            exactImageMatch,
            ...(checkpointViewId ? { checkpointViewId } : {}),
            ...(viewSelectionScore !== undefined ? { viewSelectionScore } : {}),
          });
        } finally { observing = false; }
        return;
      }
      if (path === "/api/agent") {
        if (!services.invokeAgent) { send(res, 503, { error: "Live REWIND agent is not configured." }); return; }
        if (agentRunning) { send(res, 409, { error: "REWIND agent is already processing a request." }); return; }
        if (!validSpaceId(data.spaceId) || !validOpaqueId(data.observationId) || typeof data.prompt !== "string" || data.prompt.trim().length < 1 || data.prompt.trim().length > 8_000) {
          throw new InputError("Prompt, space, and a fresh trusted observation are required.");
        }
        const observation = observations.get(data.observationId);
        if (!observation || observation.spaceId !== data.spaceId) {
          throw new InputError("Capture and observe this space again before asking REWIND.");
        }
        if (Date.now() - observation.receivedAt > 30_000) {
          throw new InputError("The Ring observation is stale. Capture a fresh frame before asking REWIND.");
        }
        agentRunning = true;
        try {
          const input: PreviewAgentInput = {
            prompt: data.prompt.trim(),
            spaceId: data.spaceId,
            observationId: data.observationId,
            state: observation.state,
          };
          if (observation.modelId !== undefined) input.modelId = observation.modelId;
          if (observation.latencyMs !== undefined) input.latencyMs = observation.latencyMs;
          send(res, 200, await services.invokeAgent(input));
        } finally { agentRunning = false; }
        return;
      }
      if (path === "/api/checkpoints") {
        if (!services.saveCheckpoint) { send(res, 503, { error: "Checkpoint persistence is not configured." }); return; }
        if (!validSpaceId(data.spaceId) || typeof data.name !== "string" || data.name.trim().length < 1 || data.name.trim().length > 120 || !validOpaqueId(data.observationId)) {
          throw new InputError("Space, checkpoint name, and observation are required.");
        }
        const observation = observations.get(data.observationId);
        if (!observation || observation.spaceId !== data.spaceId) throw new InputError("Observe this space again before saving a checkpoint.");
        const checkpoint = await services.saveCheckpoint({
          spaceId: data.spaceId,
          name: data.name,
          observationId: data.observationId,
          state: observation.state,
          ...(observation.sourceImageHash ? { sourceImageHash: observation.sourceImageHash } : {}),
        });
        send(res, 201, summarizeCheckpoint(checkpoint)); return;
      }
      if (path === "/api/checkpoints/view") {
        if (!services.addCheckpointView) { send(res, 503, { error: "Multi-view checkpoint persistence is not configured." }); return; }
        if (!validSpaceId(data.spaceId) || !validOpaqueId(data.checkpointId) || !validOpaqueId(data.observationId)) {
          throw new InputError("Space, saved checkpoint, and observed view are required.");
        }
        const observation = observations.get(data.observationId);
        if (!observation || observation.spaceId !== data.spaceId) {
          throw new InputError("Observe this additional view before adding it to the checkpoint.");
        }
        const checkpoint = await services.addCheckpointView({
          spaceId: data.spaceId,
          checkpointId: data.checkpointId,
          observationId: data.observationId,
          state: observation.state,
          ...(observation.sourceImageHash ? { sourceImageHash: observation.sourceImageHash } : {}),
        });
        send(res, 200, summarizeCheckpoint(checkpoint)); return;
      }
      if (path === "/api/rewind/verify") {
        if (!services.getCheckpoint) { send(res, 503, { error: "Checkpoint persistence is not configured." }); return; }
        if (!validSpaceId(data.spaceId) || !validOpaqueId(data.observationId) || !validOpaqueId(data.rewindSessionId)) {
          throw new InputError("Space, Rewind session, and fresh observation are required.");
        }
        const observation = observations.get(data.observationId);
        if (!observation || observation.spaceId !== data.spaceId) throw new InputError("Capture and observe this space again before checking progress.");
        const session = rewindSessions.get(data.rewindSessionId);
        if (!session || session.spaceId !== data.spaceId) {
          send(res, 404, { error: "Rewind session not found. Compare and start Rewind again." }); return;
        }
        const checkpoint = await services.getCheckpoint(session.spaceId, session.checkpointId);
        if (!checkpoint) { send(res, 404, { error: "Checkpoint not found." }); return; }
        const checkpointState = stateForCheckpointView(checkpoint, session.checkpointViewId);
        const diffs = compareStates(checkpointState, observation.state, { evidenceMode: comparisonEvidenceMode(observation) });
        const match = calculateMatch(diffs);
        const progress = updateRestoreProgress(session.plan, diffs);
        const blockedUnknowns = diffs.filter(diff => diff.type === "UNKNOWN").map(diff => diff.entity);
        session.plan = { actions: progress.actions, blockedUnknowns };
        session.touched = Date.now();
        const pendingActions = session.plan.actions.filter(action => action.status === "PENDING").length;
        const state = progress.restored
          ? "RESTORED"
          : pendingActions === 0 && blockedUnknowns.length > 0
            ? "LOW_CONFIDENCE"
            : "GUIDING";
        const changes = diffs.filter(diff => diff.type !== "UNCHANGED");
        send(res, 200, {
          rewindSessionId: session.id,
          checkpoint: summarizeCheckpoint(checkpoint),
          state,
          match,
          plan: session.plan,
          progress,
          changeCount: changes.length,
          changes,
          observationBasis: observation.basis,
          exactImageMatch: observation.basis === "exact-image",
          ...(session.checkpointViewId ? { checkpointViewId: session.checkpointViewId } : {}),
        });
        return;
      }
      if (path === "/api/diff" || path === "/api/rewind") {
        if (!services.getCheckpoint) { send(res, 503, { error: "Checkpoint persistence is not configured." }); return; }
        if (!validSpaceId(data.spaceId) || !validOpaqueId(data.observationId) || !validOpaqueId(data.checkpointId)) {
          throw new InputError("Space, checkpoint, and current observation are required.");
        }
        const observation = observations.get(data.observationId);
        if (!observation || observation.spaceId !== data.spaceId) throw new InputError("Observe this space again before comparing it.");
        const checkpoint = await services.getCheckpoint(data.spaceId, data.checkpointId);
        if (!checkpoint) { send(res, 404, { error: "Checkpoint not found." }); return; }
        const checkpointState = stateForCheckpointView(checkpoint, observation.checkpointViewId);
        const diffs = compareStates(checkpointState, observation.state, { evidenceMode: comparisonEvidenceMode(observation) });
        const match = calculateMatch(diffs);
        const changes = diffs.filter(diff => diff.type !== "UNCHANGED");
        if (path === "/api/diff") {
          send(res, 200, {
            checkpoint: summarizeCheckpoint(checkpoint),
            match,
            changeCount: changes.length,
            changes,
            observationBasis: observation.basis,
            exactImageMatch: observation.basis === "exact-image",
            ...(observation.checkpointViewId ? { checkpointViewId: observation.checkpointViewId } : {}),
            ...(observation.viewSelectionScore !== undefined ? { viewSelectionScore: observation.viewSelectionScore } : {}),
          });
          return;
        }
        const plan = buildRestorePlan(diffs);
        const state = match.restored
          ? "RESTORED"
          : plan.actions.length === 0 && plan.blockedUnknowns.length > 0
            ? "LOW_CONFIDENCE"
            : "GUIDING";
        const rewindSession = rememberRewindSession(
          data.spaceId,
          data.checkpointId,
          plan,
          observation.checkpointViewId,
        );
        send(res, 200, {
          rewindSessionId: rewindSession.id,
          checkpoint: summarizeCheckpoint(checkpoint),
          state,
          match,
          plan,
          observationBasis: observation.basis,
          exactImageMatch: observation.basis === "exact-image",
          ...(observation.checkpointViewId ? { checkpointViewId: observation.checkpointViewId } : {}),
          ...(observation.viewSelectionScore !== undefined ? { viewSelectionScore: observation.viewSelectionScore } : {}),
        });
        return;
      }
      if (busy) { send(res, 409, { error: "Session operation in progress. Retry shortly." }); return; }
      busy = true;
      try {
        if (path === "/api/start") {
          if (active) { send(res, 409, { error: "Stop the current stream first." }); return; }
          if (typeof data.deviceId !== "string" || typeof data.offer !== "string" || !data.offer.startsWith("v=0") || data.offer.length > 256_000) {
            throw new InputError("Choose a device and provide an SDP offer.");
          }
          if (!(await services.devices()).some(d => d.id === data.deviceId)) throw new InputError("Choose a discovered device.");
          const session = await services.start(data.deviceId, data.offer);
          active = { id: randomUUID(), url: session.sessionUrl, touched: Date.now() };
          send(res, 201, { id: active.id, answer: session.sdpAnswer });
        } else {
          if (!active || data.id !== active.id) { send(res, 404, { error: "Session not found." }); return; }
          if (path === "/api/heartbeat") active.touched = Date.now();
          else await cleanup();
          send(res, 200, { ok: true });
        }
      } finally { busy = false; }
    } catch (error) {
      // Never return upstream URLs, response bodies, SDK details, SDP, credentials, or model payloads in errors.
      const status = error instanceof InputError ? 400 : 502;
      const message = error instanceof InputError ? error.message : path === "/api/observe"
        ? observationErrorMessage(error)
        : path === "/api/agent"
          ? safeAgentError(error)
          : path === "/api/checkpoints" || path === "/api/checkpoints/view" || path === "/api/diff" || path === "/api/rewind" || path === "/api/rewind/verify"
            ? "Checkpoint operation failed. Check AWS credentials and the DynamoDB table, then retry."
            : "Ring request failed. Check your token; refresh it and restart the server if expired.";
      send(res, status, { error: message });
    }
  });
  const timer = setInterval(() => {
    if (!busy && active && Date.now() - active.touched > 60_000) {
      busy = true;
      void cleanup().catch(() => {}).finally(() => { busy = false; });
    }
    const expiry = Date.now() - 30 * 60_000;
    for (const [id, session] of rewindSessions) {
      if (session.touched < expiry) rewindSessions.delete(id);
    }
    const observationExpiry = Date.now() - 5 * 60_000;
    for (const [id, observation] of observations) {
      if (observation.receivedAt < observationExpiry) observations.delete(id);
    }
  }, 10_000);
  timer.unref();
  server.on("close", () => clearInterval(timer));
  return { server, cleanup };
}
