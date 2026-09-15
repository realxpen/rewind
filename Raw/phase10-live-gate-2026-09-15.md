# Phase 10 live experience gate — 2026-09-15

Status: **PASS**

Observed live product state:

- Phase 10 judge-facing UI rendered successfully at `http://127.0.0.1:3002`.
- Live Ring Playground video rendered inside the REWIND interface.
- Physical match stayed neutral (`—`) before deterministic comparison.
- Ask REWIND, checkpoint timeline, trust boundary, privacy copy, workflow rail, and restoration-confidence UI rendered correctly.
- Controlled Demo mode was added and visibly disclosed as server-owned validated semantic fixtures, not live Ring camera truth.
- Controlled Demo baseline save initially failed because the checkpoint name `Demo Ready (Controlled)` used parentheses rejected by the checkpoint-name validator.
- Checkpoint-name validation was corrected without weakening `spaceId` validation; regression coverage was added.
- User confirmed the corrected Controlled Demo flow worked.

Locked demo distinction:

```text
Live Ring
→ real camera/API integration proof

Controlled Demo
→ repeatable Demo Ready → Messy → Partial → Restored state proof
→ same deterministic checkpoint/diff/restore/verification endpoints
→ never presented as live Ring truth
```

Phase 10 gate result: **PASS**.
