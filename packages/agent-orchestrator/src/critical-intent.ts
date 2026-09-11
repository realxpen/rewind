import type { CompareCheckpointResult, RewindToolResult } from "../../agent-tools/src/index.js";
import type { RewindToolOperation } from "./controller.js";

export type CriticalIntent = "compare_checkpoint" | "start_rewind" | "verify_rewind";

export function detectCriticalIntent(prompt: string): CriticalIntent | undefined {
  const normalized = prompt.trim().toLowerCase();
  if (/\b(?:check|heck)\s+again\b/.test(normalized)
    || /\bverify\b/.test(normalized)
    || /\bdid\s+that\s+fix\b/.test(normalized)) {
    return "verify_rewind";
  }
  if (/\bwhat\s+changed\b/.test(normalized)
    || /\bcompare\b/.test(normalized)
    || /\bdifferences?\b/.test(normalized)) {
    return "compare_checkpoint";
  }
  if (/\brewind\b/.test(normalized)
    || /\brestore\s+(?:my|the|this)\b/.test(normalized)) {
    return "start_rewind";
  }
  return undefined;
}

export function operationSatisfied(intent: CriticalIntent, operations: RewindToolOperation[]): boolean {
  return operations.includes(intent);
}

export function renderCompareResult(result: CompareCheckpointResult): string {
  const header = result.match.restored
    ? `Compared with ${result.checkpoint.name}: RESTORED — ${result.match.percentage}% match.`
    : `Compared with ${result.checkpoint.name}: ${result.match.percentage}% match with ${result.changeCount} meaningful change${result.changeCount === 1 ? "" : "s"}.`;

  if (result.changeCount === 0) return `${header}\nNo unresolved semantic differences remain.`;

  const changes = result.changes.map(change => `- ${change.type} · ${change.entity}: ${change.reason}`);
  return [header, ...changes].join("\n");
}

export function renderRewindResult(result: RewindToolResult, operation: "start_rewind" | "verify_rewind"): string {
  if (result.state === "RESTORED") {
    return `RESTORED — ${result.match.percentage}% match with ${result.checkpoint.name}. All deterministic restoration checks passed.`;
  }

  const pending = result.plan.actions.filter(action => action.status !== "VERIFIED");
  const prefix = operation === "start_rewind" ? "Rewind started" : "Verification complete";
  const rows = [
    `${prefix}: ${result.state} — ${result.match.percentage}% match with ${result.checkpoint.name}.`,
    `${pending.length} restoration action${pending.length === 1 ? "" : "s"} still pending.`,
  ];
  if (pending[0]) rows.push(`Next: ${pending[0].instruction}`);
  if (result.plan.blockedUnknowns.length) rows.push(`Re-observe uncertain: ${result.plan.blockedUnknowns.join(", ")}.`);
  return rows.join("\n");
}
