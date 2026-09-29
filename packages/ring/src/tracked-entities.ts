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
  "species",
]);

function identityDescription(attributes: Record<string, unknown> | undefined): string {
  if (!attributes) return "";
  const cues = Object.entries(attributes)
    .filter(([key, value]) => IDENTITY_ATTRIBUTES.has(key.toLowerCase()) && value !== null && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key}=${String(value)}`);
  return cues.length ? ` Saved visible identity cues: ${cues.join(", ")}.` : "";
}

const DYNAMIC_SUBJECT_CATEGORIES = new Set(["bird", "animal", "pet"]);

function dynamicIdentityDescription(category: string): string {
  if (!DYNAMIC_SUBJECT_CATEGORIES.has(category.toLowerCase())) return "";
  return " Dynamic subject rule: category, numbering, and location alone do NOT prove this is the same individual. Reuse this tracked key only when visible identity cues are consistent with the saved subject. If a visibly different subject occupies the area, mark the saved tracked subject absent when supported and emit the new subject under a distinct key. If identity is ambiguous, prefer uncertainty over claiming movement.";
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
        dynamicIdentityDescription(entity.category),
      ].filter(Boolean).join(""),
    };

    if (entity.attributes && Object.keys(entity.attributes).length > 0) {
      const observable = Object.fromEntries(
        Object.keys(entity.attributes)
          .filter(attribute => !IDENTITY_ATTRIBUTES.has(attribute.toLowerCase()))
          .map(attribute => [
            attribute,
            attribute.toLowerCase() === "present"
              ? DYNAMIC_SUBJECT_CATEGORIES.has(entity.category.toLowerCase())
                ? `The checkpoint says ${entity.key} was present. For this dynamic subject, do not reuse the key merely because another ${entity.category} is visible in the same area. Emit present=true only when visible identity cues support the same saved subject. Emit present=false when the saved subject is clearly gone and its area is visible. If another visibly different subject is present, it must use a distinct key.`
                : `The checkpoint says ${entity.key} was present. Search for this exact saved object using its identity and location cues. Emit present=true if clearly visible; emit present=false only if its saved area is visible/unoccluded and the object is clearly absent; otherwise omit present.`
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


export interface TrackedPresenceEvidence {
  key: string;
  status: "PRESENT" | "ABSENT" | "UNCERTAIN";
  confidence: number;
  matchedCurrentKey?: string | null;
}

export function reconcileTrackedEntityAliases(
  state: PhysicalState,
  referenceState: PhysicalState,
  first: Map<string, TrackedPresenceEvidence>,
  second: Map<string, TrackedPresenceEvidence>,
): { state: PhysicalState; reconciled: number } {
  const currentByKey = new Map(state.entities.map(entity => [entity.key, entity]));
  const referenceByKey = new Map(referenceState.entities.map(entity => [entity.key, entity]));
  const protectedReferenceKeys = new Set(referenceState.entities.map(entity => entity.key));
  const replacements = new Map<string, string>();
  const claimedCandidates = new Set<string>();

  for (const [targetKey, reference] of referenceByKey) {
    if (currentByKey.has(targetKey)) continue;

    const a = first.get(targetKey);
    const b = second.get(targetKey);
    const candidateKey = a?.matchedCurrentKey?.trim();

    if (
      a?.status !== "PRESENT"
      || b?.status !== "PRESENT"
      || a.confidence < 0.9
      || b.confidence < 0.9
      || !candidateKey
      || candidateKey !== b.matchedCurrentKey?.trim()
      || claimedCandidates.has(candidateKey)
      || protectedReferenceKeys.has(candidateKey)
    ) {
      continue;
    }

    const candidate = currentByKey.get(candidateKey);
    if (!candidate || candidate.category !== reference.category) continue;

    replacements.set(candidateKey, targetKey);
    claimedCandidates.add(candidateKey);
  }

  if (!replacements.size) return { state, reconciled: 0 };

  return {
    state: {
      ...state,
      entities: state.entities.map(entity => {
        const key = replacements.get(entity.key) ?? entity.key;
        const relations = entity.relations?.map(relation => ({
          ...relation,
          ...(relation.target && replacements.has(relation.target)
            ? { target: replacements.get(relation.target)! }
            : {}),
        }));
        return {
          ...entity,
          key,
          ...(relations ? { relations } : {}),
        };
      }),
    },
    reconciled: replacements.size,
  };
}


export interface TrackedAdditionEvidence {
  canonicalKey: string;
  category: string;
  confidence: number;
  color?: string | null;
  appearance?: string | null;
}

function normalizedAdditionToken(value: string | null | undefined): string | undefined {
  const token = value?.trim().toLowerCase();
  return token || undefined;
}

export function mergeConsensusAdditions(
  state: PhysicalState,
  referenceState: PhysicalState,
  first: Map<string, TrackedAdditionEvidence>,
  second: Map<string, TrackedAdditionEvidence>,
): { state: PhysicalState; added: number } {
  const referenceKeys = new Set(referenceState.entities.map(entity => entity.key));
  const existingKeys = new Set(state.entities.map(entity => entity.key));
  const additions = [];

  for (const [canonicalKey, a] of first) {
    const b = second.get(canonicalKey);
    if (
      !b
      || a.canonicalKey !== canonicalKey
      || b.canonicalKey !== canonicalKey
      || a.category.trim().toLowerCase() !== b.category.trim().toLowerCase()
      || a.confidence < 0.9
      || b.confidence < 0.9
      || !/^[a-z0-9][a-z0-9._-]{1,79}$/.test(canonicalKey)
      || referenceKeys.has(canonicalKey)
      || existingKeys.has(canonicalKey)
    ) {
      continue;
    }

    const category = a.category.trim().toLowerCase();
    if (!category) continue;

    const colorA = normalizedAdditionToken(a.color);
    const colorB = normalizedAdditionToken(b.color);
    if (colorA && colorB && colorA !== colorB) continue;

    const appearanceA = normalizedAdditionToken(a.appearance);
    const appearanceB = normalizedAdditionToken(b.appearance);

    const duplicateExisting = state.entities.some(entity => {
      if (entity.category.trim().toLowerCase() !== category) return false;
      const existingColor = normalizedAdditionToken(
        typeof entity.attributes?.color === "string"
          ? entity.attributes.color
          : typeof entity.attributes?.colour === "string"
            ? entity.attributes.colour
            : undefined,
      );
      if (colorA && existingColor) return colorA === existingColor;
      return entity.key === canonicalKey;
    });
    if (duplicateExisting) continue;

    additions.push({
      key: canonicalKey,
      category,
      confidence: Math.min(a.confidence, b.confidence),
      attributes: {
        present: true,
        ...(colorA && (!colorB || colorA === colorB) ? { color: colorA } : {}),
        ...(appearanceA && appearanceB && appearanceA === appearanceB ? { appearance: appearanceA } : {}),
      },
      relations: [],
    });
    existingKeys.add(canonicalKey);
  }

  if (!additions.length) return { state, added: 0 };
  return {
    state: {
      ...state,
      entities: [...state.entities, ...additions],
    },
    added: additions.length,
  };
}


export interface ObservedExtraCandidateEvidence {
  candidateKey: string;
  decision: "EXTRA" | "REPRESENTED" | "UNCERTAIN";
  confidence: number;
}

export function applyConsensusObservedExtras(
  state: PhysicalState,
  first: Map<string, ObservedExtraCandidateEvidence>,
  second: Map<string, ObservedExtraCandidateEvidence>,
): { state: PhysicalState; marked: number } {
  let marked = 0;
  const entities = state.entities.map(entity => {
    const a = first.get(entity.key);
    const b = second.get(entity.key);
    if (
      a?.decision !== "EXTRA"
      || b?.decision !== "EXTRA"
      || a.confidence < 0.9
      || b.confidence < 0.9
    ) {
      return entity;
    }

    const alreadyPresent = entity.attributes?.present === true;
    const alreadyMovable = entity.role === "MOVABLE" || entity.role === "CLUTTER";
    if (!alreadyPresent || !alreadyMovable) marked += 1;

    return {
      ...entity,
      role: "MOVABLE" as const,
      attributes: {
        ...(entity.attributes ?? {}),
        present: true,
      },
    };
  });

  return {
    state: { ...state, entities },
    marked,
  };
}
