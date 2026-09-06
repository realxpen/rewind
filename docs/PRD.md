# REWIND — MVP PRD & Build Specification

## Product

**REWIND — Ctrl+Z for reality.**

Category: Spatial AI / Ambient Intelligence / Physical-State Computing

Hackathon: Build, Ship, Shape: Amazon Developer Hackathon

Recommended primary track: **Ring**

Additional track: **Alexa+** if the MCP integration is completed successfully

Mini-challenges: **AWS Builder + Open Source**

Core technologies: Ring APIs, Amazon Nova 2 Lite, Amazon Bedrock, Amazon Bedrock AgentCore, Strands Agents SDK, Alexa+ MCP

---

## 1. Product vision

Computers let us save, compare, undo, restore, and view history. Physical spaces do not.

REWIND introduces those primitives to the physical world.

A user can say:

> “Save this room as Demo Ready.”

REWIND observes the environment through Ring, converts what it sees into a structured semantic representation, and stores that representation as a checkpoint.

Later, after the room changes:

> “Rewind this room to Demo Ready.”

REWIND observes the room again, compares its present state to the checkpoint, determines what changed, creates a restoration plan, guides the person through the required actions, and verifies each change through the camera.

The product does not physically move objects. Humans remain the actuator. REWIND supplies perception, memory, reasoning, guidance, and verification.

**Core loop: SAVE → CHANGE → DIFF → RESTORE → VERIFY**

---

## 2. One-sentence description

REWIND lets people save semantic checkpoints of physical spaces, see exactly what changed, and receive AI-guided, visually verified instructions for restoring those spaces to a previous state.

---

## 3. Product differentiation

REWIND is not another motion-detection application, surveillance dashboard, generic smart-home assistant, photo-comparison application, reminder application, security alert system, robot, or mere object detector.

The core abstraction is the **Physical State Checkpoint**.

A room can possess:

- state;
- checkpoints;
- versions;
- semantic differences;
- restoration plans;
- verification;
- history.

The specific contribution is a conversational physical-state restoration system that captures semantic checkpoints, computes meaningful physical differences, generates restoration actions, and visually verifies that the environment has returned to its intended state.

---

## 4. Hackathon strategy

### Ring — primary

REWIND should demonstrate a creative non-security use of Ring. The project must genuinely use Ring APIs, SDKs, simulators, or devices at runtime. The MVP is designed simulator-first so a physical Ring device is not a dependency.

### Alexa+ — secondary

After the Ring restore loop works, expose REWIND through a self-hosted MCP server or Agent Skill. A direct MCP implementation must use MCP specification 2025-11-25 or later over Streamable HTTP. A simulated Alexa+ experience may be used if direct Alexa+ access becomes a blocker.

### AWS Builder

REWIND should demonstrate a multi-service AWS workflow:

Ring → observation → Amazon Nova → Physical State Engine → Strands orchestration → AgentCore Memory → restoration workflow → verification.

### Open Source

Open-source the **Physical State Protocol (PSP)** including schema, TypeScript types, normalization, semantic diff engine, fixtures, tests, examples, and restoration planning.

---

## 5. MVP definition

The MVP proves one interaction:

**SAVE → DIFF → REWIND → VERIFY**

Constraints:

- one user;
- one physical space;
- one fixed camera viewpoint;
- 5–8 visually distinctive objects;
- three checkpoints maximum;
- four difference types: moved, missing, added, state changed.

Recommended demo objects:

- chair;
- backpack;
- headphones;
- tripod;
- bottles;
- laptop;
- desk;
- lamp.

### Non-goals before submission

Do not attempt:

- autonomous robotics;
- centimeter-perfect placement;
- arbitrary whole-house understanding;
- multi-camera fusion;
- facial recognition;
- person identification;
- continuous human tracking;
- 24/7 video archives;
- SLAM;
- AR headsets;
- automatic smart-device control;
- complex billing;
- enterprise accounts;
- native mobile apps.

