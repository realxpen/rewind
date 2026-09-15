export type EvaluationSource = "live-ring" | "controlled-demo";
export type EvaluationOutcome = "PASS" | "FAIL";

export interface EvaluationTrial {
  id: string;
  recordedAt: string;
  source: EvaluationSource;
  outcome: EvaluationOutcome;
  expectedObjects: number;
  correctObjects: number;
  expectedDiffs: number;
  correctDiffs: number;
  latencyMs: number;
  novaFailures: number;
  ringFailures: number;
  toolFailures: number;
  verificationFailures: number;
  verificationRestored: boolean;
  notes?: string;
}

export interface EvaluationSummary {
  trials: number;
  passes: number;
  passRate: number;
  liveRingTrials: number;
  controlledDemoTrials: number;
  objectAccuracy: number;
  diffAccuracy: number;
  averageLatencyMs: number;
  measuredLatencyTrials: number;
  verificationSuccessRate: number;
  novaFailures: number;
  ringFailures: number;
  toolFailures: number;
  verificationFailures: number;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function summarizeEvaluation(trials: EvaluationTrial[]): EvaluationSummary {
  const expectedObjects = trials.reduce((sum, trial) => sum + trial.expectedObjects, 0);
  const correctObjects = trials.reduce((sum, trial) => sum + trial.correctObjects, 0);
  const expectedDiffs = trials.reduce((sum, trial) => sum + trial.expectedDiffs, 0);
  const correctDiffs = trials.reduce((sum, trial) => sum + trial.correctDiffs, 0);
  const measuredLatency = trials.filter(trial => trial.latencyMs > 0);
  const latencyTotal = measuredLatency.reduce((sum, trial) => sum + trial.latencyMs, 0);
  const passes = trials.filter(trial => trial.outcome === "PASS").length;
  const restored = trials.filter(trial => trial.verificationRestored).length;

  return {
    trials: trials.length,
    passes,
    passRate: ratio(passes, trials.length),
    liveRingTrials: trials.filter(trial => trial.source === "live-ring").length,
    controlledDemoTrials: trials.filter(trial => trial.source === "controlled-demo").length,
    objectAccuracy: ratio(correctObjects, expectedObjects),
    diffAccuracy: ratio(correctDiffs, expectedDiffs),
    averageLatencyMs: measuredLatency.length > 0 ? latencyTotal / measuredLatency.length : 0,
    measuredLatencyTrials: measuredLatency.length,
    verificationSuccessRate: ratio(restored, trials.length),
    novaFailures: trials.reduce((sum, trial) => sum + trial.novaFailures, 0),
    ringFailures: trials.reduce((sum, trial) => sum + trial.ringFailures, 0),
    toolFailures: trials.reduce((sum, trial) => sum + trial.toolFailures, 0),
    verificationFailures: trials.reduce((sum, trial) => sum + trial.verificationFailures, 0),
  };
}
