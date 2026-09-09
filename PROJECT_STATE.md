# REWIND — Project State

_Last updated: 2026-09-09_

## Current phase

**Phase 4 — SAVE: IN PROGRESS**

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
- [x] Amazon Bedrock / Nova 2 Lite text inference verified.
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

Implemented and verified:

- [x] `packages/vision` workspace.
- [x] observation-only Nova prompt and tracked semantic vocabulary.
- [x] Bedrock Converse multimodal request builder and runtime adapter.
- [x] strict JSON extraction + Zod + PSP validation/normalization.
- [x] confidence-aware evaluation metrics.
- [x] controlled fixture generator and live matrix harness.
- [x] real Nova matrix executed locally against demo-ready, messy, partial, restored.
- [x] 100% tracked-entity recall in the final controlled run.
- [x] changed-scene gate recovered 5/6 deliberate changes.
- [x] `falseRestored=false`.
- [x] no manual JSON editing required.

Known limitation retained honestly: relation recall in the controlled benchmark remains weak, and the desk attribute change was the one missed changed-scene assertion in the final run. This does not block the locked Phase 2 gate.

Phase 2 gate: **PASS**.

## Phase 3 — Ring Foundation

Verified runtime path:

```text
Ring Playground OAuth
→ device discovery
→ WHEP session creation
→ live browser video
→ frame capture
→ Nova observation
→ validated PSP
```

Implemented and verified:

- [x] Ring API client and configuration boundary.
- [x] synthetic device discovery.
- [x] event normalization foundation.
- [x] WHEP POST/DELETE lifecycle.
- [x] browser WebRTC live preview.
- [x] decoded Playground video received in REWIND.
- [x] frame capture from Ring live video.
- [x] captured frame sent to Amazon Bedrock / Nova 2 Lite.
- [x] validated PSP returned to the preview.
- [x] credentials/session URLs remain server-side.
- [x] no raw media persistence in the Ring preview path.

Phase 3 gate: **PASS**.

## Phase 4 — SAVE

Goal:

```text
Ring observation
→ Nova
→ validated PSP
→ named checkpoint
→ DynamoDB
→ browser reload
→ checkpoint still exists
```

Implemented on `main`:

- [x] `packages/checkpoints` workspace.
- [x] checkpoint contracts and deterministic state hash.
- [x] DynamoDB checkpoint store.
- [x] DynamoDB table bootstrap script.
- [x] checkpoint service unit test.
- [x] preview observation IDs retained server-side without retaining images.
- [x] `POST /api/checkpoints` saves only a server-held validated observation.
- [x] `GET /api/checkpoints?spaceId=...` lists persisted checkpoint summaries.
- [x] preview SAVE controls and saved-checkpoint list.
- [x] `.env.example` includes `DYNAMODB_CHECKPOINTS_TABLE`.

### Phase 4 live gate still required

- [ ] Install the new DynamoDB SDK dependencies and lock them.
- [ ] Create/verify `rewind-checkpoints-dev` in `us-east-1`.
- [ ] Start `ring:preview` with Ring + AWS + DynamoDB environment loaded.
- [ ] Capture a Ring frame and observe it with Nova.
- [ ] Save checkpoint **Demo Ready**.
- [ ] Reload the browser.
- [ ] Confirm **Demo Ready** is still listed from DynamoDB.

Phase 4 gate: **OPEN** until the reload persistence proof passes.

## Next after Phase 4 passes

**Phase 5 — DIFF**

Current observation → Nova → PSP → deterministic compare against a stored checkpoint → visual `MOVED`, `REMOVED`, `ADDED`, `ATTRIBUTE_CHANGED` result.

## MVP completion gate

Create space → Connect Ring → Observe → Save checkpoint → Change environment → Observe again → Diff → Start Rewind → Guide action → Verify → Continue → **100% RESTORED**.
