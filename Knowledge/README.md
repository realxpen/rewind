# REWIND Knowledge Base

This directory contains **validated, reusable project knowledge** for humans and LLM agents.

## Domains

- `Product/` — vision, MVP, roadmap, product boundaries.
- `Research/` — validated findings about Ring, Nova/Bedrock, Alexa, competitors, experiments.
- `UX/` — experience principles, flows, screens, demo experience.
- `Technical/` — architecture, protocols, integrations, runtime contracts.
- `Business/` — hackathon strategy, use cases, market direction.
- `Decisions/` — locked decisions and decision history.

## Source precedence

When information conflicts, use this order:

1. `PROJECT_STATE.md` — live execution truth and current phase.
2. `Knowledge/Decisions/` — locked project decisions.
3. Implemented code + passing tests — actual behavior.
4. `Knowledge/` domain files — validated reusable understanding.
5. `docs/PRD.md` and other `docs/` — baseline specification and detailed documentation.
6. `Raw/` — evidence awaiting validation.
7. `Archive/` — historical context only.

`AGENTS.md` governs how AI agents must operate across all of these sources.

## Promotion rule

Nothing should move from Raw into Knowledge merely because it sounds plausible. Promote only after validation by source review, experiment, implementation, test, or explicit project decision.

## Staleness rule

When knowledge is replaced, move the old material to `Archive/Superseded/` or `Archive/Deprecated/`. Do not leave conflicting truths active in Knowledge.
