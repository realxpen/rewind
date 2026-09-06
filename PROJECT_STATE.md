# REWIND — Project State

_Last updated: 2026-09-06_

## Current phase

**Phase 1 — Physical State Protocol + Deterministic Diff Engine: COMPLETE**

Primary track: **Ring**  
Additional target: **Alexa+** after the core restore loop works.  
Mini-challenges: **AWS Builder + Open Source**.

## Locked product

**REWIND — Ctrl+Z for reality.**

Core MVP loop: **SAVE → DIFF → REWIND → VERIFY**

Architecture rule: **AI interprets state. Deterministic code compares state.**

## Phase 0 — Compliance + Accounts

- [x] Product concept and MVP scope locked.
- [x] Public GitHub repository and MIT license.
- [x] Devpost registration completed and REWIND draft created.
- [x] Least-privilege `rewind-dev` IAM identity verified.
- [x] Amazon Bedrock / Nova 2 Lite inference verified with `REWIND DEV READY`.
- [x] Ring Developer Console and Developers Playground accessible.
- [x] Playground OAuth generated and API Explorer returned synthetic device data.

Phase 0 gate: **PASS**.

## Phase 1 — Core State Engine

- [x] PSP v0.1 TypeScript types and JSON Schema.
- [x] state validator/parser and canonical normalizer.
- [x] semantic relation vocabulary.
- [x] deterministic `compareStates()`.
- [x] `ADDED`, `REMOVED`, `MOVED`, `ATTRIBUTE_CHANGED`, `UNCHANGED`, `UNKNOWN`.
- [x] deterministic `calculateMatch()`.
- [x] restoration planner and restore progress verification.
- [x] restore-session state vocabulary.
- [x] demo-ready, messy, partial, restored fixtures.
- [x] low-confidence → `UNKNOWN` behavior.
- [x] deterministic tests and PSP documentation.

### Phase 1 gate

`compareStates(demoReady, messy)` returns exactly:

1. `chair.main` → `MOVED`
2. `headphones.main` → `MOVED`
3. `backpack.black` → `MOVED`
4. `tripod.camera` → `REMOVED`
5. `desk.main` → `ATTRIBUTE_CHANGED`
6. `lamp.left` → `ATTRIBUTE_CHANGED`

Additional coverage proves `ADDED`, `UNKNOWN`, intermediate progress, and a final `100%` restored state.

Local gate output:

```text
PASS diff-engine: six demo changes + ADDED + UNKNOWN + 100% restored
PASS restore-engine: plan generation + partial progress + 100% verification
```

Phase 1 gate: **PASS**.

## Next phase

**Phase 2 — Nova Perception Contract**

```text
controlled image/snapshot
→ Amazon Nova 2 Lite
→ candidate PSP JSON
→ PSP validation
→ normalization
→ deterministic comparison against fixture truth
```

Next implementation: Nova observation prompt/contract, Bedrock Converse adapter, strict structured response parser, image → PSP service, fixture-image evaluation, and confidence/error handling.

### Phase 2 gate

A controlled studio image must produce a valid normalized PSP document whose known entities, relations, attributes, and confidence behavior can feed the deterministic Phase 1 engine without manually editing model output.

## MVP completion gate

Create space → Connect Ring → Observe → Save checkpoint → Change environment → Observe again → Diff → Start Rewind → Guide action → Verify → Continue → **100% RESTORED**.
