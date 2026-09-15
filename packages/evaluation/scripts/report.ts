import { readFile } from "node:fs/promises";
import { summarizeEvaluation, type EvaluationTrial } from "../src/summary.js";

const inputPath = process.env.REWIND_EVALUATION_LOG ?? "Raw/phase11-evaluation.jsonl";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

try {
  const raw = await readFile(inputPath, "utf8");
  const trials = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try { return JSON.parse(line) as EvaluationTrial; }
      catch { throw new Error(`Invalid JSON on ${inputPath} line ${index + 1}.`); }
    });
  const summary = summarizeEvaluation(trials);

  console.log("REWIND Phase 11 Evaluation Summary");
  console.log(`Trials: ${summary.trials} (${summary.liveRingTrials} live Ring, ${summary.controlledDemoTrials} controlled demo)`);
  console.log(`Pass rate: ${percent(summary.passRate)}`);
  console.log(`Object accuracy: ${percent(summary.objectAccuracy)}`);
  console.log(`Diff accuracy: ${percent(summary.diffAccuracy)}`);
  console.log(`Verification success: ${percent(summary.verificationSuccessRate)}`);
  console.log(summary.measuredLatencyTrials > 0
    ? `Average end-to-end latency: ${summary.averageLatencyMs.toFixed(0)} ms (${summary.measuredLatencyTrials} measured trial${summary.measuredLatencyTrials === 1 ? "" : "s"})`
    : "Average end-to-end latency: not measured yet");
  console.log(`Failures — Nova: ${summary.novaFailures}, Ring: ${summary.ringFailures}, tools: ${summary.toolFailures}, verification: ${summary.verificationFailures}`);
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") {
    console.error(`No evaluation log found at ${inputPath}. Record a trial first with npm run eval:record.`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
