# REWIND

> **Ctrl+Z for reality.**

REWIND is a spatial-AI system that lets people save semantic checkpoints of physical spaces, understand what changed, and receive AI-guided, visually verified instructions for restoring those spaces to a previous state.

Built for **Build, Ship, Shape: Amazon Developer Hackathon (2026)**.

- **Primary track:** Ring
- **Mini-challenges:** AWS Builder + Open Source
- **Current phase:** Phase 12 — Submission
- **Alexa+ status:** future/optional integration. The MCP surface is implemented, but live Alexa+ onboarding is not part of the hackathon submission because the current Add-on/MCP developer tooling is restricted to select partners.

## Core loop

**SAVE → DIFF → REWIND → VERIFY**

1. **SAVE** — observe a physical space and persist a semantic checkpoint.
2. **DIFF** — observe the space again and deterministically compare it with the checkpoint.
3. **REWIND** — generate an ordered restoration plan from the semantic differences.
4. **VERIFY** — observe again, recompute the diff, and continue until the deterministic engine reaches **100% RESTORED**.

## Architecture principle

> **AI interprets state. Deterministic code compares state.**

Amazon Nova 2 Lite never decides whether a room is restored. It converts visual observations into a structured candidate physical state. REWIND validates and normalizes that state, then deterministic TypeScript performs comparison, restoration planning, progress scoring, and completion.

```text
Ring Playground
      ↓
WHEP live video
      ↓
Frame capture
      ↓
Amazon Bedrock / Nova 2 Lite
      ↓
Candidate Physical State Protocol (PSP)
      ↓
Validation + normalization
      ↓
Canonical semantic state
      ↓
Checkpoint in DynamoDB
      ↓
compareStates(checkpoint, current)
      ↓
PhysicalDiff[]
      ↓
buildRestorePlan()
      ↓
Human action
      ↓
Fresh Ring/Nova observation
      ↓
updateRestoreProgress()
      ↓
100% RESTORED
```

## What is implemented

### Ring → Nova perception

REWIND connects to the Ring Developer Playground, discovers the synthetic Ring device, creates a WHEP session, renders live video in the browser, captures a frame, sends that frame to Amazon Bedrock / Nova 2 Lite, and validates the returned semantic state.

Raw Ring media is not persisted by the preview path.

### Physical State Protocol v0.1

The open-source PSP layer defines the machine-readable state contract used between perception and deterministic reasoning:

- JSON Schema and TypeScript types;
- validation and normalization;
- semantic entities, attributes, and relations;
- deterministic diff categories including `ADDED`, `REMOVED`, `MOVED`, `ATTRIBUTE_CHANGED`, `UNCHANGED`, and `UNKNOWN`;
- match/progress calculation;
- restoration planning and verification.

Key APIs include `parseState()`, `normalizeState()`, `compareStates()`, `calculateMatch()`, `buildRestorePlan()`, `updateRestoreProgress()`, and `validateCheckpoint()`.

### SAVE — persistent checkpoints

Validated semantic checkpoints are stored in DynamoDB. The browser can reload and retrieve saved checkpoint summaries without persisting raw camera footage as checkpoint truth.

### DIFF — deterministic semantic comparison

A fresh Ring/Nova observation is compared against the selected saved checkpoint using `compareStates()`. The model cannot declare a match or override the deterministic result.

### REWIND — restoration guidance

`buildRestorePlan()` converts meaningful semantic differences into human-readable restoration actions. Low-confidence or `UNKNOWN` state is surfaced for re-observation instead of inventing an action.

### VERIFY — fresh observation before completion

Each verification step obtains a fresh trusted observation and recomputes progress against the same checkpoint. Only the deterministic path may declare `RESTORED`.

### Ring event verification

REWIND also implements the Ring webhook/event boundary with:

- raw-byte HMAC-SHA256 signature verification;
- constant-time signature comparison;
- Ring v1.1 envelope validation;
- duplicate request suppression;
- fast webhook acknowledgement;
- motion-triggered fresh observation and deterministic Rewind verification;
- manual **Check Again** as an independent fallback.

### Strands + AgentCore

REWIND exposes approved physical-state operations as agent tools while preserving the same trust boundary.

The agent may choose which approved tool to call and when, but it may not invent physical state, mutate checkpoint truth, bypass `compareStates()`, or independently declare `RESTORED`.

The approved tool surface is:

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

Amazon Bedrock AgentCore Memory is used for short-term conversational/session continuity. DynamoDB remains the canonical checkpoint store.

### MCP engineering

REWIND includes a Streamable HTTP MCP surface covering the same approved operations. MCP engineering and authentication gates pass locally. Live Alexa+ onboarding is intentionally not claimed in this submission because the required Alexa+ developer tooling is currently partner-restricted.

## Demo modes

REWIND keeps two evidence paths deliberately separate.

### Live Ring

Used to prove the real integration path:

```text
Ring Playground → live frame → Nova → validated semantic state → compare
```

The final Live Ring evaluation used a stable unchanged scene and reached **100% match** in both recorded runs.

