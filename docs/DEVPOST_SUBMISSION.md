# Devpost Submission Draft — REWIND

Hackathon: **Build, Ship, Shape: Amazon Developer Hackathon**  
Primary track: **Ring**  
Mini challenges: **AWS Builder + Open Source**

Submission deadline: **October 23, 2026, 12:00 PM Pacific Time**.

## Project name

REWIND

## Tagline

**Ctrl+Z for reality.**

## Elevator pitch

REWIND lets people save semantic checkpoints of physical spaces, understand what changed, and receive AI-guided, visually verified instructions for restoring those spaces to a previous state.

## Full project story

### Inspiration

Computers let us save, compare, undo, restore, and inspect history. Physical spaces do not.

REWIND asks: what if a room could have a checkpoint?

Instead of treating a camera only as a security sensor or video archive, REWIND turns visual observations into structured physical state. A user can save a space, let reality change, ask what changed, and receive step-by-step guidance until the saved state is restored.

### What it does

REWIND implements **SAVE → DIFF → REWIND → VERIFY**.

- SAVE captures a visual observation, converts it into semantic state, and persists a checkpoint.
- DIFF compares a fresh observation with that checkpoint using deterministic TypeScript.
- REWIND generates ordered human restoration actions from confirmed semantic differences.
- VERIFY re-observes the scene and recomputes progress until no meaningful differences remain.

Humans remain the actuator. REWIND supplies perception, memory, comparison, guidance, and verification.

### How we built it

The primary Ring integration uses the Ring Developer Playground and WHEP live video:

~~~text
Ring Playground
→ WHEP live frame
→ Amazon Bedrock / Nova 2 Lite
→ Physical State Protocol
→ deterministic diff
→ restore planner
→ fresh verification
~~~

The judge-facing submission adapter provides a repeatable Image + Alexa version of the same restoration loop and is labeled separately from Live Ring proof.

The core architecture rule is:

> **AI interprets state. Deterministic code compares state.**

Nova never decides whether the environment is restored. Deterministic code owns comparison, match scoring, restore planning, action verification, and the final RESTORED state.

AWS components include Bedrock + Nova 2 Lite, DynamoDB, Strands, AgentCore Memory, and Lambda.

### Reliability work

REWIND refuses to interpret vision omission as proof of removal.

For tracked checkpoint objects, a missing entity remains UNKNOWN unless focused contrastive Nova audits produce explicit high-confidence evidence that the saved support area is visible and the object is absent.

The final production regression removed two tracked notebooks simultaneously and produced two explicit absent states, two deterministic restore actions, partial verification, and final restored verification.

### Ring track proof

REWIND has real Ring runtime integration in code and live testing: device discovery, WHEP live view, frame capture, Nova semantic observation, Ring-backed save/compare, signed motion webhook verification, and Ring-backed agent/MCP operation.

The demo video will show this live Ring Playground proof directly.

### Challenges

The Ring Playground does not expose deterministic physical rearrangement controls. We solved this by keeping evidence boundaries explicit:

- Live Ring proves the real Ring transport/perception path.
- Image + Alexa proves the repeatable production restoration interaction.
- Controlled fixtures prove deterministic behavior under known ground truth.

A second challenge was negative visual evidence, solved by keeping omission UNKNOWN and requiring explicit high-confidence consensus before absence becomes deterministic truth.

### What we learned

The useful abstraction is not object detection. It is **physical state**.

Once a physical environment is represented semantically, software can reason about checkpoints, differences, restoration actions, progress, and verification without pixel-perfect matching.

### What's next

Multi-camera checkpoints, richer cross-view identity, production multi-user spaces, history/timeline UX, public Alexa+ integration when available, and a standalone reusable PSP package.

## Built with

Ring Developer APIs / Playground, WHEP/WebRTC, Amazon Bedrock, Amazon Nova 2 Lite, Amazon DynamoDB, Strands Agents SDK, Amazon Bedrock AgentCore Memory, AWS Lambda, Alexa Skills Kit, MCP/Streamable HTTP, TypeScript, Node.js, Vercel.

## Links

- Repository: https://github.com/realxpen/rewind
- Public demo: https://rewind-rho-dun.vercel.app

## Custom-field draft

- Primary Track: Ring
- Repository URL: https://github.com/realxpen/rewind
- Project status: New
- AWS Builder: Yes
- Open Source: Yes
- Open Source contribution URL: https://github.com/realxpen/rewind/pull/21
- Open Source project repo: https://github.com/realxpen/rewind
- GitHub username: realxpen
- Testing link: https://rewind-rho-dun.vercel.app
- Friction log: https://github.com/realxpen/rewind/blob/main/docs/FRICTION_LOG.md
- Submitter type, organization, residence, and required eligibility attestations: confirm personally before final submission.

## AWS Builder answer

REWIND uses Amazon Bedrock/Nova 2 Lite for visual state extraction, DynamoDB for semantic checkpoints/runtime state, Strands for approved tool orchestration, AgentCore Memory for short-term session continuity, and Lambda for the Alexa relay. Deterministic TypeScript owns comparison, restore planning, progress, and RESTORED.

## Open Source mini-challenge answer

REWIND introduces **Physical State Protocol v0.1**, an open semantic representation for describing, comparing, and restoring physical environments. The repository contains JSON schema, TypeScript types, normalization/validation, deterministic diffing, restoration planning, fixtures, tests, and documentation.

Direct contribution: https://github.com/realxpen/rewind/pull/21

The PR publishes a standalone PSP v0.1 guide on a public branch and is intentionally left open as a distinct hackathon contribution.

## Feedback

Use docs/PRODUCT_FEEDBACK.md for Feedback Questions 1–5.

## Video

Required: public YouTube or Vimeo, English, under 3 minutes.

Status: **PENDING RECORDING/UPLOAD**.

Use docs/DEMO_SCRIPT.md.
