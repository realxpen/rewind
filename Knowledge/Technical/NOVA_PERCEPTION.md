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
- a live controlled-fixture runner.

## Confidence decision

For a tracked entity whose presence/identity is uncertain, request the known key/category with confidence below `0.60` and omit unsupported relations/attributes. This preserves uncertainty so the deterministic engine can return `UNKNOWN` instead of a false `REMOVED`.

## Evaluation targets

Controlled MVP target:

- at least 90% expected tracked-object recognition;
- relation/attribute behavior measured explicitly;
- later changed-scene pipeline should recover at least 5 of 6 deliberate demo changes;
- no false `RESTORED` result.

## Current blocker

The code contract can be tested in CI without AWS. Phase 2 itself remains open until a real Nova 2 Lite multimodal invocation against controlled room imagery returns valid PSP repeatedly.

Never mark this phase complete from mocked model output alone.
