# Ring Research

## Validated direction

REWIND is simulator-first and Ring is the primary hackathon track.

## Playground findings

The Ring Developers Playground was successfully accessed during Phase 0 and provided:

- temporary OAuth token generation;
- API Explorer;
- synthetic device/account data;
- device discovery response;
- Package, Vehicle, and Motion live-view event simulation.

This removes physical Ring hardware as an MVP dependency.

## Integration principles

- Ring API calls must remain server-side.
- Playground is for early integration and synthetic testing.
- Registered-app OAuth, refresh flow, HMAC webhook verification, and production-style integration come later.
- Prefer snapshots/keyframes for Nova state extraction.
- Use live WHEP/WebRTC mainly as runtime proof, live preview, and event trigger.
- Motion can trigger re-observation after the scene stabilizes.
- Always keep a manual `Check Again` verification fallback.

## Security lesson

Never expose Playground OAuth tokens in screenshots, logs, chat, commits, or client bundles. Regenerate short-lived tokens after accidental exposure.
