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

function expectedRelation(diff: PhysicalDiff): PhysicalRelation | undefined {
  return diff.expected?.relations?.[0] ?? diff.expected?.entity?.relations?.[0];
}

function relationInstruction(entity: string, relation: PhysicalRelation | undefined): string {
  if (!relation) return `Return ${humanEntity(entity)} to its checkpoint position.`;
  const phrase = relationPhrase[relation.type] ?? relation.type.toLowerCase();
  return relation.target
    ? `Move ${humanEntity(entity)} ${phrase} ${humanEntity(relation.target)}.`
    : `Restore ${humanEntity(entity)} to ${relation.type.toLowerCase()}.`;
}

function attributeInstruction(entity: string, expected: Record<string, AttributeValue> | undefined): string {
  const entries = Object.entries(expected ?? {});
  if (entries.length === 0) return `Restore ${humanEntity(entity)} to its checkpoint state.`;
  const [key, value] = entries[0]!;
  if (key === "powered" && value === true) return `Turn on ${humanEntity(entity)}.`;
  if (key === "powered" && value === false) return `Turn off ${humanEntity(entity)}.`;
  if (key === "clear" && value === true) return `Clear ${humanEntity(entity)}.`;
  if (key === "clear" && value === false) return `Restore items to ${humanEntity(entity)}.`;
  if (typeof value === "boolean") return `${value ? "Enable" : "Disable"} ${key} on ${humanEntity(entity)}.`;
  return `Set ${key} on ${humanEntity(entity)} to ${String(value)}.`;
}

function actionForDiff(diff: PhysicalDiff, index: number): RestoreAction | undefined {
  if (diff.type === "UNCHANGED" || diff.type === "UNKNOWN") return undefined;
  let instruction: string;
  switch (diff.type) {
    case "ADDED":
      instruction = `Remove ${humanEntity(diff.entity)} from the restored scene.`;
      break;
    case "REMOVED":
    case "MOVED":
      instruction = relationInstruction(diff.entity, expectedRelation(diff));
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
  const actionable = diffs.filter((diff) => !["UNCHANGED", "UNKNOWN"].includes(diff.type));
  const actions = actionable
    .map((diff, index) => actionForDiff(diff, index))
    .filter((action): action is RestoreAction => action !== undefined);
  return {
    actions,
    blockedUnknowns: diffs.filter((diff) => diff.type === "UNKNOWN").map((diff) => diff.entity),
  };
}
