# REWIND — Final Demo Script

Target: **2:40–2:55**. Hard limit: under 3:00.

Primary track: **Ring**  
Mini challenges: **AWS Builder + Open Source**

The video must clearly distinguish the repeatable Image + Alexa product demo from separate Live Ring integration proof.

## Recording rules

- Start with working product behavior, not a title card.
- Keep REWIND and Alexa Tester already open.
- Cut loading/waiting.
- Do not show secrets, AWS keys, Ring tokens, IDs, or relay secrets.
- Do not imply the uploaded-image sequence is a live Ring feed.
- Include the real Ring Playground path on-screen.
- Use only original/cleared audio.

## 0:00–0:10 — Hook

Screen: changed desk image already analyzed; red + turquoise notebooks absent.

Say:

> “This room used to look different. REWIND is Ctrl+Z for reality.”

Trigger Alexa to rewind to Vercel desk baseline, then ask status.

Show:

> “I found 2 important changes…”

## 0:10–0:38 — Real restore actions

Show first Alexa instruction:

> “Move notebook red on table main.”

Then ask for next step and show the turquoise instruction.

Voiceover:

> “Nova interprets the latest visual state. Deterministic code compares it with the saved checkpoint and generates the restore actions.”

## 0:38–0:58 — Partial verification

Analyze the partial image: red restored, turquoise still missing.

Ask Alexa to check again, then status.

Voiceover:

> “After a new observation, completed work disappears from the plan. REWIND doesn’t trust an old result.”

## 0:58–1:13 — Full restore

Analyze the original baseline image.

Ask check again + status.

Show the real final response:

> “The important visible parts of Vercel desk baseline are restored. I don’t need a perfect pixel match to stop guiding you.”

Voiceover:

> “That is SAVE → DIFF → REWIND → VERIFY.”

## 1:13–1:38 — Primary-track proof: Live Ring

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

## 1:38–1:58 — Architecture

Show docs/ARCHITECTURE.md.

Voiceover:

> “The core rule is simple: AI interprets state; deterministic code compares state. Nova never decides that the room is restored.”

## 1:58–2:18 — AWS Builder

Show Bedrock + Nova 2 Lite, DynamoDB, Strands, AgentCore Memory, and Lambda.

Voiceover:

> “AWS handles perception, durable semantic checkpoints, agent orchestration, session continuity, and the Alexa relay while deterministic code keeps restoration truth auditable.”

## 2:18–2:35 — Open Source PSP

Show packages/physical-state-protocol, diff engine, restore engine, and tests.

Say:

> “We don’t store a room as just an image. The open Physical State Protocol represents environments as semantic state that software can validate, compare, and restore.”

## 2:35–2:48 — Privacy + impact

Say:

> “Remember the state. Forget the footage. REWIND can support studios, rentals, retail, classrooms, workshops, hospitality, and care environments where returning a space to a known state matters.”

## 2:48–2:55 — End

> “REWIND. Ctrl+Z for reality.”

## Required shots

- [ ] 2-change Alexa result
- [ ] first restore action
- [ ] second next-step action
- [ ] partial verify
- [ ] final restored response
- [ ] Live Ring Playground video
- [ ] Ring frame → Nova semantic output
- [ ] architecture diagram
- [ ] PSP source/tests
- [ ] AWS stack
- [ ] final REWIND end card
