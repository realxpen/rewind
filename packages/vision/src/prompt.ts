import {
  PSP_SCHEMA_VERSION,
  RELATION_TYPES,
} from "../../physical-state-protocol/src/index.js";
import type { ObservationContext } from "./contracts.js";

export const NOVA_PERCEPTION_SYSTEM_PROMPT = `You are REWIND's visual perception layer.
Your job is to convert one physical-space image into a candidate Physical State Protocol (PSP) document.
You observe only. You do NOT compare checkpoints, compute diffs, plan restoration, or declare a room restored.

Hard rules:
- Report only facts visually supported by the supplied image.
- Never infer invisible objects.
- Never invent object identity to make the expected answer look complete.
- Prefer semantic relations over pixel coordinates.
- Return exactly one COMPLETE JSON object and no Markdown, prose, or code fences.
- Keep the JSON concise. Do not spend output on decorative detail that is not useful for restoration.
- Attribute values must be primitive JSON values: string, number, boolean, or null.
- Every entity key in the returned document MUST be unique.
- When more than one visible object shares a category, distinguish each untracked object with a stable semantic role/location key such as "lamp.bedside", "lamp.desk", "plant.window", or "plant.desk". Never reuse the same key for two objects.
- Prefer role/location-based keys over arbitrary numbering when the image supports that distinction. If no semantic distinction is visible, use deterministic suffixes such as ".1", ".2" rather than duplicate keys.
- For every supplied tracked entity, actively check whether it is visible in the image.
- A supplied tracked key is an identity contract. If the corresponding visible object can be matched, use that exact key. Never replace it with a more descriptive alias.
- Never split one tracked object into multiple entities. Never merge two supplied tracked keys into one entity.
- Do not create an untracked replacement for a supplied tracked entity merely because another key feels more descriptive.
- If a tracked entity is clearly visible, include it using the supplied key/category and report all supplied observable attributes that can be visually determined.
- If a tracked entity is clearly absent from the fixed-view scene, omit it.
- If presence or identity is genuinely uncertain because of ambiguity, occlusion, or poor visibility, include the expected key/category with confidence below 0.60 and omit uncertain relations/attributes.
- Never use low confidence merely because a visible object's state differs from an expected checkpoint. You are observing the current image only.
- When tracked vocabulary is supplied, relations on tracked entities should target supplied tracked keys whenever possible. Do not create a new alias solely to serve as a relation target.
- For untracked extra objects, only add an entity when it is visually clear, genuinely additional, and useful to the physical-state task.
- If a tracked category already accounts for all clearly visible instances of that category, do not create another untracked entity of that category.
- If no tracked vocabulary is supplied, return at most 20 entities. Prioritize movable/restorable objects and stable room anchors needed for relations.
- If tracked vocabulary is supplied, prioritize those tracked entities and add no more than 3 clearly useful untracked extras.
- Confidence must be between 0 and 1.
- Never identify or name people.`;

