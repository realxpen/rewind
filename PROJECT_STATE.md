# REWIND — Project State

_Last updated: 2026-09-07_

## Current phase

**Phase 2 — Nova Vision: IN PROGRESS**

Primary track: **Ring**  
Additional target: **Alexa+** after the core restore loop works.  
Mini-challenges: **AWS Builder + Open Source**.

## Locked product

**REWIND — Ctrl+Z for reality.**

Core MVP loop: **SAVE → DIFF → REWIND → VERIFY**

Architecture rule: **AI interprets state. Deterministic code compares state.**

## Project knowledge operating system

- [x] `Raw/` installed for unvalidated evidence and project-chat notes.
- [x] `Knowledge/` installed across Product, Research, UX, Technical, Business, and Decisions.
- [x] `Archive/` installed with Superseded, Deprecated, Experiments, and Dead-Leaves.
- [x] `AGENTS.md` enforces source precedence and dead-leaf exclusion.

## Phase 0 — Compliance + Accounts

- [x] Product concept and MVP scope locked.
- [x] Public GitHub repository and MIT license.
- [x] Devpost registration completed and REWIND draft created.
- [x] Least-privilege `rewind-dev` IAM identity verified.
- [x] Amazon Bedrock / Nova 2 Lite text inference verified with `REWIND DEV READY`.
- [x] Ring Developer Console and Developers Playground accessible.
- [x] Playground OAuth generated and API Explorer returned synthetic device data.

Phase 0 gate: **PASS**.

## Phase 1 — Core State Engine

- [x] PSP v0.1 types, schema, validator, normalizer.
- [x] deterministic semantic diff engine.
- [x] `ADDED`, `REMOVED`, `MOVED`, `ATTRIBUTE_CHANGED`, `UNCHANGED`, `UNKNOWN`.
- [x] match/progress calculation.
- [x] restoration planner + verification progress.
- [x] demo-ready, messy, partial, restored fixtures.
- [x] deterministic tests.
- [x] GitHub CI gate passed.

Phase 1 gate: **PASS**.

## Phase 2 — Nova Vision

Pipeline:

```text
controlled image/snapshot
→ Amazon Bedrock Converse
→ Amazon Nova 2 Lite
→ candidate PSP JSON
→ Zod boundary validation
→ PSP validation
→ normalization
→ deterministic comparison
```

### Implemented

- [x] `packages/vision` workspace.
- [x] observation-only Nova system/user prompt.
- [x] tracked semantic vocabulary support.
- [x] confidence contract preserving `<0.60` as uncertainty.
- [x] Bedrock Converse multimodal image request builder.
- [x] Nova runtime adapter.
- [x] strict JSON extraction.
- [x] Zod candidate schema.
- [x] PSP validation + normalization.
- [x] space/capture-time drift rejection.
- [x] entity/relation/attribute evaluation metrics.
- [x] contract tests and GitHub Actions workflow.
- [x] Phase 2 TypeScript CI fixed and passing.
- [x] controlled vision fixture manifest/docs.
- [x] deterministic clean fixture generator with no embedded answer labels.
- [x] benchmark-integrity audit aligned generated scenes to canonical PSP truth:
  - chair is visibly occluded behind desk where PSP says `BEHIND`;
  - untracked laptop removed;
  - untracked messy-scene bottles removed from this gate;
  - ADDED-object vision deferred to an explicit later fixture with matching ground truth.
- [x] `evaluateChangedSceneGate()` locks the six required demo changes and prevents false `RESTORED`.
- [x] deterministic matrix-gate test proves canonical fixtures score 6/6.
- [x] `vision:matrix` runs all four real Nova observations, scores entity/relation/attribute recall, and requires >=5/6 changed-scene detections with no false `RESTORED`.
- [x] latest Nova Vision CI on commit `64266a357783ffb1b5cab2a661d25c3b9298a03b` generated the corrected fixture set and passed all Phase 2 tests.

### Live gate still required

- [ ] Run real Nova 2 Lite multimodal inference against clean controlled `demo-ready` image.
- [ ] Repeat against `messy`, `partial`, and `restored` fixtures.
- [ ] Record entity/relation/attribute accuracy.
- [ ] Confirm no manual JSON editing.
- [ ] Confirm controlled target: >=90% expected tracked-object recognition.
- [ ] Confirm changed-scene path can recover at least 5/6 deliberate changes before Phase 3/4 dependency.
- [ ] Confirm `messy` never produces a false `RESTORED` result.

The ChatGPT AWS Core connector became unavailable during the live invocation attempt. The live gate therefore remains intentionally open; this is not being counted as a Nova failure or a pass.

GitHub issue #1 tracks the live fixture matrix and required evidence.

### Phase 2 gate

Nova must consistently recognize the chosen 5–8 MVP objects/relations on controlled images and return valid normalized PSP that feeds Phase 1 without manual edits.

## Next after Phase 2 passes

**Phase 3 — Ring Foundation**

Ring adapter → device discovery → status → snapshot/media → live-stream proof → debug/judge screen runtime evidence.

## MVP completion gate

Create space → Connect Ring → Observe → Save checkpoint → Change environment → Observe again → Diff → Start Rewind → Guide action → Verify → Continue → **100% RESTORED**.