### Controlled Demo

Used to prove repeatable product behavior where the Ring Playground cannot provide deliberate physical rearrangements.

Server-owned validated semantic fixtures provide four clearly labeled states:

```text
Demo Ready → Messy → Partial → Restored
```

The controlled `Demo Ready → Messy` comparison contains six meaningful changes:

- chair moved;
- headphones moved;
- backpack moved;
- tripod missing;
- desk cluttered;
- lamp off.

Controlled Demo is never presented as live camera truth. It uses the same deterministic checkpoint, diff, rewind, and verification logic.

## Phase 11 evaluation

Final hackathon validation set:

- **5 Controlled Demo runs**
- **2 Live Ring runs**
- **7/7 PASS**
- **100% object accuracy** across the recorded set
- **100% diff accuracy** across the Controlled Demo change set
- **100% verification success**
- **21,615 ms average measured Controlled Demo end-to-end latency** across 2 measured runs
- **0 Nova failures**
- **0 Ring failures**
- **0 tool failures**
- **0 verification failures**
- **0 false RESTORED results**

The two Live Ring runs validate the real Ring → frame → Nova → semantic-state → compare path on an unchanged scene. They do **not** claim physical rearrangement testing.

A separate production **Image + Alexa** acceptance run on 2026-09-26 validated the submission path with two simultaneously removed tracked objects. Nova produced explicit `present=false` evidence for both at 0.95 confidence through a generic two-pass contrastive absence audit; deterministic comparison produced two changes; Alexa guided both restore actions; partial verification reduced the pending work; and the restored baseline reached the final RESTORED response. This photo-first acceptance is intentionally not presented as Live Ring evidence.

The tracked-absence mechanism is checkpoint-driven rather than object/image hardcoded: omission remains UNKNOWN, and a missing tracked object is admitted as absent only when two focused audits agree that its support area is visible and the object is absent at confidence >= 0.85.

See `docs/PHASE11_EVALUATION.md` and `docs/FRICTION_LOG.md` for the evaluation protocol, final run set, limitations, and developer friction observed during the build.

## Quick start

Requires **Node.js 22+**.

```bash
npm install
npm test
```

The full test suite covers the deterministic state engine, Nova perception contract, Ring integration boundaries, SAVE, DIFF, REWIND, event verification, Strands/AgentCore trust boundaries, MCP engineering, and Phase 11 evaluation aggregation.

Useful commands:

```bash
# Build
npm run build

# Full test suite
npm test

# Live Ring preview
npm run ring:preview

# Ring playground smoke test
npm run ring:smoke

# Controlled Strands agent flow
npm run agent:fixture

# AgentCore Memory continuity smoke test
npm run agentcore:smoke

# MCP fixture server / probe
npm run mcp:fixture
npm run mcp:probe

# Evaluation
npm run eval:record
npm run eval:summary
```

For local credentials and environment configuration, copy `.env.example` to `.env` and follow the project documentation. Do not commit AWS or Ring secrets.

## Technology

- Ring Developer Playground / Ring APIs
- WHEP / WebRTC
- Amazon Bedrock
- Amazon Nova 2 Lite
- Strands Agents SDK
- Amazon Bedrock AgentCore Memory
- Amazon DynamoDB
- TypeScript / Node.js
- Streamable HTTP MCP

## Privacy and trust

> **Remember the state. Forget the footage.**

REWIND is designed around semantic memory rather than video-history storage. Camera observations are converted into structured physical state, while restoration truth remains deterministic and auditable.

Core trust rules:

- raw media is not checkpoint truth;
- browser-supplied semantic state cannot become trusted physical truth;
- AI may interpret observations but may not declare restoration completion;
- fresh observations are required for truth-sensitive compare and verify operations;
- secrets remain server-side;
- duplicate/retried Ring events are suppressed before triggering repeated work.

## Project status

Phases **0–11 are complete**.

- Compliance + Accounts — **PASS**
- Core State Engine — **PASS**
- Nova Vision — **PASS**
- Ring Foundation — **PASS**
- SAVE — **PASS**
- DIFF — **PASS**
- REWIND — **PASS**
- Ring Event Verification — **PASS**
- Strands + AgentCore — **PASS**
- MCP Engineering — **PASS**
- Experience Polish — **PASS**
- Evaluation — **PASS**
- Submission — **IN PROGRESS**

See `PROJECT_STATE.md` for the detailed gate history.

## Documentation

- `PROJECT_STATE.md` — implementation and gate history
- `docs/PRD.md` — product requirements
- `docs/PHYSICAL_STATE_PROTOCOL.md` — semantic state contract
- `docs/ARCHITECTURE.md` — architecture and package boundaries
- `docs/TESTING.md` — testing strategy
- `docs/PHASE11_EVALUATION.md` — final evaluation protocol and results
- `docs/FRICTION_LOG.md` — Amazon/Ring developer friction and feature requests
- `AGENTS.md` — repository knowledge and AI-agent rules

## License

MIT © 2026 Ayomide Oladeji
