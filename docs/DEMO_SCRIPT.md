# REWIND — Final Demo Script

Target: **2:40–2:55**. Hard limit: under 3:00.

Primary track: **Ring**  
Mini challenges: **AWS Builder + Open Source**

The video must clearly distinguish the repeatable Image + REWIND Voice product demo from separate Live Ring integration proof.

## Recording rules

- Start with working product behavior, not a title card.
- Keep REWIND already open. The main restoration sequence stays inside the REWIND UI.
- Cut loading/waiting.
- Do not show secrets, AWS keys, Ring tokens, IDs, or relay secrets.
- Do not imply the uploaded-image sequence is a live Ring feed.
- Include the real Ring Playground path on-screen.
- Use only original/cleared audio.

## 0:00–0:10 — Hook

Screen: changed desk image already analyzed; red + turquoise notebooks absent.

Say:

> “This room used to look different. REWIND is Ctrl+Z for reality.”

Use the built-in REWIND Voice microphone: “Rewind this room to Vercel desk baseline.” The response should immediately report the two changes.

Show:

> “I found 2 important changes…”

## 0:10–0:38 — Real restore actions

Show the first REWIND Voice instruction:

> “Move notebook red on table main.”

Say “next step” in REWIND Voice and show the turquoise instruction.

Voiceover:

> “Nova interprets the latest visual state. Deterministic code compares it with the saved checkpoint and generates the restore actions.”

## 0:38–0:58 — Partial verification

Analyze the partial image: red restored, turquoise still missing.

Say “check again” in REWIND Voice.

Voiceover:

> “After a new observation, completed work disappears from the plan. REWIND doesn’t trust an old result.”

## 0:58–1:13 — Full restore

Analyze the original baseline image.

Say “check again” in REWIND Voice.

Show the real final response:

> “The important visible parts of Vercel desk baseline are restored. I don’t need a perfect pixel match to stop guiding you.”

Voiceover:

> “That is SAVE → DIFF → REWIND → VERIFY.”

## 1:13–1:28 — Actual Alexa integration proof

Briefly show the existing Alexa Custom Skill path and label it **ACTUAL ALEXA INTEGRATION**.

Voiceover:

> “REWIND Voice is the native web experience. We also built a real Alexa Custom Skill through AWS Lambda that calls the same deterministic REWIND engine.”

Do not spend the main demo switching back and forth to Alexa Tester.

## 1:28–1:50 — Primary-track proof: Live Ring

Clearly label on screen: **LIVE RING INTEGRATION PROOF**

Show:

~~~text
Ring Developer Playground
→ live WHEP video
→ captured frame
→ Nova semantic state
~~~

Voiceover:

> “The repeatable restore sequence used controlled images, but REWIND’s primary observation integration is real Ring. The Ring Developer Playground provides the device, live WHEP video, and frame used by the same Nova physical-state pipeline.”

Do not claim physical rearrangement in the Playground.

## 1:50–2:08 — Architecture

Show docs/ARCHITECTURE.md.

Voiceover:

> “The core rule is simple: AI interprets state; deterministic code compares state. Nova never decides that the room is restored.”

## 2:08–2:25 — AWS Builder

Show Bedrock + Nova 2 Lite, DynamoDB, Strands, AgentCore Memory, and Lambda.

Voiceover:

> “AWS handles perception, durable semantic checkpoints, agent orchestration, session continuity, and the Alexa relay while deterministic code keeps restoration truth auditable.”

## 2:25–2:40 — Open Source PSP

Show packages/physical-state-protocol, diff engine, restore engine, and tests.

Say:

> “We don’t store a room as just an image. The open Physical State Protocol represents environments as semantic state that software can validate, compare, and restore.”

## 2:40–2:50 — Privacy + impact

Say:

> “Remember the state. Forget the footage. REWIND can support studios, rentals, retail, classrooms, workshops, hospitality, and care environments where returning a space to a known state matters.”

## 2:50–2:55 — End

> “REWIND. Ctrl+Z for reality.”

## Required shots

- [ ] 2-change REWIND Voice result
- [ ] first restore action
- [ ] second next-step action
- [ ] partial verify
- [ ] final REWIND Voice restored response
- [ ] brief actual Alexa Custom Skill proof
- [ ] Live Ring Playground video
- [ ] Ring frame → Nova semantic output
- [ ] architecture diagram
- [ ] PSP source/tests
- [ ] AWS stack
- [ ] final REWIND end card
