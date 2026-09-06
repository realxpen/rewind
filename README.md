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

## Architecture principle

**AI interprets state. Deterministic code compares state.**

Nova produces structured candidate state. REWIND validates and normalizes it. Deterministic TypeScript performs semantic comparison, restoration planning, progress scoring, and completion.

## Physical State Protocol v0.1

Phase 1 implements the open-source PSP core:

- JSON Schema;
- TypeScript types;
- validation and normalization;
- deterministic semantic diff engine;
- match/progress engine;
- restoration planner;
- four controlled studio fixtures;
- deterministic gate tests.

Public APIs currently include `parseState()`, `normalizeState()`, `compareStates()`, `calculateMatch()`, `buildRestorePlan()`, `updateRestoreProgress()`, and `validateCheckpoint()`.

## Quick start

Requires Node.js 22+.

```bash
npm install
npm test
```

Expected gate output:

```text
PASS diff-engine: six demo changes + ADDED + UNKNOWN + 100% restored
PASS restore-engine: plan generation + partial progress + 100% verification
```

## Demo fixture

The controlled `demo-ready → messy` comparison deterministically returns six meaningful changes:

- chair moved;
- headphones moved;
- backpack moved;
- tripod missing;
- desk cluttered;
- lamp off.

## Planned production stack

Ring / Amazon Vision APIs, Amazon Bedrock, Amazon Nova 2 Lite, Strands Agents SDK, Amazon Bedrock AgentCore, DynamoDB, S3 temporary media, CloudWatch, Next.js/React/TypeScript, and Alexa+ MCP after the core restore loop works.

## Privacy principle

**Remember the state. Forget the footage.**

## Project status

**Phase 1 — Physical State Protocol + deterministic diff engine: complete.**

Next: **Phase 2 — Nova perception contract: image → validated PSP.**

See `docs/PRD.md`, `docs/PHYSICAL_STATE_PROTOCOL.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`, `PROJECT_STATE.md`, and `AGENTS.md`.

## License

MIT © 2026 Ayomide Oladeji
