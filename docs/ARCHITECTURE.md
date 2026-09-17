# REWIND Architecture

## Core principle

> **AI interprets state. Deterministic code compares state.**

REWIND separates perception from truth. Amazon Nova 2 Lite converts a Ring frame into a structured candidate physical state, but it never decides whether a space is restored. Deterministic TypeScript validates, compares, plans, scores, and verifies restoration.

## Submission architecture diagram

```mermaid
flowchart TD
    A[Ring Developer Playground] --> B[WHEP live video session]
    B --> C[Browser frame capture]
    C --> D[Server-side Ring observation bridge]
    D --> E[Amazon Bedrock / Nova 2 Lite]
    E --> F[Candidate Physical State Protocol]
    F --> G[Validate + normalize PSP]
    G --> H[Trusted semantic observation]

    H --> I[Save checkpoint]
    I --> J[(DynamoDB checkpoints)]

    H --> K[Compare current state]
    J --> K
    K --> L[Deterministic compareStates()]
    L --> M[PhysicalDiff[] + match score]
    M --> N[Deterministic buildRestorePlan()]
    N --> O[Human restoration action]
    O --> P[Fresh Ring + Nova observation]
    P --> Q[Deterministic verify_rewind]
    Q --> R{100% match?}
    R -- No --> N
    R -- Yes --> S[RESTORED]

    T[Strands agent] --> U[Approved REWIND tools only]
    U --> H
    U --> I
    U --> K
    U --> N
    U --> Q

    V[Amazon Bedrock AgentCore Memory] --> T
    T --> V

    W[Ring motion webhook] --> X[Signature verification + dedupe]
    X --> P

    Y[Controlled Demo fixtures] --> Z[Validated server-owned semantic states]
    Z --> K
```

## Core product loop

```text
SAVE
Ring → frame → Nova → validated semantic state → DynamoDB checkpoint

DIFF
fresh observation + checkpoint → deterministic compareStates()

REWIND
PhysicalDiff[] → deterministic buildRestorePlan() → human instructions

VERIFY
fresh observation → deterministic recomputation → progress → 100% RESTORED
```

## Trust boundaries

### Perception boundary

Amazon Nova 2 Lite may describe what it sees, but its output must pass schema and Physical State Protocol validation before REWIND can use it.

### Restoration truth boundary

Only deterministic code may:

- compare checkpoint state with current state;
- calculate match percentage;
- generate restoration actions from semantic diffs;
- mark actions verified or pending;
- declare `RESTORED`.

Neither Nova nor the agent can independently declare restoration complete.

### Agent boundary

The Strands orchestration layer is restricted to the approved tool surface:

```text
inspect_space
save_checkpoint
list_checkpoints
compare_checkpoint
start_rewind
verify_rewind
get_rewind_status
cancel_rewind
```

The agent may choose which approved operation to invoke, but it cannot invent physical state, rewrite checkpoint truth, bypass the deterministic comparison engine, or mark a mismatched scene restored.

### Memory boundary

Amazon Bedrock AgentCore Memory stores short-term conversational/session continuity such as active space, checkpoint, and Rewind session identifiers. DynamoDB remains the canonical checkpoint store. Physical checkpoint truth is not delegated to agent memory.

## Live Ring path

```text
Ring Playground OAuth
→ device discovery
→ WHEP session
→ live video
→ frame capture
→ Nova 2 Lite
→ validated PSP
→ deterministic SAVE / DIFF / VERIFY
```

Raw media is not persisted by the checkpoint path. REWIND stores semantic state rather than footage.

> **Remember the state. Forget the footage.**

## Ring event verification path

```text
motion_detected webhook
→ verify exact raw-body HMAC signature
→ validate Ring event envelope
→ suppress duplicate request IDs
→ acknowledge quickly
→ trigger fresh Ring/Nova observation
→ deterministic Rewind verification
```

Manual **Check Again** remains an independent verification fallback.

## Controlled Demo boundary

The Ring Playground proves the real integration path, but it does not provide a reliable way to rearrange a physical scene into known baseline, messy, partial, and restored configurations.

For repeatable product-loop evaluation, REWIND therefore uses clearly labeled server-owned semantic fixtures:

```text
Demo Ready → Messy → Partial → Restored
```

Controlled Demo states pass through the same checkpoint, diff, restoration-plan, and verification engines as the live product path. They are never presented as live Ring camera observations.

## Package boundaries

### `packages/physical-state-protocol`
Owns PSP types, schema, validation, normalization, and canonical fixtures.

### `packages/vision`
Owns the Nova 2 Lite perception contract, multimodal request construction, strict output parsing, validation, and perception evaluation.

### `packages/ring`
Owns Ring configuration, API client, WHEP lifecycle, live preview, frame capture, webhook/event handling, account-linking support, and the trusted observation bridge.

### `packages/checkpoints`
Owns checkpoint contracts, stable state hashes, persistence, and DynamoDB-backed checkpoint storage.

### `packages/diff-engine`
Owns deterministic semantic comparison and match scoring.

### `packages/restore-engine`
Owns deterministic restoration planning and verification progress.

### `packages/agent-tools`
Owns the SDK-neutral trust boundary around approved REWIND operations.

### `packages/agent-orchestrator`
Owns Strands orchestration, critical-intent guards, and AgentCore session continuity.

### `packages/mcp-server`
Owns the MCP surface and authentication boundary. The MCP engineering gate is complete; live Alexa+ onboarding is deferred because the current Add-on/MCP developer tooling is restricted to select partners.

### `packages/evaluation`
Owns Phase 11 trial recording, aggregation, measured-latency handling, and evaluation reporting.

## Data ownership

```text
DynamoDB
└── canonical semantic checkpoints

AgentCore Memory
└── short-term conversation + operational identifiers

Server runtime
└── fresh observations + active Rewind sessions

Browser
└── presentation and user controls only
```

Browser-supplied semantic state is not accepted as authoritative physical truth.

## Phase 11 validation snapshot

- 5 Controlled Demo runs.
- 2 Live Ring observation/save/compare runs.
- 7 total trials.
- 100% pass rate.
- 100% object accuracy in the recorded run set.
- 100% Controlled Demo diff accuracy.
- 100% verification success.
- 0 Nova, Ring, tool, or verification failures.
- 21,615 ms average measured Controlled Demo end-to-end latency across 2 measured runs.

The two Live Ring runs used a stable unchanged scene and reached 100% match. They validate the real Ring → frame → Nova → semantic-state → compare path; they do not claim physical rearrangement testing.
