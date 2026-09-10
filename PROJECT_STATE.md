# REWIND — Project State

_Last updated: 2026-09-10_

## Current phase

**Phase 7 — Ring Event Verification: IN PROGRESS**

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

Master-spec goal:

```text
Ring motion_detected webhook
→ verify X-Signature over exact raw bytes
→ validate v1.1 event envelope
→ de-duplicate request_id
→ acknowledge quickly
→ trigger Rewind verification
→ keep Check Again as fallback
```

Security boundary implemented on `main`:

- [x] `packages/ring/src/webhook-security.ts` verifies HMAC-SHA256 using the exact raw request bytes before JSON parsing.
- [x] signature format is restricted to `sha256=<64 hex chars>` and compared with `timingSafeEqual()`.
- [x] invalid/missing signatures are rejected before payload processing.
- [x] webhook v1.1 fields are validated and only sanitized event metadata is retained.
- [x] `RING_HMAC_SECRET` is environment-only and documented in `.env.example`; no real secret is committed.
- [x] `packages/ring/src/webhook-server.ts` accepts only POST `/webhooks/ring` with `application/json`.
- [x] webhook bodies are size-limited and raw request bodies are not persisted or logged.
- [x] `meta.request_id` provides bounded in-memory idempotency for retries/duplicates.
- [x] valid signed non-motion events receive a quick 2xx acknowledgement without entering the motion queue.
- [x] motion events are sanitized into the local Phase 7 inbox.
- [x] heavy Nova/restore work is kept out of the Ring webhook request path so the endpoint can acknowledge well inside Ring's five-second requirement.
- [x] local webhook listener binds to `127.0.0.1:3003`; production/public exposure must terminate HTTPS TLS 1.2+ in front of it.
- [x] preview polls only sanitized motion events and can automatically capture a fresh Ring frame, observe with Nova, and call the existing deterministic `rewind/verify` operation.
- [x] **Check Again remains available** if webhook delivery, motion timing, live video, or automatic verification fails.
- [x] Phase 7 tests cover exact-byte HMAC verification, tamper rejection, spoof rejection, signed motion acceptance, and duplicate suppression.

### Phase 7 live gate still required

- [ ] Pull latest `main` and run `npm test`.
- [ ] Set `RING_HMAC_SECRET` locally from the Ring app credentials; never paste or commit it.
- [ ] Start `ring:preview`; confirm the local webhook ingress starts on port 3003.
- [ ] Put an HTTPS TLS 1.2+ tunnel/reverse proxy in front of `http://127.0.0.1:3003` and register `<public-url>/webhooks/ring` in the Ring Developer Portal.
- [ ] Start a Rewind session from a changed scene.
- [ ] Trigger a real/simulated Ring `motion_detected` event.
- [ ] Confirm REWIND receives the signed event and automatically re-observes/verifies the current physical state.
- [ ] Confirm duplicate delivery does not trigger a second verification.
- [ ] Confirm manual **Check Again** still works independently.

Phase 7 gate: **OPEN** until signed Ring motion delivery triggers a live verification attempt.

## Next after Phase 7 passes

**Phase 8 — Strands + AgentCore**

Turn deterministic `inspect`, `save`, `compare`, `rewind`, `verify`, and `status` functions into agent tools without allowing the agent to bypass the deterministic state engine. AgentCore then provides session continuity.

## MVP completion gate

Create space → Connect Ring → Observe → Save checkpoint → Change environment → Observe again → Diff → Start Rewind → Guide action → Verify → Continue → **100% RESTORED**.
