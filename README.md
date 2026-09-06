# REWIND

> **Ctrl+Z for reality.**

REWIND is a spatial-AI system that lets people save semantic checkpoints of physical spaces, see what changed, and receive AI-guided, visually verified instructions for restoring those spaces to a previous state.

## Hackathon

Built for **Build, Ship, Shape: Amazon Developer Hackathon (2026)**.

- **Primary track:** Ring
- **Additional track:** Alexa+ if the MCP integration is completed successfully
- **Mini-challenges:** AWS Builder + Open Source

## Core loop

**SAVE → DIFF → REWIND → VERIFY**

1. Ring observes a physical space.
2. Amazon Nova converts the observation into a structured Physical State.
3. REWIND saves that state as a checkpoint.
4. Deterministic code compares a later state against the checkpoint.
5. REWIND creates a restoration plan.
6. The user changes the physical environment.
7. REWIND re-observes and verifies the restoration.

## Architecture principle

**AI interprets state. Deterministic code compares state.**

The canonical checkpoint is not an image comparison or an LLM conversation. Nova produces structured candidate state, REWIND validates it, and deterministic TypeScript computes the semantic diff.

## MVP

The MVP is intentionally constrained to one user, one physical space, one fixed camera viewpoint, and 5–8 visually distinctive objects. It must reliably detect four change classes:

- moved
- missing
- added
- state changed

The core MVP gate passes only when a saved physical checkpoint can be changed, diffed, restored, and visually verified without manually editing application data.

## Planned stack

- Next.js + React + TypeScript
- Node.js backend
- Ring / Amazon Vision APIs and simulator
- Amazon Bedrock
- Amazon Nova 2 Lite
- Strands Agents SDK
- Amazon Bedrock AgentCore
- DynamoDB
- S3 temporary media
- CloudWatch / AgentCore Observability
- Alexa+ MCP using Streamable HTTP

## Open-source component

REWIND includes the **Physical State Protocol (PSP)**: a structured representation for describing, comparing, and restoring semantic physical environments.

Planned public APIs include:

- `parseState()`
- `normalizeState()`
- `compareStates()`
- `calculateMatch()`
- `buildRestorePlan()`
- `validateCheckpoint()`

## Privacy principle

**Remember the state. Forget the footage.**

Raw media is temporary. REWIND persists semantic physical state rather than building a permanent surveillance archive.

## Project status

Current stage: **Phase 0 — Compliance + Accounts**.

See:

- `docs/PRD.md` — master product/build specification
- `PROJECT_STATE.md` — current phase and gates
- `AGENTS.md` — build rules for AI-assisted development
- `docs/FRICTION_LOG.md` — Amazon developer friction log

## License

MIT © 2026 Ayomide Oladeji
