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
The response exposes validated PSP state, model ID, latency, and a short-lived
server observation ID. Server code does not persist media.

## Phase 4 — SAVE persistence gate

Phase 4 stores the validated semantic state, not the image. The checkpoint table
uses `spaceId` as its partition key and `id` as its sort key.

First load AWS credentials and create/verify the development table:

```bash
export AWS_PROFILE=rewind-dev
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1
export AWS_SDK_LOAD_CONFIG=1
export DYNAMODB_CHECKPOINTS_TABLE=rewind-checkpoints-dev

npm run checkpoints:ensure-table
```

Then export a fresh Ring Playground token and start the preview:

```bash
export RING_API_BASE_URL=https://api.amazonvision.com
export RING_DEVICES_PATH=/v1/devices
export RING_ACCESS_TOKEN='YOUR_FRESH_PLAYGROUND_TOKEN'
npm run ring:preview
```

In the browser:

1. Start live view.
2. Capture a frame.
3. Set the space name (for example `studio`).
4. Click **Observe with Nova**.
5. Leave the checkpoint name as **Demo Ready** or choose another valid name.
6. Click **Save checkpoint**.
7. Confirm the checkpoint appears in **Saved checkpoints**.
8. Reload the page.
9. Confirm **Demo Ready** still appears.

That reload is the Phase 4 gate. If it survives reload, the checkpoint came back
from DynamoDB rather than browser memory. The server accepts a checkpoint save only
for a validated observation that it produced during the current process. The raw
captured image is not written to DynamoDB.

`npm test` also includes the offline Phase 4 checkpoint service test. It verifies
save/list/get behavior and a deterministic SHA-256 hash over the normalized PSP.

## Future layers

Later phases add:

1. current observation → stored checkpoint diff;
2. restore-session state-machine tests;
3. Ring motion-triggered verification;
4. end-to-end SAVE → DIFF → REWIND → VERIFY tests.
