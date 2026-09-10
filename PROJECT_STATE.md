# REWIND — Project State

_Last updated: 2026-09-10_

## Current phase

**Phase 8 — Strands + AgentCore: IN PROGRESS**

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

Verified path:

```text
Ring observation
→ Nova
→ validated PSP
→ named checkpoint
→ DynamoDB
→ browser reload
→ checkpoint still exists
```

Implemented and verified:

- [x] `packages/checkpoints` workspace.
- [x] checkpoint contracts and deterministic state hash.
- [x] DynamoDB checkpoint store.
- [x] DynamoDB table bootstrap script.
- [x] checkpoint service unit test.
- [x] preview observation IDs retained server-side without retaining images.
- [x] `POST /api/checkpoints` saves only a server-held validated observation.
- [x] `GET /api/checkpoints?spaceId=...` lists persisted checkpoint summaries.
- [x] preview SAVE controls and saved-checkpoint list.
- [x] `rewind-checkpoints-dev` created and usable in `us-east-1`.
- [x] **Demo Ready** saved from a live Ring → Nova observation.
- [x] browser reload confirmed **Demo Ready** remains persisted from DynamoDB.

Phase 4 gate: **PASS**.

## Phase 5 — DIFF

Verified path:

```text
current Ring observation
→ Nova
→ current PSP
→ load saved checkpoint PSP
→ deterministic compareStates()
→ visual semantic diff
```

Implemented and verified:

- [x] `POST /api/diff` compares a server-held current observation against a persisted checkpoint.
- [x] checkpoint lookup remains server-side through `CheckpointService.get()`.
- [x] deterministic `compareStates()` remains the source of truth for changes.
- [x] `calculateMatch()` produces match percentage and prevents model-decided restoration.
- [x] UI exposes **Compare current state** per saved checkpoint after a fresh Nova observation.
- [x] visual diff cards show `MOVED`, `REMOVED`, `ADDED`, `ATTRIBUTE_CHANGED`, and `UNKNOWN` when present.
- [x] Phase 5 integration test proves canonical Demo Ready → Messy returns six semantic changes and `restored=false`.
- [x] full `npm test` passes in GitHub Actions with the Phase 5 gate included.
- [x] live Ring → Nova comparison verified in the preview.
- [x] live comparison showed 5 meaningful changes and **0%** match, with no false `RESTORED` result.

Phase 5 gate: **PASS**.

## Phase 6 — REWIND

Master-spec flow:

```text
start
→ plan
→ instruction
→ user action
→ verify
→ recompute
→ next action
→ 100% RESTORED
```

Implemented and verified:

- [x] `POST /api/rewind` loads the persisted checkpoint and current server-held observation.
- [x] deterministic `compareStates()` remains the comparison source of truth.
- [x] deterministic `buildRestorePlan()` generates human restoration actions.
- [x] `UNKNOWN` entities are blocked from invented actions and surfaced for re-observation.
- [x] state reports `GUIDING`, `LOW_CONFIDENCE`, or `RESTORED` from deterministic results.
- [x] Phase 6 UI exposes **Start Rewind** after a non-restored comparison.
- [x] ordered guidance cards show instruction, verification hint, confidence, source diff type, and action status.
- [x] live guidance verified in the Ring preview.
- [x] server-held Rewind session ID preserves the active restoration plan across fresh observations.
- [x] `POST /api/rewind/verify` recomputes the latest semantic diff against the same persisted checkpoint.
- [x] `updateRestoreProgress()` marks actions `VERIFIED` or `PENDING` from the new observation.
- [x] **Check Again** remains available as the deterministic manual verification path.
- [x] appearance-only descriptors such as color/material are excluded from actionable restoration state.
- [x] automated Phase 6 test runs `messy → partial → restored` and requires deterministic **100% RESTORED**.
- [x] live controlled restoration reached **Verify Rewind → RESTORED / 100%** without manually editing application data.

Phase 6 gate: **PASS**.

## Phase 7 — Ring Event Verification

Master-spec flow:

```text
Ring motion_detected webhook
→ verify X-Signature over exact raw bytes
→ validate v1.1 event envelope
→ de-duplicate request_id
→ acknowledge quickly
→ trigger Rewind verification
→ keep Check Again as fallback
```

Implemented security and event boundary:

- [x] exact-byte HMAC-SHA256 verification before JSON parsing.
- [x] constant-time signature comparison and strict `sha256=<64 hex chars>` format.
- [x] invalid/missing signatures rejected before payload processing.
- [x] Ring v1.1 envelope validation and sanitized event retention only.
- [x] bounded request-id idempotency for duplicate/retried delivery.
- [x] heavy Nova/restore work kept outside the webhook acknowledgement path.
- [x] local listener bound to `127.0.0.1:3003` behind staging HTTPS tunnel.
- [x] unsigned public-tunnel traffic live-tested and rejected with HTTP 401.
- [x] preview polls sanitized motion events and automatically captures a fresh Ring frame, observes with Nova, and calls deterministic `rewind/verify`.
- [x] **Check Again** remains available as an independent fallback.
- [x] automated tests cover signed motion acceptance, exact-byte verification, tamper/spoof rejection, and duplicate suppression.

