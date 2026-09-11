# Phase 8 AgentCore live evidence — 2026-09-11

Status: raw live-run evidence; do not treat as a passed gate until PROJECT_STATE.md is updated.

## AgentCore resource

User successfully created an Amazon Bedrock AgentCore Memory resource in us-east-1:

- memory ID: `RewindSessionMemory-4hEnlTBLAD`
- name: `RewindSessionMemory`
- event expiry: 7 days
- initial creation status observed: `CREATING`

The earlier first create attempt failed with a transient endpoint-connectivity error; the immediate retry succeeded.

## Fixture run observation

A later `npm run agent:fixture` still printed:

`REWIND_AGENTCORE_MEMORY_ID is not set; using in-memory continuity for this process.`

Therefore that fixture run does **not** prove real AgentCore continuity.

The run also exposed a critical orchestration consistency issue: later `Check again` turns could be answered from conversational history instead of invoking `verify_rewind`, causing model prose to disagree with the deterministic session state. The fixtures themselves were verified correct (`restored` is an exact semantic clone of `demoReady`; `partial` is not restored).

## Remediation pushed

- controller now audits approved tool calls and retains authoritative compare/Rewind results;
- critical intents `What changed?`, `Rewind ...`, and `Check again` require the matching deterministic operation in that turn;
- if Strands omits the required operation, the orchestrator executes the required deterministic tool as a safety postcondition;
- percentages/state for critical intents are rendered from authoritative tool results, not free-form model prose;
- typo `heck again` is recognized as verification intent for the fixture smoke path;
- regression test `critical-intent.test.ts` is included in the Phase 8 suite;
- `npm run agentcore:smoke` was added to prove a real remote AgentCore context + conversation round-trip using a fresh store instance.

Latest CI after these changes: full `npm test` passed on commit `ca2bfa897883b685e40bf33382de2eb28b2d4490`.

## Gate remains open

Next required proof:

1. confirm the AgentCore Memory is `ACTIVE`;
2. export `REWIND_AGENTCORE_MEMORY_ID=RewindSessionMemory-4hEnlTBLAD`;
3. run `npm run agentcore:smoke` and require PASS;
4. then run the live Ring-backed agent flow.
