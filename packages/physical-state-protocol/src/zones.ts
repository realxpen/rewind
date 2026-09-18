import type {
  PhysicalEntity,
  PhysicalState,
  PhysicalZone,
} from "./types.js";

/**
 * Return zones in deterministic key order. This is intentionally side-effect free so
 * later checkpoint/view logic can reuse it without changing current comparison behavior.
 */
export function sortZones(zones: PhysicalZone[] | undefined): PhysicalZone[] | undefined {
  if (!zones) return undefined;
  return [...zones].sort((left, right) => left.key.localeCompare(right.key));
}

export function findZone(state: PhysicalState, zoneKey: string): PhysicalZone | undefined {
  return state.zones?.find((zone) => zone.key === zoneKey);
}

export function entitiesInZone(state: PhysicalState, zoneKey: string): PhysicalEntity[] {
  return state.entities.filter((entity) => entity.zone === zoneKey);
}

export function groupEntitiesByZone(state: PhysicalState): Map<string, PhysicalEntity[]> {
  const grouped = new Map<string, PhysicalEntity[]>();
  for (const entity of state.entities) {
    if (!entity.zone) continue;
    const rows = grouped.get(entity.zone) ?? [];
    rows.push(entity);
    grouped.set(entity.zone, rows);
  }
  return grouped;
}
