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

## Ring WHEP session smoke

`npm test` includes offline WHEP contract tests; no credentials or live service are required.
`npm run ring:smoke` keeps discovery/events behavior and optionally creates and deletes a WHEP session.

Load the existing Ring environment (`RING_API_BASE_URL`, `RING_ACCESS_TOKEN`,
`RING_DEVICES_PATH`, optionally `RING_EVENTS_PATH`) securely in your shell.
The base URL should be the Ring API origin. Then run:

```bash
cd ~/Documents/XPEN/rewind
git pull --ff-only origin main
npm install
npm test
RING_WHEP_OFFER_FILE="$HOME/Downloads/ring-offer.sdp" npm run ring:smoke
```

Save a fresh SDP offer from the live WebRTC peer to that local file first. Do not
commit the offer, ICE credentials, fingerprints, tokens, answers, or session URLs.
If discovery returns multiple devices, set `RING_WHEP_DEVICE_ID` to the selected
discovered ID in your local environment. A single device is selected automatically.

Expected WHEP output: `WHEP create: 201, SDP answer and session location received`,
then `WHEP delete: success`. Session URLs and SDP are never printed. The smoke
uses `finally` to delete a created session; failed deletion causes a nonzero exit.
A missing Location prevents cleanup because no session URL is available.

This checks signaling/session lifecycle only; it does not connect the SDP answer
to a WebRTC peer or prove video delivery. Live execution remains a separate gate.
