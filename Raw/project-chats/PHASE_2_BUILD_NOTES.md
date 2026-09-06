# Phase 2 Build Notes — 2026-09-06

Captured from the REWIND project build conversation.

## Input decision

Existing uploaded images were UI/moodboard/reference screenshots rather than controlled room-state scenes. They were not used as Nova benchmark ground truth.

## Phase 2 implementation decision

Build the model boundary before Ring:

`controlled image → Nova → candidate JSON → Zod → PSP validator → normalizer → deterministic engine`

## AWS tooling friction

During the Phase 2 implementation session, the ChatGPT AWS Core connector became unavailable while attempting an AWS documentation/live-runtime check.

This does not invalidate the previously proven Nova text inference. It means the Phase 2 multimodal gate must remain pending until a real image invocation can be rerun.

## Evidence discipline

Do not record a mocked/unit parser result as a successful Nova vision result. The live gate requires an actual Bedrock/Nova multimodal response.
