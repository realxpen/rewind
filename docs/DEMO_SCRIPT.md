# REWIND — Final Demo Video

Target: **2:40–2:50**. Hard limit: **under 3:00**.

Primary track: **Ring**  
Mini challenges: **AWS Builder + Open Source**

The main product sequence is **Image → Nova → REWIND Voice → deterministic DIFF → REWIND → VERIFY**. Actual Alexa and Live Ring proof appear separately and are labeled separately.

## Recording rules

- Start with the product already working; no title animation or biography.
- Record clean product footage first, then add the exact voiceover below.
- Cut every loading/waiting segment.
- Never expose AWS keys, Ring tokens, relay secrets, private email, or account IDs.
- Never call REWIND Voice “Alexa”.
- Never present uploaded-photo evidence as Live Ring evidence.
- Show actual Alexa and actual Live Ring proof as separate short segments.
- End before 2:50 so platform encoding cannot push the video beyond 3:00.

## Exact timeline and spoken script

### 0:00–0:09 — Hook + command

**Screen:** changed desk image is already analyzed in the public REWIND UI. The selected checkpoint is `vercel desk baseline`.

**Action:** use the built-in REWIND Voice microphone and say:

> “Rewind this room to vercel desk baseline.”

**Voiceover:**

> “This room changed. REWIND is Ctrl+Z for reality.”

Hold long enough to show **2 important changes**.

### 0:09–0:28 — Two deterministic restore actions

**Screen:** show the first REWIND Voice restore instruction. Then say:

> “Next step.”

Show the second instruction.

**Voiceover:**

> “Nova interprets the latest visual state. Deterministic TypeScript compares it with the saved checkpoint and turns confirmed differences into restore actions.”

### 0:28–0:45 — Partial verification

**Screen:** analyze the partial-restoration image. Then say:

> “Check again.”

Show that the completed action disappears and one action remains.

**Voiceover:**

> “Verification always uses a fresh observation. Completed work disappears from the plan instead of being trusted from memory.”

### 0:45–1:00 — RESTORED payoff

**Screen:** analyze the original baseline image, then say:

> “Check again.”

Hold on the real restored response.

**Voiceover:**

> “When no meaningful visible differences remain, deterministic verification ends the guidance. That is SAVE, DIFF, REWIND, VERIFY.”

### 1:00–1:13 — Separate actual Alexa proof

**On-screen label:** **ACTUAL ALEXA INTEGRATION**

**Screen:** show the Alexa Custom Skill / Lambda proof briefly.

**Voiceover:**

> “REWIND Voice is built into the website. Separately, we also built a real Alexa Custom Skill through AWS Lambda that calls the same deterministic REWIND engine.”

### 1:13–1:34 — Primary-track proof: Live Ring

**On-screen label:** **LIVE RING INTEGRATION PROOF**

**Screen:** in the public REWIND page, switch from **Image + REWIND Voice** to the new **Live Ring Playground** proof mode. Then open the already-running local REWIND Ring console, show the Ring Developer Playground WHEP video moving, capture a frame, and click **Observe with Nova**. Hold briefly on the validated semantic output.

**Before recording:** securely load the existing Ring environment in your shell and run `npm run ring:preview`. Do not show the terminal values; only show the clean browser console at `http://127.0.0.1:3002`.

**Voiceover:**

> “The repeatable restore sequence used controlled images. The primary observation integration is real Ring: Developer Playground to WHEP live video, to a captured frame, to Nova, to the same Physical State Protocol.”

Do not claim physical rearrangement in the Playground.

### 1:34–1:52 — Architecture rule

**Screen:** clean architecture diagram from `docs/ARCHITECTURE.md`.

**Voiceover:**

> “The trust boundary is simple: AI interprets state; deterministic code compares state. Nova can describe what it sees, but it never gets to declare reality restored.”

### 1:52–2:12 — AWS Builder

**Screen:** highlight Bedrock / Nova 2 Lite, DynamoDB, Strands, AgentCore Memory, and Lambda.

**Voiceover:**

> “Bedrock and Nova handle multimodal perception. DynamoDB stores semantic checkpoints. Strands orchestrates approved tools. AgentCore Memory keeps session context. Lambda powers the separate Alexa relay.”

### 2:12–2:31 — Open Source PSP

**Screen:** show `packages/physical-state-protocol`, diff engine, restore engine, tests, and PR #21.

**Voiceover:**

> “We open-sourced Physical State Protocol version zero point one: a semantic contract for describing, comparing, and restoring physical environments, with deterministic diffing, restore planning, fixtures, and tests.”

### 2:31–2:43 — Privacy + use cases

**Screen:** privacy line and a clean product view.

**Voiceover:**

> “The privacy principle is: remember the state, forget the footage. The same idea can support studios, rentals, retail, classrooms, workshops, hospitality, and care environments.”

### 2:43–2:48 — End

**Screen:** REWIND end card.

Say:

> “REWIND. Ctrl+Z for reality.”

## Required footage checklist

- [ ] 2-change REWIND Voice result
- [ ] first restore action
- [ ] second **Next step** action
- [ ] partial verify
- [ ] full REWIND Voice restored response
- [ ] separate actual Alexa Custom Skill proof
- [ ] public **Live Ring Playground** proof mode
- [ ] Live Ring Playground WHEP video in the secure local console
- [ ] Ring frame → Nova semantic output
- [ ] architecture diagram
- [ ] AWS stack
- [ ] PSP source/tests + PR #21
- [ ] final end card

## Optional evidence not required in the 2:48 cut

The unrelated kitchen two-added-object regression is strong gallery/Devpost evidence, but it does not need to consume video time. If included, replace—not add to—another segment so the final cut stays under 2:50.
