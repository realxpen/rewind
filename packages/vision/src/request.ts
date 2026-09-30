import type { ConverseCommandInput } from "@aws-sdk/client-bedrock-runtime";
import type { VisionObservationRequest } from "./contracts.js";
import {
  buildNovaObservationPrompt,
  NOVA_PERCEPTION_SYSTEM_PROMPT,
} from "./prompt.js";

export const DEFAULT_NOVA_MODEL_ID = "global.amazon.nova-2-lite-v1:0";

function dynamicPositionContract(request: VisionObservationRequest): string {
  if (request.context.preserveDynamicEntities !== true) return "";
  return `\n\nLIVE DYNAMIC POSITION CONTRACT:\n- For every clearly visible non-human dynamic subject, include numeric attributes frame_x and frame_y in addition to present=true and dynamic_subject=true.\n- frame_x and frame_y represent the approximate center of the visible subject in the CURRENT image, normalized from 0 to 100: frame_x=0 is the far left edge, frame_x=100 the far right edge, frame_y=0 the top edge, frame_y=100 the bottom edge.\n- Round frame_x and frame_y to the nearest 5. Values must remain between 0 and 100.\n- These coordinates are current observation state, NOT identity cues. For tracked dynamic subjects, estimate them fresh from the current image and never copy saved values.\n- If a subject is partially occluded but its visible body location is still clear, estimate the center of the visible subject. If location is genuinely uncertain, omit frame_x/frame_y rather than guessing.\n- Do not emit frame_x/frame_y for people or for static objects. REWIND uses these normalized values only to decide deterministic dynamic-subject movement in a fixed camera view.`;
}

export function buildNovaConverseInput(
  request: VisionObservationRequest,
  modelId = DEFAULT_NOVA_MODEL_ID,
): ConverseCommandInput {
  return {
    modelId,
    system: [{ text: NOVA_PERCEPTION_SYSTEM_PROMPT }],
    messages: [
      {
        role: "user",
        content: [
          {
            image: {
              format: request.format,
              source: { bytes: request.imageBytes },
            },
          },
          {
            text: `${buildNovaObservationPrompt(request.context)}${dynamicPositionContract(request)}`,
          },
        ],
      },
    ],
    inferenceConfig: {
      maxTokens: 4200,
      temperature: 0,
      topP: 0.1,
    },
  };
}
