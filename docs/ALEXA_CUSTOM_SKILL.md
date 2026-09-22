# Standard Alexa Custom Skill — Lambda Relay

REWIND uses a standard Alexa Skills Kit Custom Skill as the hackathon voice surface. Alexa is only the conversational interface. Ring + Nova observe the room and deterministic REWIND code decides what changed and what guidance is safe to speak.

## Architecture

```text
Alexa
  ↓
AWS Lambda (native Alexa endpoint)
  ↓ HTTPS + shared relay secret
ngrok
  ↓
local REWIND /alexa-relay
  ↓
RewindAgentToolService
  ↓
RingObservationBridge → Ring frame → Nova → PSP
  ↓
deterministic diff + restore plan
  ↓
Alexa response
```

The Lambda transport avoids exposing ngrok directly as the Alexa skill endpoint. The local `/alexa` endpoint remains available for direct ASK HTTPS testing, but the recommended hackathon path is Lambda.

## Local setup

Private `.env`:

```env
REWIND_ALEXA_SKILL_ID=amzn1.ask.skill.<your-skill-id>
REWIND_ALEXA_PORT=3005
REWIND_ALEXA_RELAY_SECRET=<long-random-secret>
```

Start REWIND:

```bash
npm run ring:preview
```

Then expose port 3005:

```bash
ngrok http 3005
```

Lambda must use:

```text
REWIND_RELAY_URL=https://<ngrok-host>/alexa-relay
REWIND_RELAY_SECRET=<same secret>
REWIND_ALEXA_SKILL_ID=<skill id>
```

## Lambda code

Deploy `packages/alexa-skill/lambda/index.mjs` with Node.js 22.x (or another Lambda runtime with global `fetch`).

Handler:

```text
index.handler
```

Configure the Alexa Custom Skill endpoint as the Lambda ARN in `us-east-1` for North America.

## Security boundaries

- Alexa invokes Lambda directly; ngrok is no longer the Alexa endpoint.
- Lambda validates the Alexa Skill ID before forwarding.
- Lambda forwards only the ASK envelope, never Ring media.
- The local relay requires `x-rewind-relay-secret` and compares it in constant time.
- The local skill validates the Skill ID again.
- Direct `/alexa` requests still use ASK signature + timestamp verification.
- The relay cannot inject physical truth; it only invokes the existing skill layer, whose tools still require fresh Ring observations.
- Secrets stay in local `.env` / Lambda environment variables and are never committed.

## Voice flow

Scans remain asynchronous because Ring + Nova can outlast Alexa's request deadline.

1. “Alexa, ask REWIND Memory to rewind to Clean Setup.”
2. Alexa responds immediately that REWIND is checking.
3. REWIND captures a fresh Ring observation in the background.
4. “Alexa, ask REWIND Memory what's next.”
5. Alexa speaks the deterministic restore guidance.
6. “Alexa, ask REWIND Memory to check again.”
7. User asks for status after the fresh verification finishes.

Invocation name: `rewind memory`.
