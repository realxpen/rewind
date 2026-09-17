import type { MatchResult, PhysicalDiff } from "./types.js";

export function calculateMatch(diffs: PhysicalDiff[]): MatchResult {
  const byEntity = new Map<string, PhysicalDiff[]>();
  for (const diff of diffs) {
    const rows = byEntity.get(diff.entity) ?? [];
    rows.push(diff);
    byEntity.set(diff.entity, rows);
  }

  let matched = 0;
  let unknown = 0;
  let confirmedChanges = 0;

  for (const rows of byEntity.values()) {
    const hasConfirmedChange = rows.some(diff => !["UNCHANGED", "UNKNOWN"].includes(diff.type));
    const hasUnknown = rows.some(diff => diff.type === "UNKNOWN");
    if (hasConfirmedChange) confirmedChanges += 1;
    else if (hasUnknown) unknown += 1;
    else matched += 1;
  }

  const total = byEntity.size;
  const comparable = matched + confirmedChanges;
  const percentage = total === 0 ? 100 : comparable === 0 ? 0 : Math.round((matched / comparable) * 100);
  const coveragePercentage = total === 0 ? 100 : Math.round((comparable / total) * 100);
  const unresolved = confirmedChanges + unknown;

  return {
    percentage,
    matched,
    unresolved,
    unknown,
    confirmedChanges,
    total,
    coveragePercentage,
    restored: total === 0 || unresolved === 0,
  };
}
