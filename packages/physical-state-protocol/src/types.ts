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

export const ENTITY_ROLES = [
  "ANCHOR",
  "SURFACE",
  "MOVABLE",
  "CLUTTER",
  "DECOR",
] as const;

export const ENTITY_IMPORTANCE_LEVELS = [
  "critical",
  "normal",
  "low",
] as const;

export const ZONE_KINDS = [
  "FLOOR",
  "DESK",
  "TABLE",
  "BED",
  "SOFA",
  "SHELF",
  "COUNTER",
  "GENERAL",
] as const;

export const ZONE_CLUTTER_LEVELS = [
  "clear",
  "light",
  "cluttered",
] as const;

export const OBSERVATION_SOURCES = [
  "nova",
  "exact-image",
  "controlled",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];
export type EntityRole = (typeof ENTITY_ROLES)[number];
export type EntityImportance = (typeof ENTITY_IMPORTANCE_LEVELS)[number];
export type ZoneKind = (typeof ZONE_KINDS)[number];
export type ZoneClutterLevel = (typeof ZONE_CLUTTER_LEVELS)[number];
export type ObservationSource = (typeof OBSERVATION_SOURCES)[number];
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

  /**
   * Optional hardening metadata. These fields are intentionally optional so every
   * existing PSP 0.1 checkpoint remains valid without migration.
   */
  role?: EntityRole;
  zone?: string;
  importance?: EntityImportance;
}

export interface PhysicalZoneState {
  clear?: boolean;
  occupied?: boolean;
  clutterLevel?: ZoneClutterLevel;
}

export interface PhysicalZone {
  key: string;
  kind: ZoneKind;
  confidence: number;
  state?: PhysicalZoneState;
}

export interface ObservationEvidence {
  /** Fraction of checkpoint-relevant state confidently observed, from 0 to 1. */
  coverage: number;
  /** Overall capture/perception quality for this observation, from 0 to 1. */
  quality: number;
  source: ObservationSource;
  /** Optional semantic view identifier for future multi-view checkpoint matching. */
  viewId?: string;
}

export interface PhysicalState {
  schemaVersion: typeof PSP_SCHEMA_VERSION;
  spaceId: string;
  capturedAt: string;
  entities: PhysicalEntity[];

  /**
   * Optional H1 hardening fields. Existing callers can continue producing the original
   * PSP shape; later hardening passes can progressively populate these fields.
   */
  zones?: PhysicalZone[];
  evidence?: ObservationEvidence;
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
