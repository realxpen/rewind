# Core State Engine — Validated Phase 1 Knowledge

## PSP v0.1

Stable semantic entity keys are used for the constrained MVP, for example:

- `chair.main`
- `tripod.camera`
- `backpack.black`
- `headphones.main`
- `lamp.left`

Supported semantic relations include:

`ON`, `UNDER`, `INSIDE`, `LEFT_OF`, `RIGHT_OF`, `BEHIND`, `IN_FRONT_OF`, `NEAR`, `ATTACHED_TO`, `OPEN`, `CLOSED`, `ON_STATE`, `OFF_STATE`, `CLEAR`, `OCCUPIED`.

## Confidence

Initial guidance:

- `>= 0.80` trusted;
- `0.60–0.79` uncertain;
- `< 0.60` unknown.

Prefer `UNKNOWN` over invented certainty.

## Diff contract

Outputs:

- `ADDED`
- `REMOVED`
- `MOVED`
- `ATTRIBUTE_CHANGED`
- `UNCHANGED`
- `UNKNOWN`

## Restore contract

Each meaningful diff becomes an independently verifiable human action. Completion is deterministic and must never show 100% while required high-confidence differences remain.

## Phase 1 proof

Static controlled fixtures reproduce the six planned demo changes and can progress through partial restoration to a deterministic 100% restored result.
