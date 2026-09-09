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
