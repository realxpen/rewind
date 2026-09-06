# Controlled Vision Fixtures

Phase 2 evaluates **image → Nova → PSP** independently from Ring.

The canonical semantic truth remains the TypeScript fixtures in:

`packages/physical-state-protocol/fixtures/studio.ts`

Controlled states:

- `demo-ready`
- `messy`
- `partial`
- `restored`

## Benchmark hygiene

The visual benchmark must not leak its answers to the model.

- Do **not** put semantic keys, object names, expected relations, state labels, or ground-truth text inside fixture images.
- Keep one fixed viewpoint and stable object appearance across states.
- Use the same 5–8 distinctive tracked objects.
- Know the semantic ground truth before inference.
- Do not tune the deterministic diff engine to compensate for model mistakes.
- Record model misses rather than manually editing Nova output.
- Treat the controlled benchmark as an integration gate, not a claim of arbitrary-room vision accuracy.

## Generate clean fixtures

A deterministic fixture generator is included:

```bash
python -m pip install Pillow
python fixtures/studio/vision/generate.py
```

It creates:

```text
fixtures/studio/vision/demo-ready.png
fixtures/studio/vision/messy.png
fixtures/studio/vision/partial.png
fixtures/studio/vision/restored.png
```

The generated images contain the physical scene only; they intentionally contain no answer labels.

## Run a real Nova observation

With AWS credentials for the least-privilege REWIND development identity:

```bash
AWS_REGION=us-east-1 \
BEDROCK_MODEL_ID=global.amazon.nova-2-lite-v1:0 \
npm run vision:fixture -- fixtures/studio/vision/demo-ready.png png demo-ready
```

The runner invokes Amazon Bedrock/Nova, parses the returned JSON through the production Zod + PSP validation path, normalizes it, and computes entity/relation/attribute recall against the canonical fixture truth.

Real Ring observations replace these controlled images in later phases.