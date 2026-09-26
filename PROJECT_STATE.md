# REWIND — Project State

_Last updated: 2026-09-15_

## Current phase

**Phase 12 — Submission: IN PROGRESS**

Primary track: **Ring**  
Alexa+ status: **future/optional integration**. Amazon/Devpost staff confirmed Alexa+ MCP/Add-on developer tooling is currently restricted to select partners, so live Alexa+ onboarding is not on REWIND's hackathon critical path.  
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
- [x] add a Strands agent/orchestrator that calls only those contracts.
- [x] give the agent Nova/physical-state summaries, never raw authority over deterministic truth.
- [x] add AgentCore session continuity for the active space/checkpoint/Rewind session context.
- [x] preserve DynamoDB as canonical checkpoint truth; AgentCore Memory is conversational/session context only.
- [x] add tests proving the agent cannot mark a mismatched scene `RESTORED` or mutate checkpoint truth through tool arguments.
- [x] run a real local conversational flow with Bedrock/Strands: inspect → save → compare → start Rewind → verify → 100% RESTORED.
- [x] prove continuity through a real AgentCore Memory resource rather than the in-memory fallback.
- [x] run the live Ring-backed flow through the agent boundary.

Phase 8 implementation on `main`:

- [x] `packages/agent-tools` remains the SDK-neutral deterministic trust boundary.
- [x] `packages/agent-orchestrator` adds the TypeScript Strands runtime without creating a second Python service.
- [x] Strands tools wrap only `inspect_space`, `save_checkpoint`, `list_checkpoints`, `compare_checkpoint`, `start_rewind`, `verify_rewind`, `get_rewind_status`, and `cancel_rewind`.
- [x] `RewindAgentOrchestrator` uses Nova 2 Lite through Strands and maps natural-language intent to the approved tools.
- [x] the system prompt explicitly forbids invented observations, IDs, diffs, percentages, restore plans, and model-declared `RESTORED`.
- [x] a configured default space allows natural language such as **Inspect my studio** without exposing internal identifiers.
- [x] `RewindToolController` restores active space/checkpoint/Rewind identifiers between invocations while leaving physical truth inside the deterministic tool service.
- [x] `compare_checkpoint` and `start_rewind` force a fresh trusted observation at the controller boundary, preventing stale cached state from being compared after reality changes.
- [x] `verify_rewind` always performs its own fresh trusted observation before recomputing deterministic progress.
- [x] critical intents (`What changed?`, `Rewind`, `Check again`) require their authoritative deterministic operation in the same turn and render truth from that result instead of stale model prose.
- [x] `AgentCoreSessionContinuityStore` uses AgentCore Memory `CreateEvent`/`ListEvents` for short-term continuity.
- [x] AgentCore context contains only conversation turns and operational identifiers/state labels; it does not store checkpoint PSP as canonical truth.
- [x] AgentCore events use `extractionMode=SKIP`, preventing operational session context from becoming long-term learned memory.
- [x] continuity tests recreate the controller between calls and still require deterministic fresh verification before reaching 100% `RESTORED`.
- [x] AgentCore adapter tests prove context/turn recovery and short-term-only event writes.
- [x] `npm run agent:fixture` provides a runnable multi-turn Strands/Nova natural-language surface; it uses AgentCore when `REWIND_AGENTCORE_MEMORY_ID` is configured.
- [x] `npm run agentcore:smoke` writes live AgentCore context/turns, creates a fresh store instance, then reads them back and fails unless remote continuity succeeds.
- [x] live Ring preview exposes **Ask REWIND** and resolves only server-issued Nova observation IDs; browser-supplied semantic state cannot become agent truth.
- [x] `.env.example` and `docs/PHASE8_AGENT.md` document the AgentCore/Nova configuration without committing credentials.
- [x] full Phase 8 test suite including the critical-intent truth guard passes on `main`.

Live Strands conversational gate verified on 2026-09-11 using the controlled fixture perception provider:

```text
Inspect my studio
→ 8 trusted entities observed
→ Save this as Demo Ready
→ fixture changed to Messy
→ What changed?
→ fresh observation
→ 6 meaningful changes / 25% match / DIFF_READY
→ Rewind my studio
→ deterministic 6-action plan / GUIDING
→ fixture changed to Partial
→ Check again
→ 63% match / 3 pending actions / GUIDING
→ fixture changed to Restored
→ Check again
→ 100% / RESTORED
```

Live AgentCore Memory continuity gate verified on 2026-09-11:

```text
Memory: RewindSessionMemory-4hEnlTBLAD
status: ACTIVE
actor: rewind-demo-user
session: rewind-agentcore-smoke-01
→ write context + conversation events to AgentCore Memory
→ construct fresh AgentCoreSessionContinuityStore instance
→ load same context + turns remotely
→ PASS
```

`npm run agentcore:smoke` returned: **PASS AgentCore live continuity: remote context + conversation events survived a fresh store instance.**

Live Ring-backed agent gate verified on 2026-09-14:

```text
Ring live preview
→ fresh frame captured by Ask REWIND
→ Nova validates semantic state
→ server-held observation ID enters agent boundary
→ Strands invokes approved REWIND tools
→ deterministic verification against Demo Ready
→ RESTORED — 100% match
```

Observed UI result:

```text
RESTORED — 100% match with Demo Ready. All deterministic restoration checks passed.
Session: ring-playground · Demo Ready · RESTORED
```

