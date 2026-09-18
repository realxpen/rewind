# Standard Alexa Custom Skill — Hackathon Voice Surface

REWIND cannot currently rely on Alexa+ Add-on/MCP developer access, so the hackathon voice demo uses the standard Alexa Skills Kit (ASK) Custom Skill interface.

Alexa is only the conversational surface. Ring/Nova perception and deterministic REWIND code remain physical-state truth.

## Voice flow

```text
Alexa Custom Skill
        ↓
REWIND Alexa adapter
        ↓
RewindAgentToolService
        ↓
RingObservationBridge
        ↓
open REWIND preview requests fresh Ring capture
        ↓
Ring frame → Nova → PSP
        ↓
deterministic diff + restore plan
        ↓
Alexa reads one restore instruction at a time
```

## Why scans are asynchronous

Alexa custom skills have a short response deadline, while live Ring capture + Nova can take longer.

REWIND therefore does not block the Alexa request while it waits for vision.

Example:

1. User: "Alexa, ask REWIND Memory to rewind to Clean Setup."
2. Alexa: "I'm checking the room against Clean Setup. Ask me what's next in a moment."
3. REWIND requests a fresh Ring observation in the background.
4. User: "Alexa, ask REWIND Memory what's next."
5. Alexa: "I found four important changes. First, move the backpack beside the desk."
6. User changes the room.
7. User: "Alexa, ask REWIND Memory to check again."
8. REWIND captures fresh state again.
9. User asks for status and Alexa reads the updated guidance.

This keeps every Alexa response fast while preserving the fresh-state trust boundary.

## Supported intents

- `SaveCheckpointIntent` — remember a fresh Ring-observed state.
- `StartRewindIntent` — compare a fresh Ring observation with a saved checkpoint and begin guidance.
- `CheckAgainIntent` — trigger fresh verification.
- `StatusIntent` — report whether the background scan is pending, failed, or ready and read current guidance.
- `NextStepIntent` — read another pending restore instruction.
- `RepeatStepIntent` / `AMAZON.RepeatIntent` — repeat the last spoken response.
- `ListCheckpointsIntent` — list saved states.
- standard Help / Stop / Cancel intents.

The interaction model is at:

```text
packages/alexa-skill/interaction-model/en-US.json
```

## Local configuration

Copy the Alexa variables from `.env.example` into your private `.env`:

```env
REWIND_ALEXA_SKILL_ID=amzn1.ask.skill.<your-skill-id>
REWIND_ALEXA_PORT=3005
```

Never commit credentials or tokens.

Start the normal REWIND stack:

```bash
npm install
npm run ring:preview
```

When `REWIND_ALEXA_SKILL_ID` is configured, the same process also starts:

```text
http://127.0.0.1:3005/alexa
```

The endpoint verifies Alexa request signatures and timestamps using Amazon's ASK SDK verifier.

## Alexa Developer Console setup

1. Create a Custom Skill named REWIND.
2. Use invocation name `rewind memory`.
3. Import/build the interaction model from `packages/alexa-skill/interaction-model/en-US.json`.
4. Copy the Skill ID into `REWIND_ALEXA_SKILL_ID`.
5. Expose local port 3005 through an HTTPS tunnel.
6. Set the Custom Skill HTTPS endpoint to:
   ```text
   https://<your-tunnel-host>/alexa
   ```
7. Keep the REWIND preview open so the Ring observation bridge can satisfy Alexa-triggered fresh-state requests.
8. Use the Alexa Developer Console Test tab to run the voice journey.

## Demo phrases

```text
Alexa, open REWIND Memory.

Alexa, ask REWIND Memory to remember this room as Clean Setup.

Alexa, ask REWIND Memory what's the status.

Alexa, ask REWIND Memory to rewind to Clean Setup.

Alexa, ask REWIND Memory what's next.

Alexa, ask REWIND Memory for the next step.

Alexa, ask REWIND Memory to check again.

Alexa, ask REWIND Memory what's the status.
```

## Security / trust boundaries

- Alexa cannot submit physical-state JSON, match percentages, restore plans, or a RESTORED decision.
- Every save, rewind, and verification operation depends on the existing server-owned Ring observation bridge.
- The skill validates the configured Alexa Skill ID.
- The HTTP adapter verifies ASK signatures and timestamps.
- Raw Ring media does not enter the Alexa adapter.
- The adapter only speaks deterministic REWIND results.
- Physical uncertainty is spoken as uncertainty rather than being converted into fake restore instructions.

## Product wording

The skill intentionally does not require pixel-perfect 100% restoration.

If no actionable differences remain, Alexa can say:

> The important visible parts of Clean Setup are restored. I don't need a perfect pixel match to stop guiding you.

If only uncertain evidence remains, Alexa explains that the room needs another look instead of claiming a change.
