# Alexa, Alexa+ and MCP

REWIND contains two distinct assistant surfaces.

## Standard Alexa Custom Skill — working voice demo

The production voice demo uses Alexa Skills Kit:

~~~text
Alexa Custom Skill
→ AWS Lambda relay
→ HTTPS shared-secret boundary
→ REWIND Vercel runtime
→ DynamoDB semantic scene/checkpoint state
→ deterministic compare / restore / verify
→ Alexa speech response
~~~

The final production acceptance run proved two important changes, first restore instruction, next-step instruction, check-again verification, and final restored status.

See docs/ALEXA_CUSTOM_SKILL.md.

## Alexa+ MCP — engineering complete, live onboarding deferred

REWIND implements a Streamable HTTP MCP server with these approved tools:

- inspect_space
- save_checkpoint
- list_checkpoints
- compare_checkpoint
- start_rewind
- verify_rewind
- get_rewind_status
- cancel_rewind

The engineering gates passed with real Ring-backed observations and deterministic results.

Live Alexa+ Add-on/MCP onboarding is **not claimed**. Amazon/Devpost support confirmed that the relevant tooling path is currently restricted to select partners.

REWIND therefore remains a **Ring primary-track** submission. The MCP work is documented as an implemented future assistant-integration surface.

## Trust boundary

Alexa, Alexa+, Strands, and MCP can choose an approved REWIND operation. They cannot invent physical state, submit a match percentage, rewrite a checkpoint, fabricate a restore plan, or mark the room RESTORED.

Only deterministic REWIND code can make those decisions.
