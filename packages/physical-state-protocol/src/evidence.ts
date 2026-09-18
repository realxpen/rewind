import type {
  ObservationEvidence,
  PhysicalState,
} from "./types.js";

export function hasObservationEvidence(state: PhysicalState): boolean {
  return state.evidence !== undefined;
}

export function evidenceCoveragePercent(evidence: ObservationEvidence | undefined): number | undefined {
  return evidence ? Math.round(evidence.coverage * 100) : undefined;
}

export function evidenceQualityPercent(evidence: ObservationEvidence | undefined): number | undefined {
  return evidence ? Math.round(evidence.quality * 100) : undefined;
}