The video session subsequently reported **Connection lost. Start again.** after the completed verification; this occurred after the deterministic `RESTORED` result and does not invalidate the Phase 8 gate.

Phase 8 gate: **PASS**.

## Phase 9 — Alexa+ MCP

Goal: expose the approved REWIND tool surface through an Alexa+ compatible MCP server while preserving the same deterministic trust boundary proven in Phase 8.

Implemented and verified:

- [x] MCP `2025-11-25` compatible Streamable HTTP surface.
- [x] all approved REWIND operations exposed without duplicating physical-state business logic.
- [x] DynamoDB remains checkpoint truth and deterministic REWIND code remains restoration truth.
- [x] `save_checkpoint`, `compare_checkpoint`, `start_rewind`, and `verify_rewind` verified through a real MCP Streamable HTTP client.
- [x] live MCP calls request a fresh Ring frame through the same-origin preview bridge before truth-sensitive operations.
- [x] fresh Ring frame → Nova → normalized PSP → deterministic REWIND verified through the MCP surface.
- [x] no raw-media persistence and no model-declared `RESTORED` guarantees preserved.
- [x] MCP discovery verified with all eight tools.
- [x] two consecutive live `verify_rewind` calls on an unchanged scene remained deterministic **100% RESTORED** after transient living entities and non-actionable visual descriptors were removed from restoration truth.
- [x] local `.env` loading and a 30-second fresh-observation timeout reduce daily/demo startup friction.
- [x] Alexa-compatible resource-server protection implemented and tested, including Bearer auth boundary and Protected Resource Metadata support.
- [x] direct Alexa+ onboarding investigated through the documented AWS role path.

Alexa+ access decision:

- Live Alexa+ Add-on/MCP developer tooling is currently restricted to select Amazon partners.
- Devpost/Amazon hackathon staff confirmed that this restriction is expected and there is currently no public path to join the partner cohort.
- Therefore live Alexa+ onboarding is **deferred, not treated as a REWIND failure**.
- REWIND remains a **Ring-track** project; the MCP surface remains a future assistant-integration extension.
- Submission/demo materials must not claim Alexa+ was deployed or tested.

Live MCP stability gate verified on 2026-09-15:

```text
MCP discovery → 8 tools
save_checkpoint("Demo Ready Final") → fresh Ring frame → Nova → persisted checkpoint
compare_checkpoint → 100% match
start_rewind → RESTORED / 100%
verify_rewind #1 → RESTORED / 100%
verify_rewind #2 → RESTORED / 100%
```

Phase 9 MCP engineering gate: **PASS**.  
Live Alexa+ onboarding: **DEFERRED — partner-only external access restriction**.

## Phase 10 — Experience Polish

Rule: polish the proven workflow; do not redesign the underlying product flow.

- [ ] animations.
- [ ] live state overlay.
- [ ] checkpoint timeline.
- [ ] diff visualization polish.
- [ ] progress animation.
- [ ] sound feedback.
- [ ] responsive layouts.
- [ ] empty states.
- [ ] error states.

Phase 10 gate: **PASS**.

## Phase 11 — Evaluation

- [x] repeat the complete demo many times.
- [x] record object accuracy.
- [x] record diff accuracy.
- [x] record latency.
- [x] record Nova failures.
- [x] record Ring failures.
- [x] record tool failures.
- [x] record verification failures.
- [x] keep `docs/FRICTION_LOG.md` current with meaningful Amazon developer friction.
- [x] validate the production Image + Alexa submission path end-to-end.
- [x] preserve the two-object tracked-removal regression as automated coverage.
- [x] protect temporary semantic diagnostic routes with the relay secret and remove temporary Alexa request logging.

Final production Image + Alexa reliability acceptance on 2026-09-26:

```text
SAVE baseline
→ remove red + turquoise tracked notebooks
→ Nova consensus absence audit
→ notebook.red present=false @ 0.95
→ notebook.turquoise present=false @ 0.95
→ deterministic DIFF = 2 important changes
→ Alexa REWIND gives first instruction
→ Alexa next step gives second instruction
→ partial restore verifies one action and leaves one pending
→ original baseline image re-analyzed
→ both tracked notebooks present=true
→ VERIFY reaches RESTORED
```

The photo acceptance run is separate from Live Ring evidence. Production absence handling is checkpoint-driven and generic; object omission alone remains UNKNOWN and two high-confidence focused audits must agree before a tracked object becomes `present=false`.

Phase 11 gate: **PASS**.

## Phase 12 — Submission

- [x] README submission hardening.
- [x] judge-facing architecture diagram.
- [ ] final clean screenshots captured/uploaded.
- [x] public repo verification.
- [x] license verification.
- [x] setup steps.
- [x] demo script.
- [ ] demo video recorded/uploaded.
- [x] Devpost story drafted.
- [x] product feedback drafted.
- [x] friction log.
- [x] feature requests.
- [x] AWS Builder explanation.
- [x] Open Source explanation.
- [x] exact Devpost custom-field checklist prepared.
- [x] Open Source direct contribution URL confirmed: https://github.com/realxpen/rewind/pull/21.
- [ ] required human attestations completed.
- [ ] final Devpost submission.

Phase 12 repository package: **READY**.  
Phase 12 final submission gate: **IN PROGRESS** — blocked only on clean media, user attestations, and Devpost submit action.

## MVP completion gate

Create space → Connect Ring → Observe → Save checkpoint → Change environment → Observe again → Diff → Start Rewind → Guide action → Verify → Continue → **100% RESTORED**.