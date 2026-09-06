# REWIND — Project State

_Last updated: 2026-09-06_

## Current phase

**Phase 0 — Compliance + Accounts**

Goal: remove external blockers before implementation.

## Locked product

**REWIND — Ctrl+Z for reality.**

Core MVP loop:

**SAVE → DIFF → REWIND → VERIFY**

Primary track: **Ring**

Additional target: **Alexa+** after the core restore loop works.

Mini-challenges: **AWS Builder + Open Source**.

## Phase 0 status

### Complete

- [x] Product concept and MVP scope locked.
- [x] Master PRD/build specification created.
- [x] Public GitHub repository created: `realxpen/rewind`.
- [x] MIT license present.
- [x] Node `.gitignore` present.
- [x] AWS account connectivity verified.
- [x] Amazon Bedrock connectivity verified.
- [x] Amazon Nova 2 Lite availability verified in `us-east-1`.
- [x] Real Nova 2 Lite inference successfully executed.
- [x] Google Drive REWIND workspace created.
- [x] Friction-log workspace created.
- [x] Devpost rules, judging criteria, dates, resources, and submission requirements reviewed.
- [x] User explicitly agreed to Devpost rules, terms, and eligibility statement.

### Remaining blockers

- [ ] Finish Devpost registration form.
- [ ] Replace AWS account-root development session with a least-privilege REWIND development identity/role.
- [ ] Request available hackathon AWS promotional credits.
- [ ] Verify Amazon Developer/Ring account access.
- [ ] Verify Ring Developer Playground/simulator access.

## Known Devpost requirements

- Public GitHub repository.
- Complete open-source license.
- Actual Ring technology usage in code/runtime for Ring submission.
- Ring demo may use a simulator; physical hardware is not required.
- Public English YouTube/Vimeo demo under three minutes.
- Product feedback for every Amazon tool/API/SDK used.
- AWS Builder requires documented AWS integrations.
- Open Source requires a qualifying public contribution/project during the hackathon window.
- Friction log can earn up to a 10% judging bonus.

## Judging criteria

1. Tech Implementation
2. Design
3. Potential Impact
4. Quality of the Idea

Each criterion is scored on a 5-point scale.

## Next phase

**Phase 1 — Repo + Core State Engine**

Implement:

- PSP schema
- TypeScript types
- state validator
- state normalizer
- deterministic diff engine
- restore planner
- progress/match engine
- controlled fixtures
- unit tests

### Phase 1 gate

Given two static Physical State Protocol fixtures:

```ts
compareStates(checkpoint, current)
```

must deterministically return the expected semantic changes and restoration plan.

No Ring dependency is required for this gate.

## MVP completion gate

The core MVP is complete only when this works without manually editing application data:

Create space → Connect Ring → Observe → Save checkpoint → Change environment → Observe again → Diff → Start Rewind → Guide action → Verify → Continue → **100% RESTORED**.
