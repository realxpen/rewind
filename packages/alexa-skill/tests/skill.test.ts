import assert from "node:assert/strict";
import { RewindAlexaSkill } from "../src/skill.js";
import type { AlexaRequestEnvelope, AlexaRewindTools } from "../src/types.js";
import type { CheckpointSummary } from "../../checkpoints/src/contracts.js";
import type { RewindToolResult } from "../../agent-tools/src/contracts.js";

const checkpoint: CheckpointSummary = {
  id: "checkpoint-clean",
  spaceId: "ring-playground",
  name: "Clean Setup",
  observationId: "obs-1",
  stateHash: "state-hash",
  createdAt: "2026-09-18T10:00:00.000Z",
  entityCount: 4,
  viewCount: 1,
};

const rewindResult: RewindToolResult = {
  rewindSessionId: "rewind-session-1",
  checkpoint,
  state: "GUIDING",
  match: {
    percentage: 72,
    matched: 3,
    unresolved: 2,
    unknown: 0,
    confirmedChanges: 2,
    total: 5,
    coveragePercentage: 100,
    restored: false,
  },
  plan: {
    actions: [
      {
        id: "restore-01",
        entityKeys: ["backpack.main"],
        sourceTypes: ["MOVED"],
        instruction: "Move backpack main near desk main.",
        verificationHint: "Re-observe backpack main.",
        confidence: 0.95,
        status: "PENDING",
      },
      {
        id: "restore-02",
        entityKeys: ["shoe.floor"],
        sourceTypes: ["ADDED"],
        instruction: "Remove shoe floor from the restored scene.",
        verificationHint: "Re-observe shoe floor.",
        confidence: 0.93,
        status: "PENDING",
      },
    ],
    blockedUnknowns: [],
  },
  changeCount: 2,
  changes: [],
};

const restoredResult: RewindToolResult = {
  ...rewindResult,
  state: "RESTORED",
  match: {
    percentage: 100,
    matched: 5,
    unresolved: 0,
    unknown: 0,
    confirmedChanges: 0,
    total: 5,
    coveragePercentage: 100,
    restored: true,
  },
  plan: { actions: [], blockedUnknowns: [] },
  changeCount: 0,
};

let inspectCalls = 0;
let saveCalls = 0;
let startCalls = 0;
let verifyCalls = 0;

const tools: AlexaRewindTools = {
  async inspectSpace() {
    inspectCalls += 1;
    return {};
  },
  async saveCheckpoint({ name }) {
    saveCalls += 1;
    return { ...checkpoint, name };
  },
  async listCheckpoints() {
    return [checkpoint];
  },
  async startRewind() {
    startCalls += 1;
    return structuredClone(rewindResult);
  },
  async verifyRewind() {
    verifyCalls += 1;
    return structuredClone(restoredResult);
  },
  async getRewindStatus() {
    return structuredClone(rewindResult);
  },
};

const skill = new RewindAlexaSkill({
  tools,
  defaultSpaceId: "ring-playground",
  skillId: "amzn1.ask.skill.rewind-test",
});

function envelope(
  type: string,
  intentName?: string,
  checkpointName?: string,
): AlexaRequestEnvelope {
  return {
    version: "1.0",
    session: {
      application: { applicationId: "amzn1.ask.skill.rewind-test" },
      user: { userId: "alexa-user-1" },
    },
    context: {
      System: {
        application: { applicationId: "amzn1.ask.skill.rewind-test" },
        user: { userId: "alexa-user-1" },
      },
    },
    request: {
      type,
      requestId: "request-1",
      timestamp: "2026-09-18T10:00:00.000Z",
      ...(intentName ? {
        intent: {
          name: intentName,
          ...(checkpointName ? {
            slots: {
              checkpointName: {
                name: "checkpointName",
                value: checkpointName,
              },
            },
          } : {}),
        },
      } : {}),
    },
  };
}

const launch = await skill.handle(envelope("LaunchRequest"));
assert.match(launch.response.outputSpeech?.text ?? "", /REWIND is ready/i);
assert.equal(launch.response.shouldEndSession, false);

const saveRequest = envelope("IntentRequest", "SaveCheckpointIntent", "Clean Setup");
const saveStart = await skill.handle(saveRequest);
assert.match(saveStart.response.outputSpeech?.text ?? "", /scanning the room with Ring/i);
assert.equal(saveStart.response.shouldEndSession, true);
await skill.whenIdle(saveRequest);
const saveStatus = await skill.handle(envelope("IntentRequest", "StatusIntent"));
assert.match(saveStatus.response.outputSpeech?.text ?? "", /Saved Clean Setup/i);
assert.equal(inspectCalls, 1);
assert.equal(saveCalls, 1);

const rewindRequest = envelope("IntentRequest", "StartRewindIntent", "clean setup");
const rewindStart = await skill.handle(rewindRequest);
assert.match(rewindStart.response.outputSpeech?.text ?? "", /checking the room against Clean Setup/i);
await skill.whenIdle(rewindRequest);

const rewindStatus = await skill.handle(envelope("IntentRequest", "StatusIntent"));
assert.match(rewindStatus.response.outputSpeech?.text ?? "", /2 important changes/i);
assert.match(rewindStatus.response.outputSpeech?.text ?? "", /Move backpack main near desk main/i);
assert.equal(inspectCalls, 2);
assert.equal(startCalls, 1);

const next = await skill.handle(envelope("IntentRequest", "NextStepIntent"));
assert.match(next.response.outputSpeech?.text ?? "", /Remove shoe floor/i);

const checkRequest = envelope("IntentRequest", "CheckAgainIntent");
const check = await skill.handle(checkRequest);
assert.match(check.response.outputSpeech?.text ?? "", /checking the room again with Ring/i);
await skill.whenIdle(checkRequest);
const restored = await skill.handle(envelope("IntentRequest", "StatusIntent"));
assert.match(restored.response.outputSpeech?.text ?? "", /important visible parts of Clean Setup are restored/i);
assert.match(restored.response.outputSpeech?.text ?? "", /perfect pixel match/i);
assert.equal(verifyCalls, 1);

const wrongSkill = new RewindAlexaSkill({
  tools,
  defaultSpaceId: "ring-playground",
  skillId: "expected-skill",
});
const rejected = await wrongSkill.handle(envelope("LaunchRequest"));
assert.equal(rejected.response.shouldEndSession, true);
assert.match(rejected.response.outputSpeech?.text ?? "", /not intended/i);

console.log("PASS Alexa skill: async scan/save/rewind/check/status/step guidance + skill-id gate");
