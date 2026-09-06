import type { MatchResult, PhysicalDiff } from "./types.js";

export function calculateMatch(diffs: PhysicalDiff[]): MatchResult {
  const total = diffs.length;
  const matched = diffs.filter((diff) => diff.type === "UNCHANGED").length;
  const unknown = diffs.filter((diff) => diff.type === "UNKNOWN").length;
  const unresolved = total - matched;
  const percentage = total === 0 ? 100 : Math.round((matched / total) * 100);
  return {
    percentage,
    matched,
    unresolved,
    unknown,
    total,
    restored: total === 0 || unresolved === 0,
  };
}
