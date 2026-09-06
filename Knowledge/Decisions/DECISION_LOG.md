# REWIND Decision Log

## 2026-09-06 — Product identity

**Status: LOCKED**

Product name: **REWIND**. Tagline: **Ctrl+Z for reality.**

## 2026-09-06 — Core loop

**Status: LOCKED**

Primary experience: **SAVE → DIFF → REWIND → VERIFY**.

## 2026-09-06 — Architecture principle

**Status: LOCKED**

**AI interprets state. Deterministic code compares state.** Nova produces candidate PSP. Deterministic TypeScript owns diff, restoration progress, and completion.

## 2026-09-06 — Primary track

**Status: LOCKED**

Ring is the primary hackathon track. Alexa+ is secondary and should not precede a reliable core restore loop.

## 2026-09-06 — Simulator-first Ring strategy

**Status: LOCKED**

Hackathon success must not depend on obtaining supported physical Ring hardware. Use Ring Developers Playground/synthetic devices first.

## 2026-09-06 — Human as actuator

**Status: LOCKED**

No robotics in MVP. REWIND guides and verifies; the human physically restores the environment.

## 2026-09-06 — Privacy principle

**Status: LOCKED**

**Remember the state. Forget the footage.** Persist semantic state; keep raw media temporary by default.

## 2026-09-06 — Canonical storage

**Status: LOCKED**

DynamoDB is canonical application truth. AgentCore Memory is conversational context only. S3 is temporary media staging.

## 2026-09-06 — AWS identity

**Status: LOCKED**

Do not develop under the AWS root identity. Use least-privilege `rewind-dev`/deployment identities.

## 2026-09-06 — MVP identity strategy

**Status: LOCKED**

Use stable semantic slots and visually distinctive objects in a constrained fixed-viewpoint scene. Return `UNKNOWN` when confidence is insufficient rather than pretending general object re-identification is solved.

## 2026-09-06 — Phase-gated development

**Status: LOCKED**

Do not advance because a phase looks done. Advance when its gate passes.
