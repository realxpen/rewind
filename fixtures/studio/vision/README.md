# Controlled Vision Fixtures

Phase 2 evaluates image → Nova → PSP independently from Ring.

The canonical semantic truth remains the TypeScript fixtures in:

`packages/physical-state-protocol/fixtures/studio.ts`

Use four controlled visual states:

- `demo-ready`
- `messy`
- `partial`
- `restored`

## Rules

- Keep one fixed viewpoint.
- Use the same 5–8 distinctive tracked objects.
- Know the ground truth before inference.
- Do not tune the deterministic diff engine to compensate for model mistakes.
- Record model misses rather than silently editing Nova output.
- The synthetic/controlled benchmark is an integration gate, not a claim of arbitrary-room vision accuracy.

The live runner is:

```bash
npm run vision:fixture -- fixtures/studio/vision/demo-ready.png png
```

The binary controlled images are maintained as test assets. Real Ring observations arrive in Phase 3/4.