---

## 6. Primary user story

A creator prepares a studio for recording and saves it as `Demo Ready`.

REWIND observes:

- desk clear;
- laptop centered;
- chair behind desk;
- headphones on stand;
- tripod beside cabinet;
- backpack beside cabinet;
- lamp on.

Later, the chair/headphones/backpack move, two bottles appear, the tripod disappears, and the lamp is turned off.

The user asks REWIND to restore `Demo Ready`.

REWIND computes six differences, creates a restoration plan, guides the user one action at a time, re-observes after actions, and updates progress until the space reaches **100% MATCH — DEMO READY RESTORED**.

---

## 7. Core user stories

### US-01 — Save a checkpoint

The user can name and persist the current semantic state of a space.

Acceptance:

- obtain observation;
- extract structured state;
- validate state;
- persist checkpoint;
- confirm success.

### US-02 — See what changed

Compare current state with a checkpoint and categorize changes as added, removed, moved, or attribute-changed. Each uncertain difference includes confidence.

### US-03 — Start Rewind

Translate machine differences into simple physical instructions such as “Put the headphones back on the stand.”

### US-04 — Verify restoration

After the user changes the space, obtain a new observation, recompute state/diff, update action status, and update progress.

### US-05 — Complete restoration

Only mark a restore session `COMPLETED` when no required high-confidence differences remain.

### US-06 — Conversational control

Target commands include:

- “Save this room as Demo Ready.”
- “What changed?”
- “Rewind the studio.”
- “Check again.”
- “How much is left?”

---

## 8. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Connect to Ring runtime | P0 |
| FR-02 | Observe a space through Ring media | P0 |
| FR-03 | Analyze observation using Amazon Nova | P0 |
| FR-04 | Generate normalized Physical State | P0 |
| FR-05 | Save checkpoint | P0 |
| FR-06 | Compare checkpoint with current state | P0 |
| FR-07 | Generate semantic diff | P0 |
| FR-08 | Generate restoration actions | P0 |
| FR-09 | Verify restored state | P0 |
| FR-10 | Visual dashboard | P0 |
| FR-11 | Alexa+/MCP tools | P1 |
| FR-12 | AgentCore conversational memory | P1 |
| FR-13 | Ring motion-triggered verification | P1 |
| FR-14 | Checkpoint history | P1 |
| FR-15 | Delete checkpoint | P1 |
| FR-16 | Multiple spaces | P2 |
| FR-17 | Multiple cameras | P2 |
| FR-18 | Smart-device actuation | Future |

---

## 9. Architecture principle

**AI interprets state. Deterministic code compares state.**

Do not use an LLM as the full image-diff engine.

Flow:

```text
Image A → Nova → PhysicalState A
Image B → Nova → PhysicalState B
PhysicalState A + PhysicalState B → deterministic TypeScript diff
```

Benefits:

- repeatability;
- testability;
- explainability;
- fewer hallucinations;
- stronger demo reliability;
- reusable open-source code.

---

## 10. Physical State Protocol (PSP)

Example:

```json
{
  "schemaVersion": "0.1",
  "spaceId": "studio",
  "capturedAt": "timestamp",
  "entities": [
    {
      "key": "desk.main",
      "category": "desk",
      "confidence": 0.98,
      "attributes": { "clear": true }
    },
    {
      "key": "chair.main",
      "category": "chair",
      "confidence": 0.96,
      "relations": [
        { "type": "BEHIND", "target": "desk.main" }
      ]
    }
  ]
}
```

Preferred semantic relationships include:

`ON`, `UNDER`, `INSIDE`, `LEFT_OF`, `RIGHT_OF`, `BEHIND`, `IN_FRONT_OF`, `NEAR`, `ATTACHED_TO`, `OPEN`, `CLOSED`, `ON_STATE`, `OFF_STATE`, `CLEAR`, `OCCUPIED`.

