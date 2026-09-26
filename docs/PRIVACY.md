# Privacy and Trust

> **Remember the state. Forget the footage.**

REWIND is designed around semantic memory rather than video-history storage.

## Stored

Canonical checkpoints contain structured physical state: entity key/category, selected stable attributes, relations, confidence, and checkpoint metadata.

The production photo adapter stores the resulting semantic observation in DynamoDB for the active workflow.

## Not checkpoint truth

- raw Ring video
- raw uploaded JPEGs
- browser-authored semantic state
- model-authored match percentages
- model-authored RESTORED decisions

The public photo flow sends the JPEG to Amazon Nova for interpretation and discards the raw image with the request. It persists semantic state only.

## Deterministic completion

~~~text
AI interpretation
→ schema validation
→ normalized semantic state
→ deterministic comparison
→ deterministic restoration plan
→ fresh observation
→ deterministic verification
~~~

## Secrets

Ring tokens, Ring client secrets, webhook HMAC secrets, Alexa relay secrets, and AWS credentials remain server-side and outside source control.

Production Vercel-to-AWS access uses OIDC rather than embedded long-lived AWS keys.

## Diagnostics

Emergency semantic diagnostic routes require the same server-side relay secret as the Alexa relay and are not publicly readable.

## Agent memory

AgentCore Memory stores conversation/session continuity only. DynamoDB remains canonical checkpoint truth.

## Human control

REWIND does not physically move objects. The human performs restoration actions. REWIND observes, compares, guides, and verifies.