Ring one-way account linking:

- [x] `/ring/oauth/token-exchange` exchanges Ring authorization codes server-side.
- [x] `/v1/users/me` obtains the trusted Ring Account ID server-side.
- [x] unclaimed credentials remain bounded, short-lived, server-only staging state.
- [x] `/ring/link` validates Ring `nonce` + `time` with a 10-minute freshness window.
- [x] HMAC nonce matching uses `<time>:<account_id>` and constant-time comparison.
- [x] REWIND staging sign-in gates credential claim.
- [x] nonce-bound CSRF and hardened response headers protect the account-link page.
- [x] successful claim completes the Ring App Integrations POST/PATCH sequence.
- [x] `/ring` serves the required App Homepage URL.
- [x] `.env.example` documents required Ring and staging variables without real secrets.
- [x] automated account-link and HTTP tests pass in the full test suite.

Live gate verification on 2026-09-10:

- [x] latest Ring/account-link implementation configured locally and `ring:preview` restarted.
- [x] public staging Account Link, App Homepage, Token Exchange, and Webhook URLs registered successfully in the Ring Developer Console.
- [x] real Ring-driven one-way account-link flow completed successfully.
- [x] changed-scene Rewind session active for event verification.
- [x] Ring motion event triggered through the connected Ring staging flow.
- [x] signed Ring event reached REWIND and automatically triggered fresh observation + deterministic Rewind verification without using **Check Again** for that verification.
- [x] duplicate suppression remains covered by the signed webhook/idempotency automated gate.
- [x] manual **Check Again** remains independently verified as the fallback path.

Phase 7 gate: **PASS**.

## Phase 8 — Strands + AgentCore

Goal: expose the already-working deterministic physical-state operations as agent tools while preserving the trust boundary.

Locked rule:

> The agent may choose **which approved tool to call and when**. It may not invent physical state, decide restoration truth, rewrite checkpoint state, bypass `compareStates()`, or declare `RESTORED` independently.

Target tool surface:

```text
inspect_space
save_checkpoint
list_checkpoints
compare_checkpoint
start_rewind
verify_rewind
get_rewind_status
cancel_rewind
```

Phase 8 implementation order:

- [x] define typed agent-tool contracts around the existing services instead of duplicating business logic.
- [ ] add a Strands agent/orchestrator that calls only those contracts.
- [x] give the agent Nova/physical-state summaries, never raw authority over deterministic truth.
- [ ] add AgentCore session continuity for the active space/checkpoint/Rewind session context.
- [ ] preserve DynamoDB as canonical checkpoint truth; AgentCore memory is conversational/session context only.
- [x] add tests proving the agent cannot mark a mismatched scene `RESTORED` or mutate checkpoint truth through tool arguments.
- [ ] run a local conversational flow: inspect → save/list → compare → start Rewind → verify → status.
- [ ] run the live Ring-backed flow through the agent boundary.

Phase 8 foundation implemented on `main`:

- [x] `packages/agent-tools/src/contracts.ts` defines the SDK-neutral typed tool boundary.
- [x] `packages/agent-tools/src/specs.ts` locks all tool schemas with `additionalProperties: false`.
- [x] no agent tool accepts raw physical state, desired state, match percentage, restore plan, or a `RESTORED` flag.
- [x] `save_checkpoint` persists only the latest trusted server-held semantic observation.
- [x] `verify_rewind` always requests a fresh trusted observation itself; the model cannot submit verification state.
- [x] compare, Rewind planning, progress, and restoration truth remain delegated to `compareStates()`, `calculateMatch()`, `buildRestorePlan()`, and `updateRestoreProgress()`.
- [x] returned plans/results are defensive copies so caller mutation cannot rewrite server session truth.
- [x] Phase 8 trust-boundary tests cover state smuggling, false-RESTORED injection, returned-plan mutation, deterministic partial progress, and deterministic 100% restoration.
- [x] full GitHub Actions `npm test` passed for commit `2178f03310ab9395574429ac4321d4e9a47995c8` with the Phase 8 test included.

Phase 8 gate: **OPEN** until an agent-driven flow reaches the existing deterministic restore loop without bypassing its state engine.

## Next after Phase 8 passes

**Phase 9 — Alexa+ MCP**

Expose the approved REWIND tool surface through the Alexa+ compatible MCP boundary after the Strands/AgentCore trust boundary is proven.

## MVP completion gate

Create space → Connect Ring → Observe → Save checkpoint → Change environment → Observe again → Diff → Start Rewind → Guide action → Verify → Continue → **100% RESTORED**.