The MVP should use stable categories, semantic slots, relative relationships, and visually distinctive objects. Return `UNKNOWN` when identity or state cannot be established confidently.

---

## 11. Semantic diff engine

Input:

- checkpoint state;
- current state.

Output: `PhysicalDiff[]`.

Types:

- `ADDED`
- `REMOVED`
- `MOVED`
- `ATTRIBUTE_CHANGED`
- `UNCHANGED`
- `UNKNOWN`

Example:

```json
{
  "type": "MOVED",
  "entity": "chair.main",
  "expected": { "relation": "BEHIND desk.main" },
  "actual": { "relation": "LEFT_OF desk.main" },
  "confidence": 0.93
}
```

---

## 12. Restoration planner

The diff engine feeds a restoration planner.

Example:

1. Move chair behind desk.
2. Put backpack beside cabinet.
3. Return tripod beside cabinet.
4. Remove bottles from desk.
5. Turn on left lamp.

Each action must be independently verifiable.

Restore session state machine:

```text
IDLE
→ OBSERVING
→ COMPARING
→ DIFF_READY
→ GUIDING
→ WAITING_FOR_CHANGE
→ VERIFYING
→ GUIDING ...
→ RESTORED
```

Failure states:

- `OBSERVATION_FAILED`
- `LOW_CONFIDENCE`
- `CAMERA_UNAVAILABLE`
- `MODEL_FAILED`
- `CHECKPOINT_NOT_FOUND`
- `CANCELLED`

---

## 13. Amazon Nova / Bedrock

Recommended perception model: **Amazon Nova 2 Lite**.

Use it for object extraction, semantic relationships, room-state interpretation, attribute detection, confidence, and structured state output.

Observation contract:

- provide a stable frame/snapshot;
- provide known space context;
- optionally provide checkpoint vocabulary;
- require strict PSP JSON output;
- only report visually supported facts;
- do not infer invisible objects;
- do not invent identities;
- prefer semantic relations over raw coordinates;
- use `UNKNOWN` when uncertain;
- validate output before persistence.

Amazon Bedrock is the production model gateway and should handle model invocation, retries, metrics, and standardized inference access.

---

## 14. Strands and AgentCore

Strands orchestrates user intent and tool sequencing. It must not replace deterministic state logic.

Agent responsibilities:

- interpret request;
- choose checkpoint;
- initiate observation;
- request diff;
- start restore;
- explain next action;
- request verification;
- summarize completion.

AgentCore Memory stores conversational continuity and preferences.

**DynamoDB = canonical physical truth. AgentCore Memory = conversational context.**

---

## 15. Persistence

Recommended MVP persistence:

- `rewind-spaces`
- `rewind-checkpoints`
- `rewind-observations`
- `rewind-restore-sessions`

S3 is temporary media staging only.

Privacy flow:

```text
Ring frame → temporary media → Nova analysis → PSP persisted → raw media deleted
```

---

## 16. Ring integration

All Ring API calls are server-side.

Start simulator-first using Ring Developer Playground and the canonical Ring starter project. Initial integration proof should cover device discovery/status plus snapshot/media or live-view proof sufficient to demonstrate genuine Ring runtime usage.

MVP observation strategy should prefer snapshots/keyframes over continuous video because they simplify latency, cost, repeatability, testing, and checkpoint comparisons.

Motion-triggered verification is P1; a manual **Check Again** fallback must always exist.

---

## 17. Alexa+ / MCP

Expose REWIND tools through a self-hosted MCP server over Streamable HTTP.

Minimum planned tools:

- `list_spaces`
- `inspect_space`
- `save_checkpoint`
- `list_checkpoints`
- `compare_checkpoint`
- `start_rewind`
- `verify_rewind`
- `get_rewind_status`
- `cancel_rewind`

MCP is not part of the MVP gate. It is added after reliable REWIND completion.

---

