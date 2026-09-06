# Nova Perception Contract — Phase 2 Target

This file is the knowledge contract for the next build phase.

## Pipeline

```text
controlled image/snapshot
→ Amazon Nova 2 Lite
→ candidate PSP JSON
→ schema validation
→ normalization
→ deterministic Phase 1 engine
```

## Boundary

Nova may **observe** and **describe candidate state**. Nova may not:

- directly compute the canonical checkpoint diff;
- decide that a restore session is complete;
- overwrite deterministic match/progress logic;
- invent entities to satisfy expected fixtures.

## Required Phase 2 work

- Bedrock/Nova adapter;
- strict observation prompt;
- image → PSP parser;
- invalid JSON/schema handling;
- confidence and `UNKNOWN` handling;
- controlled image fixture evaluation harness;
- comparison of predicted PSP against known fixture truth.

## Phase 2 gate

A controlled studio image must produce a valid normalized PSP document whose entities, relations, visible attributes, and confidence behavior feed the deterministic core without manually editing the model output.
