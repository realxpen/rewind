# REWIND — AI Build Rules

This file governs AI-assisted development in this repository.

## Product north star

REWIND is **Ctrl+Z for reality**.

The core experience is:

**SAVE → DIFF → REWIND → VERIFY**

Reject work that distracts from making this loop reliable and demonstrable.

## Architecture rule

**AI interprets state. Deterministic code compares state.**

- Amazon Nova may observe an image/video frame and produce structured candidate state.
- Model output must be schema-validated before persistence.
- The canonical physical checkpoint is deterministic structured data.
- Semantic comparison, scoring, restore progress, and completion must be implemented in deterministic TypeScript.
- Never ask an LLM to be the sole source of truth for whether a checkpoint is restored.

## MVP constraints

Until the MVP gate passes, optimize for:

- one user;
- one space;
- one fixed camera viewpoint;
- 5–8 visually distinctive objects;
- three checkpoints maximum;
- four change classes: `ADDED`, `REMOVED`, `MOVED`, `ATTRIBUTE_CHANGED`.

Do not add before the core gate:

- robotics;
- multi-camera fusion;
- facial recognition/person identification;
- 24/7 video archiving;
- SLAM;
- native mobile apps;
- enterprise billing/accounts;
- automatic smart-device actuation.

## Privacy rule

**Remember the state. Forget the footage.**

- Ring credentials remain server-side.
- Do not perform facial recognition or infer sensitive human attributes.
- Raw media should be temporary and deleted after semantic extraction unless an explicit development fixture is being retained.
- Never log secrets, OAuth tokens, access tokens, or raw credentials.

## AWS rule

Use least-privilege AWS identities. Never build production infrastructure using the AWS account root identity.

Canonical storage responsibilities:

- DynamoDB = exact application truth for spaces/checkpoints/restore sessions.
- AgentCore Memory = conversational continuity and preferences, not canonical checkpoint state.
- S3 = temporary media staging only.

## Development gates

Do not advance just because a phase looks complete.

1. Ring proof before Ring-dependent product work.
2. Vision proof before the full workflow.
3. SAVE before DIFF.
4. DIFF before REWIND.
5. REWIND before Alexa+.
6. Core reliability before visual polish.

## Failure behavior

The AI layer must be allowed to say `UNKNOWN`.

Initial confidence guidance:

- `>= 0.80`: trusted
- `0.60–0.79`: uncertain
- `< 0.60`: unknown

Never fabricate certainty to improve the demo.

## Code quality

- TypeScript-first for core packages.
- Validate boundaries with Zod or equivalent schemas.
- Add tests for deterministic state logic.
- Keep Amazon integrations behind adapters/services.
- Keep track-specific runtime proof visible in code; README-only mentions do not satisfy the hackathon.
- Keep secrets out of commits and provide `.env.example` instead.

## Documentation

Update relevant documentation when behavior changes:

- `PROJECT_STATE.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/PHYSICAL_STATE_PROTOCOL.md`
- `docs/RING_INTEGRATION.md`
- `docs/AWS_ARCHITECTURE.md`
- `docs/ALEXA_MCP.md`
- `docs/PRIVACY.md`
- `docs/TESTING.md`
- `docs/FRICTION_LOG.md`
- `docs/PRODUCT_FEEDBACK.md`
- `docs/SUBMISSION_CHECKLIST.md`

Every meaningful Amazon developer friction should be recorded when it occurs, not reconstructed at submission time.