## 18. Core REST surface

```text
GET    /api/health
GET    /api/ring/devices
GET    /api/ring/devices/:id
POST   /api/ring/webhook
POST   /api/ring/observe
GET    /api/spaces
POST   /api/spaces
GET    /api/checkpoints
POST   /api/checkpoints
GET    /api/checkpoints/:id
DELETE /api/checkpoints/:id
POST   /api/diff
POST   /api/restore
GET    /api/restore/:id
POST   /api/restore/:id/verify
POST   /api/restore/:id/cancel
GET    /api/events
POST   /mcp
```

---

## 19. Core data models

### Space

`id`, `name`, `cameraDeviceId`, `createdAt`, `updatedAt`

### Observation

`id`, `spaceId`, `source`, `capturedAt`, `state`, `stateHash`, `confidence`

### Checkpoint

`id`, `spaceId`, `name`, `observationId`, `state`, `stateHash`, `createdAt`

### PhysicalDiff

`id`, `checkpointId`, `currentObservationId`, `changes[]`, `score`, `createdAt`

### RestoreSession

`id`, `spaceId`, `checkpointId`, `status`, `actions[]`, `completionPercentage`, `startedAt`, `completedAt`

### RestoreAction

`id`, `type`, `entityKey`, `instruction`, `expectedState`, `status`, `confidence`

Action statuses: `PENDING`, `COMPLETED`, `UNCERTAIN`, `BLOCKED`.

---

## 20. Match score

Initial conceptual weighting:

- correct item existence: 30%
- correct semantic position: 40%
- correct state/attributes: 20%
- scene-level assertions: 10%

Never show 100% while any required high-confidence assertion remains unresolved.

---

## 21. Frontend and screens

Recommended frontend: Next.js + React + TypeScript.

Core screens:

1. **Space Dashboard** — current state, Ring status, checkpoints, Save / What changed? / Rewind.
2. **Live Observe** — camera area, recognized entities, confidence, optional semantic overlays.
3. **Save Checkpoint** — capture → understand → build physical state → save.
4. **Physical Diff** — change cards for moved/missing/added/state-changed.
5. **Rewind Mode** — restoration percentage, current instruction, action list, live preview.
6. **Restored** — full-screen 100% payoff.
7. **Judge/Debug** — explicit runtime proof for Ring, Bedrock, Nova, Strands, AgentCore, MCP, and current match state.

Design direction: **a version-control interface for reality**, not a generic smart-home dashboard.

---

## 22. Security and privacy

- Ring calls remain server-side.
- Secrets live in AWS/Vercel environment storage, never Git.
- Verify webhook signatures.
- HTTPS only.
- Validate model output.
- Validate MCP inputs.
- Apply least-privilege IAM.
- Sanitize logs.
- Never log access tokens.
- Delete temporary media.
- No facial recognition or sensitive human-attribute inference.

Principle: **Remember relationships, not recordings.**

---

## 23. AI failure handling

Initial threshold concept:

```text
>= 0.80   trusted
0.60–0.79 uncertain
< 0.60    unknown
```

The system should prefer uncertainty over false certainty. A low-confidence observation must never silently produce a false `RESTORED` state.

---

## 24. Fixture dataset

Create four controlled scenes before live integration:

- A — Demo Ready
- B — Messy with six deliberate changes
- C — Partial Restore
- D — Restored

Fixtures let us develop PSP, vision prompts, diff, restore planning, scoring, and tests independently of Ring. The final submission must still demonstrate genuine Ring runtime integration.

---

## 25. Testing

Unit tests:

- schema parsing;
- entity matching;
- relation matching;
- diff generation;
- restoration ordering;
- progress calculation.

Vision fixture tests:

- expected entities;
- expected relations;
- expected differences.

Integration tests:

- Ring device/snapshot/event/token failures;
- Bedrock valid response/invalid JSON/timeout/low confidence;
- MCP valid/invalid inputs and dependency failures.

