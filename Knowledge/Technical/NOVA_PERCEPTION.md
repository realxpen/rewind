# Nova Perception Contract — Phase 2

Status: **IMPLEMENTED CONTRACT / LIVE VISION GATE PENDING**

## Pipeline

```text
controlled image/snapshot
→ Bedrock Converse
→ Amazon Nova 2 Lite
→ candidate PSP JSON
→ Zod boundary validation
→ PSP validation
→ normalization
→ deterministic Phase 1 engine
```

## Locked boundary

Nova may **observe** and **describe candidate state**. Nova may not:

- compute the canonical checkpoint diff;
- decide that a restore session is complete;
- overwrite deterministic match/progress logic;
- invent entities to satisfy expected fixtures.

## Implementation

`packages/vision` now contains:

- `prompt.ts` — observation-only prompt + tracked-vocabulary contract;
- `request.ts` — multimodal Bedrock Converse request construction;
- `bedrock.ts` — Nova runtime adapter;
- `schema.ts` — Zod candidate-state boundary;
- `extract-json.ts` — strict JSON-object extraction;
- `parse.ts` — Zod + PSP validation + normalization;
- `evaluate.ts` — entity/relation/attribute recall metrics;
- contract tests;
- a live controlled-fixture runner that scores Nova output against canonical PSP truth.

## Confidence decision

For a tracked entity whose presence/identity is uncertain, request the known key/category with confidence below `0.60` and omit unsupported relations/attributes. This preserves uncertainty so the deterministic engine can return `UNKNOWN` instead of a false `REMOVED`.

## Benchmark hygiene

Controlled fixture images must not contain semantic keys, category labels, expected relations, checkpoint names, or other answer text. The image must present only the physical scene. This prevents Nova from passing the benchmark by reading embedded ground truth instead of perceiving the scene.

`fixtures/studio/vision/generate.py` is the reproducible clean-scene generator. The canonical expected semantics remain in `packages/physical-state-protocol/fixtures/studio.ts`.

## Evaluation targets

Controlled MVP target:

- at least 90% expected tracked-object recognition;
- relation/attribute behavior measured explicitly;
- later changed-scene pipeline should recover at least 5 of 6 deliberate demo changes;
- no false `RESTORED` result.

The live runner exits non-zero when the 90% entity-recall target is missed. Relation and attribute recall are recorded as evidence and reviewed across the fixture set before Phase 2 closes.

## Current blocker

The code contract is tested in CI without AWS. Phase 2 itself remains open until real Nova 2 Lite multimodal invocations against the controlled fixture set return valid PSP repeatedly.

The ChatGPT AWS Core connector became unavailable again during the live invocation attempt. This is a tooling-access blocker, not evidence that Bedrock/Nova failed; the repo therefore deliberately does not claim a live vision pass yet.

Never mark this phase complete from mocked model output alone.
