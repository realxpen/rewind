# Testing

REWIND treats the deterministic state engine as safety-critical product logic: a demo should never depend on an LLM deciding whether reality is restored.

## Phase 1 gate

Run:

```bash
npm install
npm test
```

The test command compiles TypeScript and executes deterministic fixture gates.

Expected output includes:

```text
PASS diff-engine: six demo changes + ADDED + UNKNOWN + 100% restored
PASS restore-engine: plan generation + partial progress + 100% verification
```

## Diff gate

`packages/diff-engine/tests/compare.test.ts` checks that `demoReady` vs `messy` returns exactly six meaningful demo changes:

- `chair.main:MOVED`
- `headphones.main:MOVED`
- `backpack.black:MOVED`
- `tripod.camera:REMOVED`
- `desk.main:ATTRIBUTE_CHANGED`
- `lamp.left:ATTRIBUTE_CHANGED`

It also verifies:

- a newly observed bottle becomes `ADDED`;
- a low-confidence entity becomes `UNKNOWN`;
- the restored fixture calculates `100%` match.

## Restore gate

`packages/restore-engine/tests/planner.test.ts` checks:

- six actionable diffs produce six independently verifiable actions;
- semantic instructions are human-readable;
- the partial fixture produces intermediate progress;
- the restored fixture reaches `100%`;
- all planned actions become `VERIFIED` only at restoration.

## Future layers

Later phases add:

1. Nova structured-output contract tests;
2. image fixture → PSP evaluation;
3. Ring Playground integration tests;
4. checkpoint persistence tests;
5. restore-session state-machine tests;
6. end-to-end SAVE → DIFF → REWIND → VERIFY tests.