E2E:

Save checkpoint → changed observation → diff → rewind → partial verification → full verification → `RESTORED`.

---

## 26. MVP success metrics

Controlled demo targets:

- ≥90% expected tracked objects recognized;
- at least 5 of 6 deliberate changes identified correctly;
- no false `RESTORED` result;
- interaction latency that feels responsive;
- repeatable E2E flow without manual database intervention.

---

## 27. Build phases

### Phase 0 — Compliance + Accounts

Remove external blockers: Devpost, AWS, Ring Playground, repo, license, credits, friction log.

### Phase 1 — Repo + Core State Engine

PSP, fixtures, normalizer, diff engine, restore planner, match/progress engine.

**Gate:** static PSP fixtures produce correct deterministic changes.

### Phase 2 — Nova Vision

Image → Nova → strict JSON → validation → normalized PSP.

**Gate:** chosen MVP objects/relationships are recognized consistently.

### Phase 3 — Ring Foundation

Device discovery/status/snapshot-media/live-stream proof.

**Gate:** judge/debug screen shows a genuine successful Ring runtime request.

### Phase 4 — Save

Ring observation → Nova → PSP → DynamoDB.

**Gate:** `Demo Ready` persists through reload.

### Phase 5 — Diff

Current observation → PSP → deterministic comparison.

**Gate:** known changed scene produces correct visual diff.

### Phase 6 — Rewind

Restore session, action plan, verification loop.

**Gate:** controlled restoration reaches 100% without manually changing app data.

### Phase 7 — Ring Event Verification

Motion-triggered verification plus Check Again fallback.

### Phase 8 — Strands + AgentCore

Natural-language requests sequence deterministic tools correctly.

### Phase 9 — Alexa+ MCP

MCP 2025-11-25+ Streamable HTTP and minimum rewind tools.

### Phase 10 — Experience Polish

Only after the core works: animation, overlays, responsive/error/empty states.

### Phase 11 — Evaluation

Repeat demo, collect accuracy/latency/failure metrics, maintain friction log.

### Phase 12 — Submission

README, architecture, screenshots, repo, demo, Devpost story, feedback, friction log, AWS Builder and Open Source material.

---

## 28. Development gate rule

Do not advance because work looks done.

- Ring proof before Ring-dependent product work.
- Vision proof before full workflow.
- SAVE before DIFF.
- DIFF before REWIND.
- REWIND before Alexa+.
- Core reliability before visual polish.

---

## 29. Final demo

The final controlled environment should contain approximately:

Desk, chair, headphones, backpack, tripod, lamp, bottles, laptop.

Create `Demo Ready`, then deliberately change exactly six known conditions.

The opening of the sub-three-minute video should show the product immediately:

> “Alexa, rewind the studio to Demo Ready.”

Then display six changes and visibly verify restoration actions until:

**100% MATCH — DEMO READY RESTORED**.

After the core demo, briefly show the architecture, PSP/open-source contribution, privacy model, and applications in hospitality, retail, studios, classrooms, workshops, and care environments.

---

## 30. Definition of done

The hackathon build is ready when:

- Ring is genuinely used at runtime;
- Amazon Nova interprets physical observations;
- checkpoints persist;
- physical state is structured rather than stored merely as an image;
- deterministic diff works;
- restoration actions are generated;
- re-observation verifies actions;
- complete restoration reaches 100%;
- dashboard clearly communicates the process;
- MCP tools work if Alexa+ is entered;
- AWS integrations are documented;
- public repo has a complete license;
- PSP is documented and tested;
- privacy behavior is documented;
- friction and product feedback are complete;
- demo is repeatable;
- final video is under three minutes;
- Devpost contains every required field.

## North star

User changes reality. REWIND sees the change. REWIND understands the difference. REWIND tells the user how to restore it. Reality changes again. REWIND verifies it.

**RESTORED.**
