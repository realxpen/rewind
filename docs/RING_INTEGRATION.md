# Ring Integration

REWIND's primary hackathon track is **Ring**.

The repository contains the real integration: API client, device discovery, WHEP/WebRTC handling, live frame observation, account-linking support, webhook verification, and the bridge that converts Ring media into trusted Nova semantic observations.

## Live path

~~~text
Ring Developer Playground
→ device discovery
→ WHEP live-view session
→ browser-decoded live video
→ frame capture
→ server-side observation bridge
→ Amazon Bedrock / Nova 2 Lite
→ validated Physical State Protocol
→ deterministic SAVE / DIFF / VERIFY
~~~

Relevant implementation:

- packages/ring/src/client.ts
- packages/ring/src/devices.ts
- packages/ring/src/whep.ts
- packages/ring/src/live-frame-observer.ts
- packages/ring/src/observation-bridge.ts
- packages/ring/src/webhook-security.ts
- packages/ring/src/webhook-server.ts

## Live verification completed

REWIND exercised device discovery, WHEP live session creation, live video rendering, frame capture, Nova semantic interpretation, Ring-backed save/compare, signed motion webhook verification, and Ring-backed agent/MCP operations.

The final Phase 11 Ring evaluation deliberately used an unchanged Playground scene and reached 100% match. It proves the real Ring transport/perception path, not a physical-rearrangement claim.

## Why the final demo also uses images

The Ring Playground does not provide a reliable control for repeatedly rearranging known objects into baseline, changed, partial, and restored configurations.

For a deterministic under-three-minute restoration demo, REWIND therefore uses a clearly labeled Image + Alexa sequence and separately shows live Ring proof.

The two evidence paths must not be merged into one claim.

## Webhook security

Ring verification events require exact-byte HMAC-SHA256 verification, constant-time comparison, event-envelope validation, duplicate suppression, and fast acknowledgement before expensive inference.

Manual **Check Again** remains available independently.

## Local test

~~~bash
npm run ring:smoke
npm run ring:preview
~~~

See docs/SETUP.md and docs/FRICTION_LOG.md.
