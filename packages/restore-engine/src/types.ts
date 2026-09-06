import type { DiffType } from "../../diff-engine/src/index.js";

export type RestoreActionStatus = "PENDING" | "VERIFIED" | "BLOCKED";

export interface RestoreAction {
  id: string;
  entityKeys: string[];
  sourceTypes: DiffType[];
  instruction: string;
  verificationHint: string;
  confidence: number;
  status: RestoreActionStatus;
}

export interface RestorePlan {
  actions: RestoreAction[];
  blockedUnknowns: string[];
}

export type RestoreSessionState =
  | "IDLE"
  | "OBSERVING"
  | "COMPARING"
  | "DIFF_READY"
  | "GUIDING"
  | "WAITING_FOR_CHANGE"
  | "VERIFYING"
  | "RESTORED"
  | "OBSERVATION_FAILED"
  | "LOW_CONFIDENCE"
  | "CAMERA_UNAVAILABLE"
  | "MODEL_FAILED"
  | "CHECKPOINT_NOT_FOUND"
  | "CANCELLED";
