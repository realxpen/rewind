import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  VisionObservation,
  VisionObservationRequest,
  VisionTokenUsage,
} from "./contracts.js";
import { parseNovaPhysicalState } from "./parse.js";
import {
  buildNovaConverseInput,
  DEFAULT_NOVA_MODEL_ID,
} from "./request.js";

export interface BedrockNovaVisionOptions {
  region: string;
  modelId?: string;
  client?: BedrockRuntimeClient;
}

export class BedrockNovaVisionClient {
  readonly modelId: string;
  private readonly client: BedrockRuntimeClient;

  constructor(options: BedrockNovaVisionOptions) {
    this.modelId = options.modelId ?? DEFAULT_NOVA_MODEL_ID;
    this.client = options.client ?? new BedrockRuntimeClient({ region: options.region });
  }

  async observe(request: VisionObservationRequest): Promise<VisionObservation> {
    const input = buildNovaConverseInput(request, this.modelId);
    const startedAt = Date.now();
    const response = await this.client.send(new ConverseCommand(input));
    const latencyMs = Date.now() - startedAt;

    const content = response.output?.message?.content ?? [];
    const textBlock = content.find((block) => "text" in block && typeof block.text === "string");

    if (!textBlock || !("text" in textBlock) || typeof textBlock.text !== "string") {
      throw new Error("Amazon Nova returned no text content.");
    }

    const state = parseNovaPhysicalState(textBlock.text, request.context);

    const usage: VisionTokenUsage = {};
    if (typeof response.usage?.inputTokens === "number") usage.inputTokens = response.usage.inputTokens;
    if (typeof response.usage?.outputTokens === "number") usage.outputTokens = response.usage.outputTokens;
    if (typeof response.usage?.totalTokens === "number") usage.totalTokens = response.usage.totalTokens;

    const result: VisionObservation = {
      state,
      rawText: textBlock.text,
      modelId: this.modelId,
      latencyMs,
    };
    if (Object.keys(usage).length > 0) result.usage = usage;
    return result;
  }
}
