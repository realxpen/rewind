# Physical State Protocol (PSP) v0.1

Physical State Protocol is REWIND's open semantic representation for describing physical environments in a form that software can validate, compare, and restore.

It is intentionally independent of any one camera, model, or assistant.

## Why PSP exists

Images are useful observations, but they are poor canonical state.

A restoration system needs a representation that can answer questions such as:

- Which entities are present?
- What stable attributes matter?
- Where are objects relative to one another?
- What is uncertain?
- What changed between two observations?
- What actions would restore the checkpoint?

PSP provides the semantic contract between visual perception and deterministic reasoning.

## Core shape

A PSP document contains:

- schemaVersion
- spaceId
- capturedAt
- entities

Each entity contains:

- key
- category
- confidence
- optional stable attributes
- optional semantic relations

Example:

~~~json
{
  "schemaVersion": "0.1",
  "spaceId": "studio",
  "capturedAt": "2026-09-26T16:00:00.000Z",
  "entities": [
    {
      "key": "table.main",
      "category": "table",
      "confidence": 0.99
    },
    {
      "key": "notebook.red",
      "category": "notebook",
      "confidence": 0.95,
      "attributes": {
        "present": true,
        "color": "red"
      },
      "relations": [
        {
          "type": "ON",
          "target": "table.main",
          "confidence": 0.95
        }
      ]
    }
  ]
}
~~~

## Supported relation vocabulary

PSP v0.1 includes relations such as:

- ON
- UNDER
- INSIDE
- LEFT_OF
- RIGHT_OF
- BEHIND
- IN_FRONT_OF
- NEAR
- ATTACHED_TO
- OPEN
- CLOSED
- ON_STATE
- OFF_STATE
- CLEAR
- OCCUPIED

The canonical JSON Schema is in:

schemas/physical-state.schema.json

## Package surface

The package exports:

- TypeScript types
- validation
- normalization
- zone helpers
- evidence helpers

Entry point:

src/index.ts

## Deterministic comparison

PSP itself is the state contract. REWIND's sibling packages build deterministic behavior on top of it:

- packages/diff-engine — semantic comparison and match/coverage
- packages/restore-engine — restoration planning and verification progress
- packages/checkpoints — checkpoint persistence and validation

The guiding rule is:

> **AI interprets state. Deterministic code compares state.**

A model can propose PSP. It cannot decide that the environment is restored.

## Confidence and uncertainty

PSP does not force uncertain visual evidence into a binary answer.

For example, if a tracked object is not emitted by a vision model, REWIND does not automatically call it removed. Omission remains UNKNOWN until explicit qualifying negative evidence exists.

This makes PSP suitable for systems where false restoration guidance would be worse than asking for another observation.

## Open-source goal

PSP is intended to be useful beyond REWIND for applications such as:

- space reset/checklists
- retail and hospitality setup verification
- workshops and studios
- classrooms
- accessibility/care environments
- robotics/human-in-the-loop restoration
- physical-world versioning experiments

## Tests

From the repository root:

~~~bash
npm install
npm test
~~~

Relevant PSP tests are under:

packages/physical-state-protocol/tests

## License

MIT, inherited from the repository root.

## Status

PSP is currently v0.1 and is intentionally small. The next likely extensions are multi-view identity, richer evidence provenance, and explicit versioned compatibility rules.
