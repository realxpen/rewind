import assert from "node:assert/strict";
import { demoReady } from "../../physical-state-protocol/fixtures/studio.js";
import { evaluateVisionState } from "../src/index.js";

const exact = evaluateVisionState(demoReady, demoReady);
assert.equal(exact.entityRecall, 100);
assert.equal(exact.trustedEntityRecall, 100);
assert.equal(exact.relationRecall, 100);
assert.equal(exact.attributeRecall, 100);
assert.deepEqual(exact.falsePositiveKeys, []);

const uncertain = structuredClone(demoReady);
const chair = uncertain.entities.find((entity) => entity.key === "chair.main");
if (!chair) throw new Error("fixture missing chair.main");
chair.confidence = 0.42;

const evaluated = evaluateVisionState(demoReady, uncertain);
assert.ok(evaluated.entityRecall < 100);
assert.equal(evaluated.falsePositiveKeys.length, 0);

console.log("PASS vision evaluator: entity/relation/attribute recall + confidence-aware scoring");
