import type { ConverseCommandInput } from "@aws-sdk/client-bedrock-runtime";
import type { VisionObservationRequest } from "./contracts.js";
import {
  buildNovaObservationPrompt,
  NOVA_PERCEPTION_SYSTEM_PROMPT,
} from "./prompt.js";

export const DEFAULT_NOVA_MODEL_ID = "global.amazon.nova-2-lite-v1:0";

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
            text: buildNovaObservationPrompt(request.context),
          },
        ],
      },
    ],
    inferenceConfig: {
      maxTokens: 2400,
      temperature: 0,
      topP: 0.1,
    },
  };
}
