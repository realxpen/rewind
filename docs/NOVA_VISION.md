# Nova Vision — Phase 2

## Goal

Convert one controlled physical-space image into a valid normalized PSP document.

```text
image
→ Amazon Bedrock Converse
→ Amazon Nova 2 Lite
→ candidate JSON
→ Zod boundary validation
→ PSP validation
→ normalizeState()
→ deterministic Phase 1 engine
```

The master architecture rule remains:

**AI interprets state. Deterministic code compares state.**

## Runtime package

`packages/vision`

Key responsibilities:

- build a strict observation-only prompt;
- construct a Bedrock Converse multimodal request;
- parse exactly one JSON object;
- reject schema drift;
- reject `spaceId` / `capturedAt` drift;
- run the existing PSP validator and normalizer;
- expose confidence-aware evaluation metrics;
- never let Nova declare the canonical diff or final RESTORED state.

## Model

Default:

`global.amazon.nova-2-lite-v1:0`

Region:

`us-east-1`

The model ID is injectable so deployment can use a different approved inference profile without changing perception logic.

## Confidence contract

- `>= 0.80`: trusted
- `0.60–0.79`: uncertain
- `< 0.60`: deterministic diff should become `UNKNOWN`

For tracked vocabulary objects whose presence cannot be established, the prompt instructs Nova to retain the expected key/category with low confidence and omit invented details. This avoids converting visual uncertainty into a false `REMOVED` result.

## Security and privacy

- credentials come from the AWS SDK default credential provider chain;
- no access key or secret is hard-coded;
- image bytes are sent server-side;
- raw model output is treated as untrusted;
- raw media should remain temporary in the eventual Ring flow.

## Local contract tests

```bash
npm install
npm run test:phase2
```

These tests do not call AWS. They prove the request shape, prompt contract, JSON extraction, Zod boundary, PSP validation, normalization, and evaluation calculations.

## Live fixture test

With least-privilege AWS credentials available:

```bash
AWS_REGION=us-east-1 \
BEDROCK_MODEL_ID=global.amazon.nova-2-lite-v1:0 \
npm run vision:fixture -- fixtures/studio/vision/demo-ready.png png
```

Do not manually edit the returned JSON before evaluation.

## Gate

Phase 2 is complete only after real Nova multimodal calls against controlled studio fixtures consistently produce valid PSP and meet the chosen recognition/relation targets. Passing mocked/unit tests alone does not close the phase.
