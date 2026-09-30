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
  "dynamic_subject",
]);

const DYNAMIC_SUBJECT_CATEGORIES = new Set(["bird", "animal", "pet"]);
export const DYNAMIC_CENSUS_KEY = "rewind.dynamic-census";

function identityDescription(attributes: Record<string, unknown> | undefined): string {
  if (!attributes) return "";
  const cues = Object.entries(attributes)
    .filter(([key, value]) => IDENTITY_ATTRIBUTES.has(key.toLowerCase()) && value !== null && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key}=${String(value)}`);
  return cues.length ? ` Saved visible identity cues: ${cues.join(", ")}.` : "";
}

export function isDynamicSubjectEntity(entity: { category: string; attributes?: Record<string, unknown> }): boolean {
  return entity.attributes?.dynamic_subject === true || DYNAMIC_SUBJECT_CATEGORIES.has(entity.category.toLowerCase());
}

export function isDynamicCensusEntity(entity: { key?: string; category: string; attributes?: Record<string, unknown> }): boolean {
  return entity.key === DYNAMIC_CENSUS_KEY
    || entity.category.trim().toLowerCase() === "dynamic-census"
    || entity.attributes?.dynamic_census === true;
}

function visibleDynamicSubjects(state: PhysicalState) {
  return state.entities.filter(entity =>
    isDynamicSubjectEntity(entity)
    && entity.attributes?.present !== false
    && entity.confidence >= 0.85,
  );
}

function attachDynamicCensusEvidence(
  state: PhysicalState,
  count: number,
  confidence: number,
): PhysicalState {
  const entities = state.entities.filter(entity => !isDynamicCensusEntity(entity));
  entities.push({
    key: DYNAMIC_CENSUS_KEY,
    category: "dynamic-census",
    confidence,
    attributes: {
      present: true,
      dynamic_census: true,
      dynamic_count: count,
    },
  });
  return { ...state, entities };
}

function dynamicIdentityDescription(entity: { category: string; attributes?: Record<string, unknown> }): string {
  if (!isDynamicSubjectEntity(entity)) return "";
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

  const trackable = state.entities.filter(entity => !isDynamicCensusEntity(entity));
  if (!trackable.length) return undefined;

  return trackable.map(entity => {
    const hint: TrackedEntityHint = {
      key: entity.key,
      category: entity.category,
      description: [
        `This is checkpoint identity ${entity.key}. Match the corresponding visible ${entity.category} to this exact key; never replace, split, or rename it.`,
        identityDescription(entity.attributes),
        savedLocationDescription(state, entity.key),
        dynamicIdentityDescription(entity),
      ].filter(Boolean).join(""),
    };

    if (entity.attributes && Object.keys(entity.attributes).length > 0) {
      const observable = Object.fromEntries(
        Object.keys(entity.attributes)
          .filter(attribute => !IDENTITY_ATTRIBUTES.has(attribute.toLowerCase()))
          .map(attribute => [
            attribute,
            attribute.toLowerCase() === "present"
              ? isDynamicSubjectEntity(entity)
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

function normalizedIdentityValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalized || undefined;
}

function dynamicIdentityConflict(
  savedAttributes: Record<string, unknown> | undefined,
  currentAttributes: Record<string, unknown> | undefined,
): boolean {
  const savedSpecies = normalizedIdentityValue(savedAttributes?.species);
  const currentSpecies = normalizedIdentityValue(currentAttributes?.species);
  if (savedSpecies && currentSpecies && savedSpecies !== currentSpecies) return true;

  const savedColor = normalizedIdentityValue(savedAttributes?.color ?? savedAttributes?.colour);
  const currentColor = normalizedIdentityValue(currentAttributes?.color ?? currentAttributes?.colour);
  if (!savedColor || !currentColor || savedColor === currentColor) return false;

  const generic = new Set(["bird", "animal", "pet", "small", "large", "medium"]);
  const tokens = (value: unknown) => new Set(
    (normalizedIdentityValue(value)?.split(" ") ?? []).filter(token => !generic.has(token)),
  );
  const savedAppearance = tokens(savedAttributes?.appearance);
  const currentAppearance = tokens(currentAttributes?.appearance);
  if (!savedAppearance.size || !currentAppearance.size) return false;

  return ![...savedAppearance].some(token => currentAppearance.has(token));
}

/**
 * Dynamic subjects cannot be assigned continuity from location/category alone.
 * When the vision layer reuses a tracked key for a visibly conflicting subject,
 * split that observation into an explicit saved-subject absence plus a new arrival.
 */
export function reconcileDynamicSubjectIdentity(
  referenceState: PhysicalState,
  currentState: PhysicalState,
): { state: PhysicalState; replacements: number } {
  const referenceByKey = new Map(referenceState.entities.map(entity => [entity.key, entity]));
  const occupiedKeys = new Set(currentState.entities.map(entity => entity.key));
  let replacements = 0;
  const entities = [];

  for (const current of currentState.entities) {
    if (isDynamicCensusEntity(current)) {
      entities.push(current);
      continue;
    }
    const saved = referenceByKey.get(current.key);
    if (
      !saved
      || !isDynamicSubjectEntity(saved)
      || !isDynamicSubjectEntity(current)
      || !dynamicIdentityConflict(saved.attributes, current.attributes)
    ) {
      entities.push(current);
      continue;
    }

    let suffix = 1;
    let replacementKey = `${current.key}.new`;
    while (occupiedKeys.has(replacementKey)) {
      suffix += 1;
      replacementKey = `${current.key}.new${suffix}`;
    }
    occupiedKeys.add(replacementKey);

    entities.push({
      ...saved,
      confidence: Math.min(saved.confidence, current.confidence),
      attributes: {
        ...(saved.attributes ?? {}),
        present: false,
        dynamic_subject: true,
      },
      relations: [],
    });
    entities.push({
      ...current,
      key: replacementKey,
      attributes: {
        ...(current.attributes ?? {}),
        present: true,
        dynamic_subject: true,
      },
    });
    replacements += 1;
  }

  return replacements
    ? { state: { ...currentState, entities }, replacements }
    : { state: currentState, replacements: 0 };
}

function dynamicCensusIdentityScore(
  left: { category: string; attributes?: Record<string, unknown>; relations?: Array<{ type: string; target?: string }> },
  right: { category: string; attributes?: Record<string, unknown>; relations?: Array<{ type: string; target?: string }> },
): number {
  const speciesLeft = normalizedIdentityValue(left.attributes?.species);
  const speciesRight = normalizedIdentityValue(right.attributes?.species);
  if (speciesLeft && speciesRight) return speciesLeft === speciesRight ? 4 : -1;

  const colorLeft = normalizedIdentityValue(left.attributes?.color ?? left.attributes?.colour);
  const colorRight = normalizedIdentityValue(right.attributes?.color ?? right.attributes?.colour);
  if (colorLeft && colorRight && colorLeft !== colorRight) return -1;

  const appearanceLeft = normalizedIdentityValue(left.attributes?.appearance);
  const appearanceRight = normalizedIdentityValue(right.attributes?.appearance);
  if (appearanceLeft && appearanceRight) {
    const leftTokens = new Set(appearanceLeft.split(" "));
    const overlap = appearanceRight.split(" ").filter(token => leftTokens.has(token)).length;
    if (overlap >= 2) return 3;
  }

  const leftRelations = new Set((left.relations ?? []).map(relation => `${relation.type}:${relation.target ?? ""}`));
  const sharedRelation = (right.relations ?? []).some(relation => leftRelations.has(`${relation.type}:${relation.target ?? ""}`));
  if (sharedRelation) return 2;

  if (colorLeft && colorRight && colorLeft === colorRight) return 1;
  return 0;
}

/**
 * Merge the independent open live-scene census into the checkpoint-tracked observation.
 *
 * Identity and cardinality are deliberately separated:
 * - tracked Nova evidence owns identity continuity;
 * - open census owns the visible population backstop;
 * - deterministic comparison later reconciles the population delta so a counting/identity
 *   disagreement can never silently become 100% MATCH.
 */
export function mergeDynamicSubjectCensus(
  trackedState: PhysicalState,
  censusState: PhysicalState,
): { state: PhysicalState; added: number } {
  const accounted = trackedState.entities.filter(entity => isDynamicSubjectEntity(entity));
  const trackedVisible = visibleDynamicSubjects(trackedState);
  const census = visibleDynamicSubjects(censusState);

  const surplus = Math.max(0, census.length - accounted.length);
  const occupied = new Set(trackedState.entities.map(entity => entity.key));
  const ranked = census
    .map(entity => ({
      entity,
      bestScore: accounted.reduce(
        (best, candidate) => Math.max(best, dynamicCensusIdentityScore(entity, candidate)),
        -1,
      ),
    }))
    .sort((left, right) => left.bestScore - right.bestScore || right.entity.confidence - left.entity.confidence);

  const additions = ranked.slice(0, surplus).map(({ entity }, index) => {
    const fallback = `dynamic.current.${index + 1}`;
    const base = entity.key.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
    let key = base;
    let suffix = 1;
    while (occupied.has(key)) {
      suffix += 1;
      key = `${base}.current${suffix}`;
    }
    occupied.add(key);
    return {
      ...entity,
      key,
      attributes: {
        ...(entity.attributes ?? {}),
        present: true,
        dynamic_subject: true,
      },
    };
  });

  const merged = {
    ...trackedState,
    entities: [
      ...trackedState.entities.filter(entity => !isDynamicCensusEntity(entity)),
      ...additions,
    ],
  };

  // If checkpoint-guided tracking and the independent census disagree about how many
  // visible dynamic subjects exist, lower the census confidence. The deterministic layer
  // will then expose UNKNOWN rather than ever declaring a false 100% match.
  const censusConfidence = trackedVisible.length === census.length ? 0.95 : 0.55;
  return {
    state: attachDynamicCensusEvidence(merged, census.length, censusConfidence),
    added: additions.length,
  };
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
