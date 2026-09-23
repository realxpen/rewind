import type { CheckpointSummary } from "../../checkpoints/src/contracts.js";
import type { RewindToolResult } from "../../agent-tools/src/contracts.js";
import type {
  AlexaRequestEnvelope,
  AlexaResponseEnvelope,
  AlexaRewindTools,
} from "./types.js";

type JobKind = "SAVE" | "REWIND" | "VERIFY";

interface VoiceJob {
  kind: JobKind;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  startedAt: number;
  checkpointName?: string;
  error?: string;
  retryable?: boolean;
  retry?: () => Promise<void>;
}

interface UserVoiceState {
  spaceId: string;
  job?: VoiceJob;
  rewindSessionId?: string;
  checkpointId?: string;
  checkpointName?: string;
  latestResult?: RewindToolResult;
  actionIndex: number;
  lastSpeech?: string;
}

export interface RewindAlexaSkillOptions {
  tools: AlexaRewindTools;
  defaultSpaceId: string;
  skillId?: string;
  now?: () => number;
}

function response(text: string, shouldEndSession = false, reprompt?: string): AlexaResponseEnvelope {
  return {
    version: "1.0",
    response: {
      outputSpeech: { type: "PlainText", text },
      ...(reprompt ? {
        reprompt: {
          outputSpeech: { type: "PlainText", text: reprompt },
        },
      } : {}),
      shouldEndSession,
    },
  };
}

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function checkpointSlot(envelope: AlexaRequestEnvelope): string | undefined {
  const slots = envelope.request?.intent?.slots;
  return slots?.checkpointName?.value?.trim()
    || slots?.stateName?.value?.trim()
    || slots?.checkpoint?.value?.trim();
}

function applicationId(envelope: AlexaRequestEnvelope): string | undefined {
  return envelope.context?.System?.application?.applicationId
    ?? envelope.session?.application?.applicationId;
}

function userId(envelope: AlexaRequestEnvelope): string {
  return envelope.context?.System?.user?.userId
    ?? envelope.session?.user?.userId
    ?? "rewind-alexa-demo-user";
}

function pendingActions(result: RewindToolResult | undefined) {
  return result?.plan.actions.filter(action => action.status === "PENDING") ?? [];
}

function retryableFreshRingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /timed out waiting for the ring preview/i.test(message)
    || /fresh Ring observation is already being requested/i.test(message)
    || /Ring video is not advancing yet/i.test(message);
}

function conciseError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/Ring snapshot unavailable \(400\)/i.test(message)) return "Ring rejected the snapshot request format.";
  if (/Ring snapshot unavailable \(401\)/i.test(message)) return "The Ring access token is no longer authorized. Refresh the Ring token and restart REWIND.";
  if (/Ring snapshot unavailable \(403\)/i.test(message)) return "This Ring account is not authorized to download snapshots from that device.";
  if (/Ring snapshot unavailable \(404\)/i.test(message)) return "REWIND could not find that Ring device for snapshots.";
  if (/Ring snapshot unavailable \(416\)/i.test(message)) return "Ring has no downloadable image available for this device yet.";
  if (/Ring snapshot unavailable \(425\)/i.test(message)) return "Ring says the latest recording is not ready yet. Try again shortly.";
  if (/Ring snapshot unavailable \((500|503)\)/i.test(message)) return "Ring's media service is temporarily unavailable. Try again shortly.";
  if (/Ring snapshot/i.test(message)) return "REWIND could not download a Ring snapshot for this device.";
  if (/timed out waiting for the ring preview/i.test(message) || /Ring video is not advancing yet/i.test(message)) {
    return "I couldn't get a fresh Ring view. Make sure the REWIND preview is open, then try again.";
  }
  if (/checkpoint not found/i.test(message)) return "I couldn't find that saved state.";
  if (/observation/i.test(message) && /already/i.test(message)) {
    return "REWIND is already waiting for a fresh Ring observation.";
  }
  return "I couldn't finish that REWIND action. Check the Ring preview and try again.";
}

