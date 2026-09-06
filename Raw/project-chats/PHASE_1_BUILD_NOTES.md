# Phase 1 — Build Notes

Source: REWIND project conversations and repository work through 2026-09-06.

## Goal

Build the deterministic physical-state core before adding perception or Ring runtime dependencies.

## Implemented

- Physical State Protocol v0.1 types and JSON Schema.
- Physical-state validation/parsing.
- Canonical normalization.
- Semantic relation vocabulary.
- Deterministic `compareStates()`.
- Diff classes: `ADDED`, `REMOVED`, `MOVED`, `ATTRIBUTE_CHANGED`, `UNCHANGED`, `UNKNOWN`.
- Deterministic `calculateMatch()`.
- Restoration planner.
- Restore progress verification.
- Controlled fixtures: demo-ready, messy, partial, restored.
- GitHub Actions test gate.

## Canonical demo diff

`compareStates(demoReady, messy)` returns six deliberate changes:

1. `chair.main` → `MOVED`
2. `headphones.main` → `MOVED`
3. `backpack.black` → `MOVED`
4. `tripod.camera` → `REMOVED`
5. `desk.main` → `ATTRIBUTE_CHANGED`
6. `lamp.left` → `ATTRIBUTE_CHANGED`

Additional coverage proves added objects, low-confidence `UNKNOWN`, partial restoration, and 100% restored completion.

## Gate result

```text
PASS diff-engine: six demo changes + ADDED + UNKNOWN + 100% restored
PASS restore-engine: plan generation + partial progress + 100% verification
```

GitHub CI passed on the Phase 1 implementation commit.
