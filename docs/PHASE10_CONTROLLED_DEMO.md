# Phase 10 — Controlled Restore Demo

REWIND has two intentionally separate observation experiences.

## 1. Live Ring

Use **Live Ring** to prove the real Ring integration:

```text
Ring Playground
→ WHEP live video
→ fresh frame capture
→ Amazon Nova 2 Lite
→ validated semantic state
```

This mode is real camera/simulator evidence. The Ring Playground scene may remain semantically unchanged even while its video continues to move. REWIND must not invent a difference just to make the demo interesting.

## 2. Controlled Demo

Use **Controlled Demo** to demonstrate the complete repeatable restoration loop when the Playground cannot provide controllable physical-object changes.

The browser can request only four named scenarios:

- `demo-ready`
- `messy`
- `partial`
- `restored`

The server maps those names to the validated semantic fixtures in `packages/physical-state-protocol/fixtures/studio.ts`. The browser cannot submit arbitrary physical state.

Each selected scenario becomes a normal server-issued trusted observation ID. From that point onward, the existing production logic is reused:

```text
server-owned fixture
→ trusted observation ID
→ DynamoDB checkpoint
→ deterministic compareStates()
→ deterministic buildRestorePlan()
→ deterministic updateRestoreProgress()
→ RESTORED only when match is 100%
```

## Judge demo sequence

1. Start **Live Ring** and briefly show the Ring Playground feed.
2. Explain: “This proves REWIND is really connected to Ring. The Playground does not let me rearrange this scene, so for a repeatable restore demonstration I switch to a clearly labeled controlled scenario.”
3. Select **Controlled Demo**.
4. Select **Demo Ready** and click **Save Demo Ready**.
5. Select **Messy** and click **Compare to Demo Ready**.
6. Confirm the deterministic diff, then click **Start Rewind**.
7. Select **Partial** and click **Check Again** to show incomplete progress.
8. Select **Restored** and click **Check Again**.
9. Finish on the **100% RESTORED** completion moment.

## Required disclosure

Never describe Controlled Demo as a live Ring observation. Recommended wording:

> Live Ring proves the camera integration. Controlled Demo uses server-owned validated semantic fixtures to make the SAVE → DIFF → REWIND → VERIFY sequence repeatable. The same deterministic state engine decides changes and restoration in both cases.

Do not claim that the Ring Playground itself can pause, move objects, or produce these fixture transitions.