function restoredSpeech(result: RewindToolResult, checkpointName?: string): string {
  const name = checkpointName || result.checkpoint.name;
  const actions = pendingActions(result);
  if (actions.length > 0) {
    return `I found ${actions.length} important ${actions.length === 1 ? "change" : "changes"} from ${name}. First, ${actions[0]!.instruction} Say next step to hear another instruction, or check again after you make changes.`;
  }

  if (result.state === "LOW_CONFIDENCE" || result.plan.blockedUnknowns.length > 0) {
    const count = result.plan.blockedUnknowns.length;
    return `I don't see any confirmed important changes from ${name}. It looks restored enough from what Ring can verify. ${count || "Some"} ${count === 1 ? "item wasn't" : "items weren't"} clear enough to confirm, so you can ask me to check again if you want stronger verification.`;
  }

  return `The important visible parts of ${name} are restored. I don't need a perfect pixel match to stop guiding you.`;
}

export class RewindAlexaSkill {
  private readonly users = new Map<string, UserVoiceState>();
  private readonly tools: AlexaRewindTools;
  private readonly defaultSpaceId: string;
  private readonly skillId: string | undefined;
  private readonly now: () => number;

  constructor(options: RewindAlexaSkillOptions) {
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(options.defaultSpaceId)) {
      throw new Error("Alexa default space ID is invalid.");
    }
    this.tools = options.tools;
    this.defaultSpaceId = options.defaultSpaceId;
    this.skillId = options.skillId;
    this.now = options.now ?? (() => Date.now());
  }

  private state(envelope: AlexaRequestEnvelope): UserVoiceState {
    const id = userId(envelope);
    const existing = this.users.get(id);
    if (existing) return existing;
    const created: UserVoiceState = {
      spaceId: this.defaultSpaceId,
      actionIndex: 0,
    };
    this.users.set(id, created);
    return created;
  }

  private speak(state: UserVoiceState, text: string, shouldEndSession = false, reprompt?: string) {
    state.lastSpeech = text;
    return response(text, shouldEndSession, reprompt);
  }

  private assertSkill(envelope: AlexaRequestEnvelope): AlexaResponseEnvelope | undefined {
    if (!this.skillId) return undefined;
    if (applicationId(envelope) === this.skillId) return undefined;
    return response("This request was not intended for this REWIND skill.", true);
  }

  private findCheckpoint(checkpoints: CheckpointSummary[], spokenName?: string): CheckpointSummary | undefined {
    if (checkpoints.length === 0) return undefined;
    if (!spokenName) return checkpoints[0];

    const target = normalized(spokenName);
    const exact = checkpoints.find(item => normalized(item.name) === target);
    if (exact) return exact;

    return checkpoints.find(item => {
      const name = normalized(item.name);
      return name.includes(target) || target.includes(name);
    });
  }

  private runJob(
    state: UserVoiceState,
    job: VoiceJob,
    work: () => Promise<void>,
  ): void {
    job.status = "PENDING";
    job.startedAt = this.now();
    job.retry = work;
    delete job.error;
    delete job.retryable;
    void work()
      .then(() => {
        if (state.job === job) state.job.status = "SUCCEEDED";
      })
      .catch(error => {
        if (state.job === job) {
          const message = error instanceof Error ? error.message : "unknown error";
          console.error(`REWIND Alexa ${job.kind} failed: ${message.replace(/https?:\\/\\/\\S+/g, "[redacted-url]")}`);
          state.job.status = "FAILED";
          state.job.error = conciseError(error);
          state.job.retryable = retryableFreshRingError(error);
        }
      });
  }

  private startJob(
    state: UserVoiceState,
    job: VoiceJob,
    work: () => Promise<void>,
  ): boolean {
    if (state.job?.status === "PENDING") return false;
    state.job = job;
    this.runJob(state, job, work);
    return true;
  }

  private retryFailedJob(state: UserVoiceState): boolean {
    const job = state.job;
    if (!job || job.status !== "FAILED" || !job.retryable || !job.retry) return false;
    this.runJob(state, job, job.retry);
    return true;
  }

  private jobStatusSpeech(state: UserVoiceState): string | undefined {
    const job = state.job;
    if (!job) return undefined;
    if (job.status === "PENDING") {
      return "I'm still checking the room with Ring. Ask me again in a moment.";
    }
    if (job.status === "FAILED") {
      return job.error ?? "The last REWIND action didn't finish.";
    }
    if (job.kind === "SAVE") {
      return `Saved ${state.checkpointName ?? "that setup"}. REWIND now remembers its semantic state.`;
    }
    if (state.latestResult) {
      return restoredSpeech(state.latestResult, state.checkpointName);
    }
    return "The last REWIND action finished.";
  }

  async whenIdle(envelope: AlexaRequestEnvelope, timeoutMs = 2_000): Promise<void> {
    const state = this.state(envelope);
    const started = this.now();
    while (state.job?.status === "PENDING") {
      if (this.now() - started > timeoutMs) throw new Error("Alexa background job did not finish in time.");
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  async handle(envelope: AlexaRequestEnvelope): Promise<AlexaResponseEnvelope> {
    const rejected = this.assertSkill(envelope);
    if (rejected) return rejected;

    const state = this.state(envelope);
    const requestType = envelope.request?.type;

    if (requestType === "LaunchRequest") {
      return this.speak(
        state,
        "REWIND is ready. You can ask me to remember this room, rewind to a saved setup, check again, or tell you what's next.",
        false,
        "Try saying, remember this room as clean setup.",
      );
    }

    if (requestType === "SessionEndedRequest") {
      return response("", true);
    }

    if (requestType !== "IntentRequest") {
      return this.speak(state, "I didn't understand that REWIND request.", false);
    }

    const intent = envelope.request?.intent?.name;

    if (intent === "AMAZON.StopIntent" || intent === "AMAZON.CancelIntent") {
      return this.speak(state, "Okay. REWIND will stop talking for now.", true);
    }

    if (intent === "AMAZON.HelpIntent") {
      return this.speak(
        state,
        "You can say remember this room as clean setup, rewind to clean setup, check again, what's next, repeat that, or list my saved states.",
        false,
      );
    }

    if (intent === "RepeatStepIntent" || intent === "AMAZON.RepeatIntent") {
      return this.speak(state, state.lastSpeech ?? "There isn't a REWIND instruction to repeat yet.", false);
    }

    if (intent === "ListCheckpointsIntent") {
      const checkpoints = await this.tools.listCheckpoints({ spaceId: state.spaceId });
      if (!checkpoints.length) return this.speak(state, "You don't have any saved REWIND states for this space yet.", false);
      const names = checkpoints.slice(0, 5).map(item => item.name);
      return this.speak(
        state,
        `Your saved states are ${names.join(", ")}.`,
        false,
      );
    }

    if (intent === "SaveCheckpointIntent") {
      const name = checkpointSlot(envelope);
      if (!name) {
        return this.speak(state, "What should I call this setup?", false, "For example, say clean setup.");
      }
      const job: VoiceJob = {
        kind: "SAVE",
        status: "PENDING",
        startedAt: this.now(),
        checkpointName: name,
      };
      const started = this.startJob(state, job, async () => {
        await this.tools.inspectSpace({ spaceId: state.spaceId });
        const checkpoint = await this.tools.saveCheckpoint({ spaceId: state.spaceId, name });
        state.checkpointId = checkpoint.id;
        state.checkpointName = checkpoint.name;
      });
      if (!started) return this.speak(state, "REWIND is already checking the room. Ask me for status in a moment.", false);
      return this.speak(
        state,
        `I'm scanning the room with Ring so I can remember it as ${name}. This can take longer than an Alexa request, so ask me for status in a moment.`,
        true,
      );
    }

    if (intent === "StartRewindIntent") {
      const spokenName = checkpointSlot(envelope);
      const checkpoints = await this.tools.listCheckpoints({ spaceId: state.spaceId });
      const checkpoint = this.findCheckpoint(checkpoints, spokenName);
      if (!checkpoint) {
        return this.speak(
          state,
          spokenName
            ? `I couldn't find a saved state called ${spokenName}.`
            : "You don't have a saved state for this space yet.",
          false,
        );
      }

      const job: VoiceJob = {
        kind: "REWIND",
        status: "PENDING",
        startedAt: this.now(),
        checkpointName: checkpoint.name,
      };
      const started = this.startJob(state, job, async () => {
        await this.tools.inspectSpace({ spaceId: state.spaceId });
        const result = await this.tools.startRewind({
          spaceId: state.spaceId,
          checkpointId: checkpoint.id,
        });
        state.checkpointId = checkpoint.id;
        state.checkpointName = checkpoint.name;
        state.rewindSessionId = result.rewindSessionId;
        state.latestResult = result;
        state.actionIndex = 0;
      });
      if (!started) return this.speak(state, "REWIND is already checking the room. Ask me for status in a moment.", false);
      return this.speak(
        state,
        `I'm checking the room against ${checkpoint.name}. Ask me what's next in a moment.`,
        true,
      );
    }

    if (intent === "CheckAgainIntent") {
      if (!state.rewindSessionId) {
        return this.speak(state, "Start a rewind first, then I can check your progress.", false);
      }
      const job: VoiceJob = {
        kind: "VERIFY",
        status: "PENDING",
        startedAt: this.now(),
      };
      const started = this.startJob(state, job, async () => {
        const result = await this.tools.verifyRewind({
          spaceId: state.spaceId,
          rewindSessionId: state.rewindSessionId!,
        });
        state.latestResult = result;
        state.actionIndex = 0;
      });
      if (!started) return this.speak(state, "I'm already checking your progress. Ask me for status in a moment.", false);
      return this.speak(
        state,
        "I'm checking the room again with Ring. Ask me for status in a moment.",
        true,
      );
    }

    if (intent === "StatusIntent") {
      if (state.job?.status === "FAILED" && this.retryFailedJob(state)) {
        return this.speak(
          state,
          "The last Ring scan timed out, so I'm trying the fresh view again now. Ask me for status in a moment.",
          true,
        );
      }
      const jobSpeech = this.jobStatusSpeech(state);
      if (jobSpeech) return this.speak(state, jobSpeech, false);
      if (state.rewindSessionId) {
        const result = await this.tools.getRewindStatus({
          spaceId: state.spaceId,
          rewindSessionId: state.rewindSessionId,
        });
        state.latestResult = result;
        return this.speak(state, restoredSpeech(result, state.checkpointName), false);
      }
      return this.speak(state, "REWIND isn't restoring anything right now.", false);
    }

    if (intent === "NextStepIntent") {
      const jobSpeech = this.jobStatusSpeech(state);
      if (state.job?.status === "PENDING" || state.job?.status === "FAILED") {
        return this.speak(state, jobSpeech ?? "REWIND is still checking.", false);
      }
      const actions = pendingActions(state.latestResult);
      if (!actions.length) {
        return this.speak(
          state,
          state.latestResult
            ? restoredSpeech(state.latestResult, state.checkpointName)
            : "Start a rewind first and I'll guide you one step at a time.",
          false,
        );
      }
      state.actionIndex = Math.min(state.actionIndex + 1, actions.length - 1);
      return this.speak(
        state,
        `Next, ${actions[state.actionIndex]!.instruction} Say check again when you want me to verify the room.`,
        false,
      );
    }

    return this.speak(
      state,
      "I can remember a setup, rewind to it, check progress, or tell you the next restore step.",
      false,
    );
  }
}
