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
- Return exactly one JSON object and no Markdown, prose, or code fences.
- Attribute values must be primitive JSON values: string, number, boolean, or null.
- If a tracked entity's presence or identity cannot be established confidently, keep its expected key/category but set confidence below 0.60 and omit uncertain relations/attributes. This lets deterministic code classify the result as UNKNOWN rather than falsely REMOVED.
- For untracked extra objects, only add an entity when it is visually clear and useful to the physical-state task.
- Confidence must be between 0 and 1.
- Never identify or name people.`;

function trackedVocabulary(context: ObservationContext): string {
  if (!context.trackedEntities || context.trackedEntities.length === 0) {
    return "No tracked entity vocabulary was supplied. Use conservative semantic keys.";
  }

  return context.trackedEntities
    .map((entity) => {
      const detail = entity.description ? ` — ${entity.description}` : "";
      return `- ${entity.key} (${entity.category})${detail}`;
    })
    .join("\n");
}

export function buildNovaObservationPrompt(context: ObservationContext): string {
  return `Observe the supplied image and return a PSP ${PSP_SCHEMA_VERSION} JSON object.

Use these exact top-level values:
- schemaVersion: "${PSP_SCHEMA_VERSION}"
- spaceId: "${context.spaceId}"
- capturedAt: "${context.capturedAt}"

Allowed relation types:
${RELATION_TYPES.join(", ")}

Tracked entity vocabulary:
${trackedVocabulary(context)}

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
1. Preserve supplied tracked keys when the corresponding object can be matched.
2. For a tracked object that is uncertain, include it with confidence below 0.60 and omit invented relations/attributes.
3. Do not use an UNKNOWN relation type; uncertainty is represented by confidence.
4. Only describe visible state.
5. Return JSON only.`;
}