function trackedVocabulary(context: ObservationContext): string {
  if (!context.trackedEntities || context.trackedEntities.length === 0) {
    return "No tracked entity vocabulary was supplied. Use conservative, unique semantic keys. Return at most 20 entities total, prioritizing movable/restorable objects and stable anchors. For repeated categories, use stable role/location qualifiers so every entity key remains unique.";
  }

  return context.trackedEntities
    .map((entity) => {
      const detail = entity.description ? ` — ${entity.description}` : "";

      const observableAttributes = entity.observableAttributes
        ? Object.entries(entity.observableAttributes)
          .map(([key, description]) => `    attribute "${key}": ${description}`)
          .join("\n")
        : "";

      return [
        `- ${entity.key} (${entity.category})${detail}`,
        observableAttributes,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

export function buildNovaObservationPrompt(context: ObservationContext): string {
  const trackedMode = Boolean(context.trackedEntities?.length);
  return `Observe the supplied image and return a PSP ${PSP_SCHEMA_VERSION} JSON object.

Use these exact top-level values:
- schemaVersion: "${PSP_SCHEMA_VERSION}"
- spaceId: "${context.spaceId}"
- capturedAt: "${context.capturedAt}"

Allowed relation types:
${RELATION_TYPES.join(", ")}

Tracked entity vocabulary:
${trackedVocabulary(context)}

Observation mode:
- ${trackedMode ? "TRACKED COMPARISON. Identity stability is more important than inventing additional detail." : "OPEN OBSERVATION. Create a conservative semantic inventory."}

Entity identity rules:
- Every entity key MUST be unique within this JSON document.
- Never output the same key twice, even for two objects of the same category.
- Preserve exact supplied tracked keys when a tracked object can be matched.
- Never rename a supplied tracked key to a more descriptive key.
- Never split one supplied tracked entity into several role/location variants.
- Never emit an untracked alias for a tracked entity. Example: if "candle" is tracked and the visible candle matches it, do not also emit "candle.bedside".
- For untracked repeated objects, create distinct role/location-based keys that are likely to remain stable across later photos. Examples: "lamp.bedside" versus "lamp.desk", "plant.window" versus "plant.desk".
- Before returning JSON, scan the complete entities array once for duplicate keys and tracked-category aliases. Rename only genuine untracked duplicates; remove accidental aliases of tracked objects.

Output-size rules:
- Return one complete, parseable JSON object; never stop mid-object or mid-array.
- Keep each entity concise: key, category, confidence, only useful primitive attributes, and only useful relations.
- With no tracked vocabulary, include at most 20 entities total.
- With tracked vocabulary, prioritize tracked entities and include at most 3 genuinely additional untracked entities.
- Prefer omission of minor decorative objects over risking an incomplete JSON response.

Observable attribute rules:
- For tracked entities that define observable attributes, explicitly inspect every listed attribute.
- Use the exact supplied attribute key.
- Emit a boolean/string/number/null value only when the value is visually supported.
- Do not invent alternate attribute names.
- If an attribute cannot be visually determined, omit that attribute rather than guessing.
- Do not emit extra descriptive attributes on tracked entities unless they are necessary to represent current physical state.

Relation rules for tracked comparison:
- Preserve relation direction from the observed subject toward the target object.
- Prefer relations whose targets are supplied tracked keys.
- Do not invent a new relation target alias for an existing tracked entity.
- If a spatial relation is not visually clear, omit it instead of guessing.
- Do not report a different relation merely to fill the schema.

Required JSON shape:
{
  "schemaVersion": "${PSP_SCHEMA_VERSION}",
  "spaceId": "${context.spaceId}",
  "capturedAt": "${context.capturedAt}",
  "entities": [
    {
      "key": "semantic.key",
      "category": "category",
      "confidence": 0.0,
      "attributes": { "optionalPrimitiveFact": true },
      "relations": [
        {
          "type": "NEAR",
          "target": "other.semantic.key",
          "confidence": 0.0
        }
      ]
    }
  ]
}

Observation guidance:
1. Inspect every supplied tracked entity before composing the result.
2. Preserve supplied tracked keys when the corresponding object can be matched.
3. For every visible tracked entity with supplied observable attributes, explicitly evaluate those attributes.
4. If a tracked object is clearly absent from the fixed-view image, omit it.
5. If a tracked object's presence or identity is uncertain, include it with confidence below 0.60 and omit uncertain relations/attributes.
6. Do not use an UNKNOWN relation type; uncertainty is represented by confidence.
7. Only describe visible state.
8. Relations are written on the subject entity. For example, if headphones are ON a desk, put {"type":"ON","target":"desk.main"} on headphones.main, never the reverse.
9. For ON, UNDER, INSIDE, BEHIND, LEFT_OF, RIGHT_OF, IN_FRONT_OF, NEAR, and ATTACHED_TO, always make the entity owning the relation the subject and target the referenced object.
10. Do not create inverse relations merely because two objects are visible near each other.
11. In tracked mode, do a second identity pass: every visible tracked object must use its supplied key and must not also appear under an alias.
12. Perform a final uniqueness check over all entity keys before responding.
13. Perform a final completeness check: the response must end as one valid JSON object with all braces and arrays closed.
14. Return JSON only.`;
}
