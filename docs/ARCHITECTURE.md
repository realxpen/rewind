# REWIND Architecture

## Core principle

> **AI interprets state. Deterministic code compares state.**

REWIND separates probabilistic perception from restoration truth. Nova interprets visual observations. Deterministic TypeScript decides what changed, what action is needed, what progress has been made, and whether the environment is restored.

## Judge-facing architecture

~~~mermaid
flowchart TB
    subgraph OBS["Observation sources"]
      R[Ring Developer Playground]
      P[Submission image]
    end

    R --> W[WHEP / WebRTC live frame]
    W --> O[Trusted observation bridge]
    P --> V[Server-side submission adapter]

    O --> N[Amazon Bedrock / Nova 2 Lite]
    V --> N

    N --> PSP[Physical State Protocol candidate]
    PSP --> VAL[Validate + normalize]
    VAL --> TS[Trusted semantic observation]

    TS --> SAVE[SAVE checkpoint]
    SAVE --> DDB[(Amazon DynamoDB)]

    TS --> CMP[Deterministic compareStates]
    DDB --> CMP
    CMP --> DIFF[PhysicalDiff + coverage + match]
    DIFF --> PLAN[Deterministic buildRestorePlan]
    PLAN --> HUMAN[Human performs action]
    HUMAN --> FRESH[Fresh visual observation]
    FRESH --> N
    CMP --> VERIFY[Deterministic verification]
    VERIFY --> DONE{RESTORED?}
    DONE -- No --> PLAN
    DONE -- Yes --> END[RESTORED]

    subgraph AGENT["AWS agent / voice layer"]
      STR[Strands Agent]
      MEM[AgentCore Memory]
      ASK[Alexa Custom Skill]
      LAM[AWS Lambda relay]
      MCP[Streamable HTTP MCP]
    end

    STR <--> MEM
    STR --> TOOLS[Approved REWIND tools]
    MCP --> TOOLS
    ASK --> LAM
    LAM --> TOOLS
    TOOLS --> SAVE
    TOOLS --> CMP
    TOOLS --> PLAN
    TOOLS --> VERIFY
~~~

## Evidence boundaries

### Live Ring — primary-track integration proof

~~~text
Ring Playground
→ WHEP live video
→ captured frame
→ Nova 2 Lite
→ validated semantic state
→ deterministic REWIND operations
~~~

### Image + Alexa — repeatable production submission flow

~~~text
uploaded image
→ Nova 2 Lite
→ validated semantic state
→ DynamoDB runtime state
→ Alexa request
→ deterministic DIFF / REWIND / VERIFY
~~~

This path is never labeled as Live Ring evidence.

### Controlled Demo — deterministic ground truth

~~~text
server-owned semantic fixtures
→ same checkpoint/diff/restore/verify engines
~~~

## Tracked-object negative evidence

Object omitted by the general vision pass does not equal object confirmed absent.

For a checkpoint object with present=true:

1. omission remains UNKNOWN;
2. REWIND runs focused checkpoint-driven contrastive audits;
3. visible same-category objects are supplied as distractors;
4. only explicit high-confidence absence evidence is admitted as present=false;
5. deterministic code turns present=true → present=false into a REMOVED diff.

No object name, color, or test image is hardcoded into the production decision.

## Trust boundaries

- Nova may propose semantic state but cannot bypass PSP validation.
- Only deterministic code may compare, score, plan, verify, or declare RESTORED.
- Strands/MCP/Alexa can choose approved operations but cannot override truth.
- DynamoDB owns canonical semantic checkpoints/runtime state.
- AgentCore Memory owns short-term conversation/session continuity.
- raw image/video is not checkpoint truth.

## Package ownership

- packages/physical-state-protocol — schema, types, validation, normalization, fixtures
- packages/vision — Nova contract, requests, parsing, validation
- packages/ring — Ring APIs, WHEP, observation, webhook/account-linking
- packages/checkpoints — checkpoint contracts and DynamoDB
- packages/diff-engine — deterministic comparison
- packages/restore-engine — planning and progress
- packages/agent-tools — approved operation boundary
- packages/agent-orchestrator — Strands, critical-intent guards, AgentCore
- packages/mcp-server — Streamable HTTP MCP/auth
- packages/alexa-skill — standard Alexa Custom Skill transport
- packages/evaluation — evaluation tooling
- api/[...path].ts — Vercel submission adapter + Alexa relay

## Privacy

> **Remember the state. Forget the footage.**

See docs/PRIVACY.md.
