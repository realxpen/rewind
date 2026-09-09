# Ring Integration Knowledge

## Strategy

Simulator-first.

Phase 0 proved Ring Developers Playground access and synthetic API data. The server-side Ring adapter implements discovery/events and WHEP session lifecycle. Live gates remain separate from offline tests.

## Planned runtime proof

- device discovery;
- device status/capabilities;
- snapshot/media observation path;
- live-stream/WHEP proof;
- eventually signed webhooks and motion-triggered verification.

## Observation strategy

Prefer snapshots/keyframes for Nova analysis because they simplify inference, latency, cost, repeatability, fixture testing, and checkpoint comparison.

Use live stream primarily for:

- genuine Ring runtime proof;
- judge-facing live preview;
- event-based triggers;
- determining when to take the next observation.

## Backend boundary

Ring credentials and API calls stay server-side. No Ring access token belongs in browser code, logs, screenshots, or commits.

## WHEP contract implementation (2026-09-09)

Based on the user-reported verified Playground contract: POST
`/v1/devices/{deviceId}/media/streaming/whep/sessions` with an SDP offer and
`Content-Type: application/sdp`; require 201, read the SDP answer, capture Location.
DELETE the returned session URL to stop. Authentication stays in RingClient.
Relative Location values resolve against the create URL; cross-origin locations
and redirects are rejected to prevent credential disclosure. HTTP errors contain
status only. Offline fixtures contain no real Playground session data.

The optional local-offer smoke and commands are in `docs/TESTING.md`.
No live WHEP or media-reception pass is claimed by the unit tests.

## Live lifecycle evidence — 2026-09-09

The user ran the implemented smoke on commit `2ca86c8` and reported:

```text
Discovered devices: 1
WHEP create: 201, SDP answer and session location received
WHEP delete: success
Ring Playground smoke complete. No credentials were printed.
```

This proves live authenticated discovery and WHEP create/delete from REWIND.
It does not prove decoded video, frame capture, or Nova perception.

Next verification: use a live WebRTC peer that creates its own offer, applies
the returned answer, and receives video. Capture a decoded frame for the
observation adapter. Avoid further manual copying of ephemeral SDP as a product
workflow. Amazon's reference implementation is
https://github.com/AmazonAppDev/ring-api-helloworld (browser streaming example).

## Preview bridge

The user subsequently supplied a screenshot showing decoded Playground video in
Amazon's sample. REWIND's `ring:preview` now implements the corresponding peer
negotiation and frame capture flow, with an optional handoff to the existing Nova
adapter. An HTTP integration test verifies the server contract using injected
services; REWIND's live browser/AWS path remains unverified until exercised.

Stable Playground settings confirmed by prior successful user runs:
`RING_API_BASE_URL=https://api.amazonvision.com`, `RING_DEVICES_PATH=/v1/devices`.
OAuth access tokens remain short-lived runtime input. No SDP should be copied
manually for the preview. See `docs/TESTING.md` for setup and cleanup limits.

## ICE preparation timeout correction

User screenshot: discovery succeeded in REWIND but offer preparation timed out,
while the Amazon sample had rendered video on the same setup. REWIND incorrectly
required ICE gathering to reach complete within 15 seconds. Align with the working
sample: proceed after completion or a 3-second gathering window, using the current
local description; include both sample STUN servers. This permits the WHEP request
when gathering stays pending. It does not guarantee video connectivity. Regression
tests cover early completion, event completion, and the no-completion fallback.

## Live REWIND capture and Nova diagnostic evidence

User screenshots confirm REWIND rendered video and captured a frame. The subsequent
Nova observation failed with a generic message; the screenshot does not identify
whether AWS credentials, permissions, request settings, or PSP validation caused
it. Preview diagnostics now map allowlisted error types to actionable messages,
including VisionContractError codes. Arbitrary exception messages and raw model
output remain hidden. Nova live success and checkpoint persistence remain pending.
