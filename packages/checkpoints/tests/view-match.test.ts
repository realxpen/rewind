import assert from "node:assert/strict";
import type { Checkpoint } from "../src/contracts.js";
import { findCheckpointViewByImageHash, selectBestCheckpointView } from "../src/view-match.js";

const checkpoint: Checkpoint = {
  id: "checkpoint-1",
  spaceId: "room",
  name: "Room Ready",
  observationId: "obs-primary",
  state: {
    schemaVersion: "0.1",
    spaceId: "room",
    capturedAt: "2026-09-18T10:00:00.000Z",
    entities: [
      { key: "sofa.main", category: "sofa", confidence: 0.98, role: "ANCHOR" },
      { key: "table.coffee", category: "table", confidence: 0.97, role: "SURFACE" },
    ],
  },
  stateHash: "primary-hash",
  sourceImageHash: "a".repeat(64),
  createdAt: "2026-09-18T10:00:00.000Z",
  views: [
    {
      id: "primary",
      observationId: "obs-primary",
      state: {
        schemaVersion: "0.1",
        spaceId: "room",
        capturedAt: "2026-09-18T10:00:00.000Z",
        entities: [
          { key: "sofa.main", category: "sofa", confidence: 0.98, role: "ANCHOR" },
          { key: "table.coffee", category: "table", confidence: 0.97, role: "SURFACE" },
        ],
      },
      stateHash: "primary-hash",
      sourceImageHash: "a".repeat(64),
      createdAt: "2026-09-18T10:00:00.000Z",
    },
    {
      id: "desk-view",
      observationId: "obs-desk",
      state: {
        schemaVersion: "0.1",
        spaceId: "room",
        capturedAt: "2026-09-18T10:01:00.000Z",
        entities: [
          { key: "desk.main", category: "desk", confidence: 0.99, role: "ANCHOR" },
          { key: "chair.desk", category: "chair", confidence: 0.96, role: "MOVABLE" },
          { key: "monitor.main", category: "monitor", confidence: 0.95, importance: "critical" },
        ],
      },
      stateHash: "desk-hash",
      sourceImageHash: "b".repeat(64),
      createdAt: "2026-09-18T10:01:00.000Z",
    },
  ],
};

const currentDesk = {
  schemaVersion: "0.1" as const,
  spaceId: "room",
  capturedAt: "2026-09-18T10:10:00.000Z",
  entities: [
    { key: "desk.main", category: "desk", confidence: 0.97 },
    { key: "chair.desk", category: "chair", confidence: 0.95 },
    { key: "cup.extra", category: "cup", confidence: 0.92 },
  ],
};

const selected = selectBestCheckpointView(checkpoint, currentDesk);
assert.equal(selected.view.id, "desk-view");
assert(selected.score > 0);
assert(selected.exactKeyOverlap >= 2);

assert.equal(findCheckpointViewByImageHash(checkpoint, "b".repeat(64))?.id, "desk-view");
assert.equal(findCheckpointViewByImageHash(checkpoint, "c".repeat(64)), undefined);

console.log("PASS checkpoint view matching: semantic overlap selects best stored view + hash lookup spans all views");
