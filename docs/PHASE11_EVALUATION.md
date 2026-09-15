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

## Minimum run set before closing Phase 11

Target at least:

- 10 complete Controlled Demo runs.
- 5 Live Ring observation/save runs.
- At least 3 Live Ring truth-sensitive compare/verify runs where the Playground provides a meaningful stable state.
- Record every failure rather than silently retrying it away.

Phase 11 should not be marked PASS until the aggregate numbers are reviewed and the meaningful Amazon developer friction is reflected in `docs/FRICTION_LOG.md`.
