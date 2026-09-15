import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { EvaluationOutcome, EvaluationSource, EvaluationTrial } from "../src/summary.js";

const outputPath = process.env.REWIND_EVALUATION_LOG ?? "Raw/phase11-evaluation.jsonl";
const rl = createInterface({ input, output });

function parseCount(value: string, label: string, fallback?: number): number {
  const normalized = value.trim();
  if (normalized === "" && fallback === undefined) {
    throw new Error(`${label} is required.`);
  }
  const number = Number(normalized === "" ? fallback : normalized);
  if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) {
    throw new Error(`${label} must be a non-negative whole number.`);
  }
  return number;
}

function parseLatency(value: string): number {
  const normalized = value.trim();
  const number = Number(normalized === "" ? 0 : normalized);
  if (!Number.isFinite(number) || number < 0) throw new Error("Latency must be a non-negative number.");
  return number;
}

try {
  const sourceAnswer = (await rl.question("Source [controlled-demo/live-ring] (controlled-demo): ")).trim() || "controlled-demo";
  if (sourceAnswer !== "controlled-demo" && sourceAnswer !== "live-ring") throw new Error("Source must be controlled-demo or live-ring.");
  const source = sourceAnswer as EvaluationSource;
  const controlled = source === "controlled-demo";

  const outcomeAnswer = (await rl.question("Outcome [PASS/FAIL] (PASS): ")).trim().toUpperCase() || "PASS";
  if (outcomeAnswer !== "PASS" && outcomeAnswer !== "FAIL") throw new Error("Outcome must be PASS or FAIL.");
  const outcome = outcomeAnswer as EvaluationOutcome;

  const expectedObjects = controlled
    ? parseCount(await rl.question("Expected tracked objects (8): "), "Expected objects", 8)
    : parseCount(await rl.question("Expected tracked objects (enter ground-truth count): "), "Expected objects");
  const correctObjects = parseCount(await rl.question(`Correctly recognized objects (${expectedObjects}): `), "Correct objects", expectedObjects);

  const expectedDiffs = controlled
    ? parseCount(await rl.question("Expected meaningful diffs (6): "), "Expected diffs", 6)
    : parseCount(await rl.question("Expected meaningful diffs (0 for unchanged Live Ring scene): "), "Expected diffs", 0);
  const correctDiffs = parseCount(await rl.question(`Correct diffs (${expectedDiffs}): `), "Correct diffs", expectedDiffs);

  const latencyMs = parseLatency(await rl.question("End-to-end latency in ms (blank if not measured): "));
  const novaFailures = parseCount(await rl.question("Nova failures (0): "), "Nova failures", 0);
  const ringFailures = parseCount(await rl.question("Ring failures (0): "), "Ring failures", 0);
  const toolFailures = parseCount(await rl.question("Tool failures (0): "), "Tool failures", 0);
  const verificationFailures = parseCount(await rl.question("Verification failures (0): "), "Verification failures", 0);
  const restoredAnswer = (await rl.question("Did final verification reach deterministic RESTORED? [y/n] (y): ")).trim().toLowerCase() || "y";
  if (!new Set(["y", "yes", "n", "no"]).has(restoredAnswer)) throw new Error("RESTORED answer must be y or n.");
  const notes = (await rl.question("Notes (optional): ")).trim();

  if (correctObjects > expectedObjects) throw new Error("Correct objects cannot exceed expected objects.");
  if (correctDiffs > expectedDiffs) throw new Error("Correct diffs cannot exceed expected diffs.");

  const trial: EvaluationTrial = {
    id: randomUUID(),
    recordedAt: new Date().toISOString(),
    source,
    outcome,
    expectedObjects,
    correctObjects,
    expectedDiffs,
    correctDiffs,
    latencyMs,
    novaFailures,
    ringFailures,
    toolFailures,
    verificationFailures,
    verificationRestored: restoredAnswer === "y" || restoredAnswer === "yes",
  };
  if (notes) trial.notes = notes;

  await mkdir(dirname(outputPath), { recursive: true });
  await appendFile(outputPath, `${JSON.stringify(trial)}\n`, "utf8");
  console.log(`Recorded Phase 11 trial → ${outputPath}`);
  console.log(JSON.stringify(trial, null, 2));
} finally {
  rl.close();
}
