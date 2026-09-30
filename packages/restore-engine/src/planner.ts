import type { AttributeValue, PhysicalRelation } from "../../physical-state-protocol/src/index.js";
import type { PhysicalDiff } from "../../diff-engine/src/index.js";
import type { RestoreAction, RestorePlan } from "./types.js";

const relationPhrase: Record<string, string> = {
  ON: "on",
  UNDER: "under",
  INSIDE: "inside",
  LEFT_OF: "to the left of",
  RIGHT_OF: "to the right of",
  BEHIND: "behind",
  IN_FRONT_OF: "in front of",
  NEAR: "near",
  ATTACHED_TO: "attached to",
};

function humanEntity(key: string): string {
  return key.replaceAll(".", " ").replaceAll("-", " ");
}

const LOCATION_RELATIONS = new Set(Object.keys(relationPhrase));

function snapshotRelations(snapshot: PhysicalDiff["expected"] | PhysicalDiff["actual"]): PhysicalRelation[] {
  return snapshot?.relations ?? snapshot?.entity?.relations ?? [];
}

function isDynamicSubjectDiff(diff: PhysicalDiff): boolean {
  return diff.expected?.entity?.attributes?.dynamic_subject === true
    || diff.actual?.entity?.attributes?.dynamic_subject === true;
}

function isDynamicCensusDiff(diff: PhysicalDiff): boolean {
  return diff.entity === "rewind.dynamic-census"
    || diff.category === "dynamic-census"
    || diff.expected?.entity?.attributes?.dynamic_census === true
    || diff.actual?.entity?.attributes?.dynamic_census === true;
}

function isObservationOnlyDynamicDiff(diff: PhysicalDiff): boolean {
  return isDynamicSubjectDiff(diff) || isDynamicCensusDiff(diff);
}

function positionDescription(
  snapshot: PhysicalDiff["expected"] | PhysicalDiff["actual"],
  entity: string,
): string | undefined {
  const relations = snapshotRelations(snapshot)
    .filter(relation => LOCATION_RELATIONS.has(relation.type) && relation.target && relation.target !== entity)
    .slice(0, 2);

  if (relations.length > 0) {
    return relations
      .map(relation => `${relationPhrase[relation.type] ?? relation.type.toLowerCase()} ${humanEntity(relation.target!)}`)
      .join(" and ");
  }

  const zone = snapshot?.entity?.zone;
  return zone ? `in ${humanEntity(zone)}` : undefined;
}

function placementInstruction(
  entity: string,
  snapshot: PhysicalDiff["expected"],
  verb: "Move" | "Return",
): string {
  const position = positionDescription(snapshot, entity);
  return position
    ? `${verb} ${humanEntity(entity)} to its saved position ${position}.`
    : `${verb} ${humanEntity(entity)} to its saved checkpoint position.`;
}

function removalInstruction(diff: PhysicalDiff): string {
  const position = positionDescription(diff.actual, diff.entity);
  return position
    ? `Remove ${humanEntity(diff.entity)} from its current position ${position}.`
    : `Remove ${humanEntity(diff.entity)} from its current visible position.`;
}

function attributeInstruction(entity: string, expected: Record<string, AttributeValue> | undefined): string {
  const entries = Object.entries(expected ?? {});
  if (entries.length === 0) return `Restore ${humanEntity(entity)} to its checkpoint state.`;
  const [key, value] = entries[0]!;
  if (key === "powered" && value === true) return `Turn on ${humanEntity(entity)}.`;
  if (key === "powered" && value === false) return `Turn off ${humanEntity(entity)}.`;
  if (key === "present" && value === true) return `Return ${humanEntity(entity)} to the saved scene.`;
  if (key === "present" && value === false) return `Remove ${humanEntity(entity)} from the restored scene.`;
  if (key === "clear" && value === true) return `Clear ${humanEntity(entity)}.`;
  if (key === "clear" && value === false) return `Restore items to ${humanEntity(entity)}.`;
  if (typeof value === "boolean") return `${value ? "Enable" : "Disable"} ${key} on ${humanEntity(entity)}.`;
  return `Set ${key} on ${humanEntity(entity)} to ${String(value)}.`;
}

function actionForDiff(diff: PhysicalDiff, index: number): RestoreAction | undefined {
  if (diff.type === "UNCHANGED" || diff.type === "UNKNOWN" || isObservationOnlyDynamicDiff(diff)) return undefined;
  let instruction: string;
  switch (diff.type) {
    case "ADDED":
      instruction = removalInstruction(diff);
      break;
    case "REMOVED":
      instruction = placementInstruction(diff.entity, diff.expected, "Return");
      break;
    case "MOVED":
      instruction = placementInstruction(diff.entity, diff.expected, "Move");
      break;
    case "ATTRIBUTE_CHANGED":
      instruction = attributeInstruction(diff.entity, diff.expected?.attributes ?? diff.expected?.entity?.attributes);
      break;
    default:
      return undefined;
  }
  return {
    id: `restore-${String(index + 1).padStart(2, "0")}`,
    entityKeys: [diff.entity],
    sourceTypes: [diff.type],
    instruction,
    verificationHint: `Re-observe ${humanEntity(diff.entity)} and recompute its semantic diff.`,
    confidence: diff.confidence,
    status: "PENDING",
  };
}

export function buildRestorePlan(diffs: PhysicalDiff[]): RestorePlan {
  const restorableDiffs = diffs.filter(diff => !isObservationOnlyDynamicDiff(diff));
  const actionable = restorableDiffs.filter((diff) => !["UNCHANGED", "UNKNOWN"].includes(diff.type));
  const actions = actionable
    .map((diff, index) => actionForDiff(diff, index))
    .filter((action): action is RestoreAction => action !== undefined);
  return {
    actions,
    blockedUnknowns: restorableDiffs.filter((diff) => diff.type === "UNKNOWN").map((diff) => diff.entity),
  };
}
