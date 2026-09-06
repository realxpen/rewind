# System Architecture

## Core rule

**AI interprets state. Deterministic code compares state.**

```text
Ring observation
  ↓
Amazon Nova 2 Lite via Bedrock
  ↓
Candidate PSP
  ↓
validate + normalize
  ↓
Canonical PhysicalState
  ↓
Deterministic diff engine
  ↓
Restore planner / progress engine
  ↓
Human action
  ↓
Re-observe and verify
  ↓
100% RESTORED
```

## Canonical responsibilities

- Ring: observation/media/events.
- Nova: perception and candidate semantic interpretation.
- PSP: structured physical-state representation.
- Diff engine: deterministic semantic comparison.
- Restore engine: deterministic action planning/progress verification.
- DynamoDB: canonical application truth for spaces/checkpoints/observations/restore sessions.
- S3: temporary media staging only.
- Strands: orchestration after deterministic tools exist.
- AgentCore Memory: conversational continuity, never canonical checkpoint truth.
- Alexa+ MCP: conversational surface after the core restore loop works.

## Current implementation

Phase 1 packages:

- `packages/physical-state-protocol`
- `packages/diff-engine`
- `packages/restore-engine`

The deterministic core is model-independent and Ring-independent by design.
