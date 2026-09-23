import type { CheckpointSummary } from "../../checkpoints/src/contracts.js";
import type { RewindToolResult } from "../../agent-tools/src/contracts.js";

export interface AlexaRewindTools {
  inspectSpace(input: { spaceId: string; checkpointId?: string }): Promise<unknown>;
  saveCheckpoint(input: { spaceId: string; name: string }): Promise<CheckpointSummary>;
  listCheckpoints(input: { spaceId: string }): Promise<CheckpointSummary[]>;
  startRewind(input: { spaceId: string; checkpointId: string }): Promise<RewindToolResult>;
  verifyRewind(input: { spaceId: string; rewindSessionId: string }): Promise<RewindToolResult>;
  getRewindStatus(input: { spaceId: string; rewindSessionId: string }): Promise<RewindToolResult>;
}

export interface AlexaIntent {
  name?: string;
  slots?: Record<string, {
    name?: string;
    value?: string;
  }>;
}

export interface AlexaRequestEnvelope {
  version?: string;
  session?: {
    application?: { applicationId?: string };
    user?: { userId?: string };
  };
  context?: {
    System?: {
      application?: { applicationId?: string };
      user?: { userId?: string };
    };
  };
  request?: {
    type?: string;
    requestId?: string;
    timestamp?: string;
    intent?: AlexaIntent;
  };
}

export interface AlexaResponseEnvelope {
  version: "1.0";
  response: {
    outputSpeech?: {
      type: "PlainText";
      text: string;
    };
    reprompt?: {
      outputSpeech: {
        type: "PlainText";
        text: string;
      };
    };
    shouldEndSession: boolean;
  };
}
