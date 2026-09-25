import type { PhysicalState } from "../../physical-state-protocol/src/index.js";
import type { TrackedEntityHint } from "../../vision/src/contracts.js";

const IDENTITY_ATTRIBUTES = new Set([
  "color",
  "colour",
  "material",
  "pattern",
  "brand",
  "model",
  "shape",
  "size",
  "appearance",
  "visible_label",
]);

function identityDescription(attributes: Record<string, unknown> | undefined): string {
  if (!attributes) return "";
  const cues = Object.entries(attributes)
    .filter(([key, value]) => IDENTITY_ATTRIBUTES.has(key.toLowerCase()) && value !== null && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key}=${String(value)}`);
  return cues.length ? ` Saved visible identity cues: ${cues.join(", ")}.` : "";
}

function savedLocationDescription(state: PhysicalState, entityKey: string): string {
  const entity = state.entities.find(candidate => candidate.key === entityKey);
  const relation = entity?.relations?.[0];
  if (!relation) return "";
  return relation.target
    ? ` Saved location cue: ${relation.type} ${relation.target}.`
    : ` Saved location cue: ${relation.type}.`;
}

export function trackedEntitiesFromReferenceState(state?: PhysicalState): TrackedEntityHint[] | undefined {
  if (!state?.entities.length) return undefined;

  return state.entities.map(entity => {
    const hint: TrackedEntityHint = {
      key: entity.key,
      category: entity.category,
      description: [
        `This is checkpoint identity ${entity.key}. Match the corresponding visible ${entity.category} to this exact key; never replace, split, or rename it.`,
        identityDescription(entity.attributes),
        savedLocationDescription(state, entity.key),
      ].filter(Boolean).join(""),
    };

    if (entity.attributes && Object.keys(entity.attributes).length > 0) {
      const observable = Object.fromEntries(
        Object.keys(entity.attributes)
          .filter(attribute => !IDENTITY_ATTRIBUTES.has(attribute.toLowerCase()))
          .map(attribute => [
            attribute,
            attribute.toLowerCase() === "present"
              ? `The checkpoint says ${entity.key} was present. Search for this exact saved object using its identity and location cues. Emit present=true if clearly visible; emit present=false only if its saved area is visible/unoccluded and the object is clearly absent; otherwise omit present.`
              : `Observe only the current visible value for "${attribute}" on this tracked entity. Omit it if the image does not support a value.`,
          ]),
      );
      if (Object.keys(observable).length > 0) hint.observableAttributes = observable;
    }

    if (entity.relations?.length) {
      hint.observableRelations = entity.relations.map(relation => ({
        type: relation.type,
        ...(relation.target ? { target: relation.target } : {}),
        description: relation.target
          ? `Re-check whether ${entity.key} is still ${relation.type} ${relation.target}. If visibly true, emit this exact relation. If uncertain, omit it. If clearly false, report only visually clear contradictory current evidence.`
          : `Re-check whether ${entity.key} is still in checkpoint state ${relation.type}. If visibly true, emit this exact relation; otherwise omit or report only a clear contradiction.`,
      }));
    }

    return hint;
  });
}
