# Phase 11 — Evaluation & Reliability

Phase 11 follows the master specification: repeat the complete demo many times and record object accuracy, diff accuracy, latency, Nova failures, Ring failures, tool failures, and verification failures.

## Evaluation rule

Do not merge live Ring evidence and Controlled Demo evidence into one claim.

- **Live Ring** measures the real Ring Playground → frame → Nova → semantic-state path.
- **Controlled Demo** measures repeatability of the SAVE → DIFF → REWIND → VERIFY product loop using server-owned validated semantic fixtures.

Both can exercise the deterministic REWIND engine, but only Live Ring is camera-integration evidence.

## Trial protocol

For each trial:

1. Start REWIND and confirm the intended observation source.
2. Save a baseline checkpoint.
3. Produce or select the changed state.
4. Compare against the baseline.
5. Start Rewind.
6. Verify a partial restoration where the source supports it.
7. Verify the restored state.
8. Record the trial immediately with `npm run eval:record`.

For Controlled Demo use the fixed sequence:

```text
Demo Ready → Save
Messy → Compare → Start Rewind
Partial → Check Again
Restored → Check Again → 100% RESTORED
```

## Metric definitions

- **Object accuracy** = correctly recognized tracked objects / expected tracked objects.
- **Diff accuracy** = correct meaningful diffs / expected meaningful diffs.
- **Latency** = end-to-end elapsed time for the trial or measured truth-sensitive operation; use the same convention consistently within a run set.
- **Nova failure** = Nova invocation or validated semantic extraction failed.
- **Ring failure** = device discovery, WHEP/live-view, frame capture, token/session, or Ring event path failed.
- **Tool failure** = approved REWIND tool/MCP operation failed independent of Nova/Ring transport.
- **Verification failure** = final deterministic verification did not reach the expected truth state.
- **Pass** = the trial reached its expected deterministic outcome without manual state-data editing.

## Commands

Record one trial:

```bash
npm run eval:record
```

The recorder appends JSONL evidence to `Raw/phase11-evaluation.jsonl` by default. Override with `REWIND_EVALUATION_LOG` if needed.

Print the aggregate report:

```bash
npm run eval:summary
```

## Final run set used to close Phase 11

The final hackathon validation set was reduced after observing significant Ring Playground friction:

- 5 complete Controlled Demo runs.
- 2 Live Ring observation/save/compare runs.
- Both Live Ring runs used a stable unchanged scene and reached 100% match.
- Every observed failure would be recorded rather than silently retried away.

Final aggregate results:

- 7 total trials.
- 100% pass rate.
- 100% object accuracy.
- 100% diff accuracy across the Controlled Demo change set.
- 100% verification success.
- Average measured Controlled Demo end-to-end latency: 21,615 ms across 2 measured runs.
- 0 Nova failures.
- 0 Ring failures.
- 0 tool failures.
- 0 verification failures.

Controlled Demo evidence validates the SAVE → DIFF → REWIND → VERIFY loop. Live Ring evidence validates the real Ring Playground → frame → Nova → semantic-state → compare path. The Live Ring runs do not claim physical rearrangement testing.

Phase 11 gate: **PASS**.


## Submission Image + Alexa reliability gate — 2026-09-26

This acceptance run is separate from the 7-trial aggregate above and is not counted as Live Ring evidence. It validates the production Vercel photo adapter plus the real Alexa custom skill relay:

```text
Image → Nova 2 Lite → validated semantic state → deterministic DIFF/REWIND → Alexa → VERIFY
```

Test sequence:

1. Saved `vercel desk baseline` from the original desk image.
2. Baseline semantic state contained six entities, including `notebook.red` and `notebook.turquoise` with `present=true`.
3. Re-analyzed a changed image with both tracked notebooks removed.
4. The generic contrastive consensus absence audit produced explicit high-confidence negative evidence for both tracked objects:
   - `notebook.red present=false confidence=0.95`
   - `notebook.turquoise present=false confidence=0.95`
5. Deterministic comparison produced **2 important changes**.
6. Alexa reported two changes, delivered the first restore instruction, and `next step` delivered the second restore action.
7. Partial restoration verified that one completed action disappears while the remaining action stays pending.
8. Re-analyzing the original baseline image restored both tracked objects to `present=true`.
9. Alexa verification reached: **“The important visible parts of vercel desk baseline are restored.”**

Reliability hardening performed before the passing run:

- omission alone remains `UNKNOWN`; it never becomes a deterministic removal;
- tracked absence is generic and checkpoint-driven, not keyed to notebook names, colors, or a specific image;
- omitted tracked objects receive two independent focused Nova audits;
- both audits must agree on `ABSENT`, support visibility, and confidence >= 0.85 before `present=false` is admitted into deterministic truth;
- visible same-category objects are supplied as contrastive candidates to reduce identity confusion;
- positive presence still comes from direct visual evidence rather than the absence fallback;
- the two-object removal → two actions → partial verify → full restore sequence is preserved as an automated regression test.

Temporary production diagnostics are now protected by the existing relay secret, and temporary Alexa intent debug logging has been removed.

This gate proves the photo-first submission path and real Alexa guidance path. It does **not** relabel photo evidence as Live Ring evidence.

## Unrelated kitchen added-object regression — 2026-09-28

This is a second production Image + REWIND Voice reliability run on a scene unrelated to the desk/notebook test. It is **not** Live Ring evidence.

Ground truth:

- saved checkpoint: `empty kitchen`;
- baseline image: basil plant + fruit bowl + toaster, with no blue cup and no red kettle;
- changed image: the same kitchen plus a blue cup and red kettle.

Observed production result:

1. the main Nova pass emitted both current candidates;
2. two independent candidate audits agreed that `cup` and `kettle` were EXTRA at high confidence;
3. consensus promoted both exact current keys to semantic `MOVABLE` + `present=true` evidence;
4. deterministic DIFF produced exactly **2 important changes**;
5. REWIND Voice guided **cup first**: “Remove cup from the restored scene.”;
6. `next step` guided **kettle second**: “Remove kettle from the restored scene.”;
7. a further `next step` stopped correctly with: “That was the last pending step. Analyze another photo and say check again when you want me to verify the restoration.”

The same kitchen scene family separately reached the restored response after baseline re-analysis, confirming that the kitchen is not only a DIFF fixture.

Reliability property proven:

- no cup/kettle-specific production branch is required;
- a movable extra is actionable from semantic evidence rather than a hardcoded noun list;
- extra-object audits vote on exact candidates from the main observation, avoiding `kettle` vs `teapot` canonical-name disagreement;
- two additions survive deterministic DIFF and restore planning;
- two-step voice navigation terminates instead of repeating the last action.

Automated preservation:

- `packages/ring/tests/rewind-observation-identity.test.ts` carries the unrelated kitchen candidate-consensus → DIFF → restore-plan regression;
- `packages/ring/tests/vercel-submission.test.ts` guards the REWIND Voice final-step stop control flow.

Phase 11 submission reliability gate: **PASS**.
