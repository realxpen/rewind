# Architecture

## Core principle

**AI interprets state. Deterministic code compares state.**

```text
Ring observation
      ↓
Amazon Nova 2 Lite
      ↓
Candidate PSP
      ↓
validatePhysicalState()
      ↓
normalizeState()
      ↓
Canonical PhysicalState
      ↓
compareStates(checkpoint, current)
      ↓
PhysicalDiff[]
      ↓
buildRestorePlan()
      ↓
Human action
      ↓
Re-observe + recompute
      ↓
updateRestoreProgress()
      ↓
100% RESTORED
```

Phase 1 intentionally contains no Ring or model dependency. It establishes the deterministic contract that later perception layers must satisfy.

## Package boundaries

### `packages/physical-state-protocol`

Owns PSP v0.1 types, machine-readable schema, validation, normalization, and controlled TypeScript fixtures.

### `packages/diff-engine`

Owns semantic comparison and match scoring. It must remain deterministic and model-independent.

### `packages/restore-engine`

Owns human-readable restoration actions, restore-session state vocabulary, and verification progress.

## Current fixture contract

The `studio` fixture family is the canonical Phase 1 evaluation scene. It contains 5–8 stable semantic entities and reproduces REWIND's six-change demo scenario.

## Next boundary

Phase 2 adds the perception adapter:

```text
image/snapshot → Nova → candidate PSP → validator
```

Nova is not permitted to directly declare a checkpoint restored. Only the deterministic diff/progress path can do that.
