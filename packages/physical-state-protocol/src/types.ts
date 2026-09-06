export const PSP_SCHEMA_VERSION = "0.1" as const;

export const RELATION_TYPES = [
  "ON",
  "UNDER",
  "INSIDE",
  "LEFT_OF",
  "RIGHT_OF",
  "BEHIND",
  "IN_FRONT_OF",
  "NEAR",
  "ATTACHED_TO",
  "OPEN",
  "CLOSED",
  "ON_STATE",
  "OFF_STATE",
  "CLEAR",
  "OCCUPIED",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];
export type AttributeValue = string | number | boolean | null;

export interface PhysicalRelation {
  type: RelationType;
  target?: string;
  confidence?: number;
}

export interface PhysicalEntity {
  key: string;
  category: string;
  confidence: number;
  attributes?: Record<string, AttributeValue>;
  relations?: PhysicalRelation[];
}

export interface PhysicalState {
  schemaVersion: typeof PSP_SCHEMA_VERSION;
  spaceId: string;
  capturedAt: string;
  entities: PhysicalEntity[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  issues: ValidationIssue[];
}
