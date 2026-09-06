import { normalizeState, validatePhysicalState } from "../../physical-state-protocol/src/index.js";
import type { PhysicalState } from "../../physical-state-protocol/src/index.js";
import type { ObservationContext } from "./contracts.js";
import { extractJsonObject } from "./extract-json.js";
import { physicalStateCandidateSchema } from "./schema.js";

export class VisionContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "VisionContractError";
    this.code = code;
  }
}

export function parseNovaPhysicalState(
  rawText: string,
  context: ObservationContext,
): PhysicalState {
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(extractJsonObject(rawText));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new VisionContractError("INVALID_JSON", `Nova returned invalid JSON: ${detail}`);
  }

  const candidate = physicalStateCandidateSchema.safeParse(rawJson);
  if (!candidate.success) {
    throw new VisionContractError(
      "SCHEMA_REJECTED",
      `Nova response failed the candidate schema: ${candidate.error.message}`,
    );
  }

  if (candidate.data.spaceId !== context.spaceId) {
    throw new VisionContractError(
      "SPACE_MISMATCH",
      `Nova returned spaceId ${candidate.data.spaceId}; expected ${context.spaceId}.`,
    );
  }

  if (candidate.data.capturedAt !== context.capturedAt) {
    throw new VisionContractError(
      "CAPTURE_TIME_MISMATCH",
      "Nova changed the supplied capturedAt value.",
    );
  }

  const pspValidation = validatePhysicalState(candidate.data);
  if (!pspValidation.ok || !pspValidation.value) {
    const detail = pspValidation.issues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ");
    throw new VisionContractError(
      "PSP_REJECTED",
      `Candidate JSON failed PSP validation: ${detail}`,
    );
  }

  return normalizeState(pspValidation.value);
}
