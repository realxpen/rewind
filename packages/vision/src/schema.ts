import { z } from "zod";
import {
  PSP_SCHEMA_VERSION,
  RELATION_TYPES,
} from "../../physical-state-protocol/src/index.js";

export const relationCandidateSchema = z.object({
  type: z.enum(RELATION_TYPES),
  target: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
}).strict();

export const attributeValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const physicalEntityCandidateSchema = z.object({
  key: z.string().min(1),
  category: z.string().min(1),
  confidence: z.number().min(0).max(1),
  attributes: z.record(z.string(), attributeValueSchema).optional(),
  relations: z.array(relationCandidateSchema).optional(),
}).strict();

export const physicalStateCandidateSchema = z.object({
  schemaVersion: z.literal(PSP_SCHEMA_VERSION),
  spaceId: z.string().min(1),
  capturedAt: z.string().datetime(),
  entities: z.array(physicalEntityCandidateSchema).max(64),
}).strict();

export type PhysicalStateCandidate = z.infer<typeof physicalStateCandidateSchema>;
