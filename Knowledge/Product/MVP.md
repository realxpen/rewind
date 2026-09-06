# MVP

## One remarkable interaction

The MVP proves:

**SAVE → DIFF → REWIND → VERIFY**

## Constraints

- one user;
- one physical space (`studio`);
- one fixed camera viewpoint;
- 5–8 visually distinctive objects;
- maximum three checkpoints;
- semantic rather than centimeter-perfect placement.

Recommended demo objects:

- desk;
- chair;
- headphones;
- backpack;
- tripod;
- lamp;
- laptop;
- bottles.

## Required change classes

- moved;
- missing/removed;
- added;
- state/attribute changed.

## Canonical checkpoint

`Demo Ready` should encode facts such as:

- desk clear;
- laptop centered/expected;
- chair behind desk;
- headphones on stand;
- tripod beside cabinet;
- backpack beside cabinet;
- lamp on.

## Canonical messy scene

Six deliberate headline changes:

- chair moved;
- headphones moved;
- backpack moved;
- tripod missing;
- desk cluttered;
- lamp off.

## MVP completion gate

The system must complete without manually editing application data:

Create space → Connect Ring → Observe → Save `Demo Ready` → Change environment → Observe → Diff → Start Rewind → Guide action → Verify → Continue → no meaningful differences remain → **100% RESTORED**.

Alexa+, AgentCore, and animations are not the MVP gate.
