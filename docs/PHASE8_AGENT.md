# Phase 8 — Strands + AgentCore

REWIND uses Strands for natural-language orchestration and Amazon Bedrock AgentCore Memory for short-term session continuity.

The core rule does not change:

> AI interprets intent. Deterministic REWIND code decides physical truth.

## Runtime boundary

```text
natural-language request
        ↓
Strands Agent + Nova 2 Lite
        ↓
approved REWIND tools only
        ↓
RewindAgentToolService
        ↓
Ring/Nova observation + DynamoDB checkpoint
        ↓
compareStates / calculateMatch / buildRestorePlan / updateRestoreProgress
        ↓
deterministic result
```

Strands can decide which approved tool to call and when. It cannot submit physical state, desired state, match percentage, restore plans, or a `RESTORED` flag.

Approved tools:

- `inspect_space`
- `save_checkpoint`
- `list_checkpoints`
- `compare_checkpoint`
- `start_rewind`
- `verify_rewind`
- `get_rewind_status`
- `cancel_rewind`

## AgentCore Memory role

AgentCore stores only continuity data:

- user/assistant conversation turns;
- active space ID;
- active checkpoint ID/name;
- active Rewind session ID;
- last deterministic session-state label.

It is not canonical physical truth. Checkpoint state remains in DynamoDB and Rewind-session truth remains in the deterministic service. Phase 8 AgentCore events use `extractionMode=SKIP`, so this operational context remains short-term and is not promoted into long-term learned memory.

## Create short-term AgentCore Memory

Use the existing least-privilege AWS profile and `us-east-1`:

```bash
aws bedrock-agentcore-control create-memory \
  --name RewindSessionMemory \
  --description "REWIND short-term conversational session continuity" \
  --event-expiry-duration 7 \
  --region us-east-1 \
  --profile rewind-dev
```

The response contains `memory.id`. Keep that identifier in your local environment only:

```bash
export REWIND_AGENTCORE_MEMORY_ID="<memory-id>"
export REWIND_AGENT_MODEL_ID="global.amazon.nova-2-lite-v1:0"
export REWIND_AGENT_ACTOR_ID="rewind-demo-user"
export REWIND_AGENT_SESSION_ID="rewind-demo-session"
```

The runtime identity needs only the AgentCore Memory data-plane operations it actually uses (`CreateEvent` and `ListEvents`) for this memory, plus the existing Bedrock model permissions. Do not add AdministratorAccess.

## Local natural-language smoke test

Install and run the full gate:

```bash
npm install
npm test
```

Then invoke the Strands agent:

```bash
npm run agent:fixture -- "Inspect my studio"
```

The fixture command uses real Strands + Nova 2 Lite orchestration. If `REWIND_AGENTCORE_MEMORY_ID` is set, session continuity is written to AgentCore. Without it, only the fixture continuity store is used.

The fixture state can be selected with `REWIND_FIXTURE_STATE_INDEX`:

```text
0  Demo Ready
1  Messy
2  Partial
3  Restored
```

This fixture proves orchestration shape. The Phase 8 product gate still requires the same Strands tool boundary to drive the live Ring-backed observer.

## Expected conversation

```text
"Inspect my studio"
→ inspect_space

"Save this as Demo Ready"
→ save_checkpoint

"What changed?"
→ inspect_space (when a fresh observation is needed)
→ compare_checkpoint

"Rewind my studio"
→ start_rewind

"Check again"
→ verify_rewind
→ fresh trusted observation
→ deterministic progress
→ eventually 100% RESTORED
```

A language-model response alone can never satisfy the restoration gate. `RESTORED` is valid only when the deterministic tool result says so.
