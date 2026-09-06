# Ring Integration Knowledge

## Strategy

Simulator-first.

Phase 0 proved Ring Developers Playground access and synthetic API data. Phase 3 will implement the actual server-side Ring adapter after Phase 2 vision is reliable.

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
