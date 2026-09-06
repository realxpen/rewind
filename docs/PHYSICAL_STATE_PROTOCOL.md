# Physical State Protocol (PSP) v0.1

PSP is REWIND's open semantic representation for describing, comparing, and restoring physical environments.

The architecture rule is simple:

> **AI interprets state. Deterministic code compares state.**

Nova will eventually produce candidate PSP documents from Ring observations. The PSP validator and normalizer convert that candidate into canonical structured state. The diff and restore engines operate only on validated state.

## State document

```json
{
  "schemaVersion": "0.1",
  "spaceId": "studio",
  "capturedAt": "2026-09-06T09:00:00.000Z",
  "entities": [
    {
      "key": "chair.main",
      "category": "chair",
      "confidence": 0.97,
      "relations": [
        { "type": "BEHIND", "target": "desk.main" }
      ]
    }
  ]
}
```

## Stable entity identity

The MVP intentionally avoids arbitrary object re-identification. Controlled demo objects use stable semantic slots such as:

- `chair.main`
- `tripod.camera`
- `backpack.black`
- `headphones.main`
- `lamp.left`

A stable key is not a claim that general-purpose object identity is solved. It is a checkpoint-to-current identity contract for a constrained space.

## Relations

PSP v0.1 supports:

`ON`, `UNDER`, `INSIDE`, `LEFT_OF`, `RIGHT_OF`, `BEHIND`, `IN_FRONT_OF`, `NEAR`, `ATTACHED_TO`, `OPEN`, `CLOSED`, `ON_STATE`, `OFF_STATE`, `CLEAR`, `OCCUPIED`.

Spatial relationships are preferred over raw pixel coordinates. `BEHIND desk.main` is useful to restoration; `x=682,y=410` is camera-specific and fragile.

## Attributes

Attributes store simple semantic facts as string, number, boolean, or null values.

Examples:

```json
{ "clear": true }
```

```json
{ "powered": false }
```

## Confidence and UNKNOWN

The core engine follows the repository confidence guidance:

- `>= 0.80` trusted
- `0.60–0.79` uncertain but retained
- `< 0.60` diff classification becomes `UNKNOWN`

The system must prefer `UNKNOWN` over invented certainty.

## Validation

`validatePhysicalState()` verifies schema version, `spaceId`, timestamp shape, unique keys, categories, confidence range, relation types, and attribute primitives.

`parseState()` throws on invalid state. `validateCheckpoint()` returns a boolean convenience result.

Machine-readable schema:

`packages/physical-state-protocol/schemas/physical-state.schema.json`

## Normalization

`normalizeState()` makes comparison independent of incidental ordering by trimming identifiers, lower-casing categories, and sorting entities, attributes, and relations.

`capturedAt` is intentionally not part of semantic equality.

## Diff semantics

`compareStates(checkpoint, current)` returns `PhysicalDiff[]`:

- `ADDED` — current entity absent from checkpoint;
- `REMOVED` — checkpoint entity absent from current state;
- `MOVED` — semantic spatial relations differ;
- `ATTRIBUTE_CHANGED` — attributes or non-spatial state relations differ;
- `UNCHANGED` — entity matches checkpoint;
- `UNKNOWN` — confidence or stable identity is insufficient.

An entity may produce more than one diff if it changed in more than one independent dimension.

## Restore planning

`buildRestorePlan()` converts actionable diffs into human instructions such as `Move chair main behind desk main.`, `Turn on lamp left.`, and `Clear desk main.` Each action includes a verification hint.

## Match/progress

`calculateMatch()` derives deterministic progress from the diff set. A restore is complete only when no unresolved or unknown differences remain.

`updateRestoreProgress()` marks actions `VERIFIED` only when their entities no longer appear as unresolved in the latest recomputed diff.

## Controlled fixtures

The repository includes four studio states:

- `fixtures/studio/demo-ready/state.json`
- `fixtures/studio/messy/state.json`
- `fixtures/studio/partial/state.json`
- `fixtures/studio/restored/state.json`

`demo-ready → messy` deterministically produces the six headline demo changes: chair moved, headphones moved, backpack moved, tripod missing, desk cluttered, and lamp off.

The tests separately cover `ADDED` and low-confidence `UNKNOWN` behavior.
