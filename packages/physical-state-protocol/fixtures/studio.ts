import type { PhysicalEntity, PhysicalState } from "../src/types.js";

export const demoReady: PhysicalState = {
  schemaVersion: "0.1",
  spaceId: "studio",
  capturedAt: "2026-09-06T09:00:00.000Z",
  entities: [
    { key: "desk.main", category: "desk", confidence: 0.99, attributes: { clear: true } },
    { key: "chair.main", category: "chair", confidence: 0.97, relations: [{ type: "BEHIND", target: "desk.main" }] },
    { key: "headphone-stand.main", category: "headphone-stand", confidence: 0.96, relations: [{ type: "ON", target: "desk.main" }] },
    { key: "headphones.main", category: "headphones", confidence: 0.95, relations: [{ type: "ON", target: "headphone-stand.main" }] },
    { key: "cabinet.main", category: "cabinet", confidence: 0.98 },
    { key: "backpack.black", category: "backpack", confidence: 0.96, relations: [{ type: "NEAR", target: "cabinet.main" }] },
    { key: "tripod.camera", category: "tripod", confidence: 0.95, relations: [{ type: "NEAR", target: "cabinet.main" }] },
    { key: "lamp.left", category: "lamp", confidence: 0.97, attributes: { powered: true } },
  ],
};

export const messy: PhysicalState = {
  schemaVersion: "0.1",
  spaceId: "studio",
  capturedAt: "2026-09-06T09:10:00.000Z",
  entities: [
    { key: "desk.main", category: "desk", confidence: 0.99, attributes: { clear: false } },
    { key: "chair.main", category: "chair", confidence: 0.96, relations: [{ type: "LEFT_OF", target: "desk.main" }] },
    { key: "headphone-stand.main", category: "headphone-stand", confidence: 0.96, relations: [{ type: "ON", target: "desk.main" }] },
    { key: "headphones.main", category: "headphones", confidence: 0.94, relations: [{ type: "ON", target: "desk.main" }] },
    { key: "cabinet.main", category: "cabinet", confidence: 0.98 },
    { key: "backpack.black", category: "backpack", confidence: 0.94, relations: [{ type: "LEFT_OF", target: "desk.main" }] },
    { key: "lamp.left", category: "lamp", confidence: 0.96, attributes: { powered: false } },
  ],
};

export const partial: PhysicalState = {
  schemaVersion: "0.1",
  spaceId: "studio",
  capturedAt: "2026-09-06T09:15:00.000Z",
  entities: [
    { key: "desk.main", category: "desk", confidence: 0.99, attributes: { clear: true } },
    { key: "chair.main", category: "chair", confidence: 0.97, relations: [{ type: "BEHIND", target: "desk.main" }] },
    { key: "headphone-stand.main", category: "headphone-stand", confidence: 0.96, relations: [{ type: "ON", target: "desk.main" }] },
    { key: "headphones.main", category: "headphones", confidence: 0.95, relations: [{ type: "ON", target: "headphone-stand.main" }] },
    { key: "cabinet.main", category: "cabinet", confidence: 0.98 },
    { key: "backpack.black", category: "backpack", confidence: 0.95, relations: [{ type: "LEFT_OF", target: "desk.main" }] },
    { key: "lamp.left", category: "lamp", confidence: 0.96, attributes: { powered: false } },
  ],
};

export const restored: PhysicalState = {
  ...demoReady,
  capturedAt: "2026-09-06T09:20:00.000Z",
  entities: demoReady.entities.map((entity) => {
    const cloned: PhysicalEntity = { key: entity.key, category: entity.category, confidence: entity.confidence };
    if (entity.attributes) cloned.attributes = { ...entity.attributes };
    if (entity.relations) cloned.relations = entity.relations.map((relation) => ({ ...relation }));
    return cloned;
  }),
};
