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

## REWIND live preview and frame observation

From the repository root, with the Ring environment already exported:

```bash
npm run ring:preview
```

Open http://127.0.0.1:3002. Select a discovered device, click **Start live view**,
then **Capture frame** after video appears. No SDP file is needed: the browser
creates an offer, gathers ICE, applies the Ring answer, and renders video.
Click **Stop** to close the browser peer and delete the Ring session.

The preview runs on loopback only. Ring tokens and upstream session locations
stay server-side. A page-close beacon requests cleanup; an idle session is also
reaped after approximately 60–70 seconds without a heartbeat. Failed deletion is
retained for retry. Background tabs that suspend heartbeats may need reconnecting.
The server attempts session cleanup on Ctrl+C. Abrupt process termination or
upstream failure can prevent cleanup; this is a development tool, not a production
session manager.

The captured JPEG remains in browser memory until discarded or the page closes.
**Download frame** explicitly saves a local development image; delete it when
finished. **Observe with Nova** sends only the selected frame and its capture time
and space name to the existing Bedrock adapter. AWS credentials must be available
in the server environment through the SDK default credential chain; configure
`AWS_REGION` and `BEDROCK_MODEL_ID` as needed. Nova calls incur normal AWS usage.
The response exposes validated PSP state, model ID, and latency; it does not save
a checkpoint or expose the raw model response. Server code does not persist media.

Validation: `npm test` includes local HTTP integration tests with injected Ring
and Nova services. These need permission to listen on loopback. They verify
origin restrictions, discovery, session ownership, cleanup/retry, frame boundary
checks, and the observation adapter contract. They do not prove actual browser
WebRTC reception, image recognition accuracy, or live AWS availability.

Reference for the WebRTC flow: AmazonAppDev/ring-api-helloworld,
`app/hooks/useWebRTCStream.ts`. The implementation here is a small local REWIND
surface, not a copy of the sample dashboard.
