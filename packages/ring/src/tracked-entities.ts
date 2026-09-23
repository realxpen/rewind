import type { PhysicalState } from "../../physical-state-protocol/src/index.js";
import type { TrackedEntityHint } from "../../vision/src/contracts.js";

export function trackedEntitiesFromReferenceState(state?: PhysicalState): TrackedEntityHint[] | undefined {
  if (!state?.entities.length) return undefined;

  return state.entities.map(entity => {
    const hint: TrackedEntityHint = {
      key: entity.key,
      category: entity.category,
      description: `This is the checkpoint identity ${entity.key}. Match the corresponding visible ${entity.category} to this exact key; never replace, split, or rename it.`,
    };

    if (entity.attributes && Object.keys(entity.attributes).length > 0) {
      hint.observableAttributes = Object.fromEntries(
        Object.keys(entity.attributes).map(attribute => [
          attribute,
          `Observe only the current visible value for "${attribute}" on this tracked entity. Omit it if the image does not support a value.`,
        ]),
      );
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
