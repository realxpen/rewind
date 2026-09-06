# Roadmap and Build Gates

Advance only when the previous gate passes.

## Completed

### Phase 0 — Compliance + Accounts

Gate passed: Ring Playground accessible, AWS credentials/identity usable, Nova inference works, repo exists.

### Phase 1 — Repo + Core State Engine

Gate passed: static PSP fixtures deterministically produce the expected semantic diff and restore plan.

## Next

### Phase 2 — Nova Vision

Image → Nova → structured candidate PSP → validation → normalization.

Gate: Nova consistently recognizes the chosen MVP objects, relations, attributes, and confidence behavior on controlled images.

## Later phases

3. Ring Foundation — device discovery/status/snapshot/media/live-stream proof.
4. Save — Ring observation → Nova → PSP → DynamoDB checkpoint.
5. Diff — current observation → PSP → deterministic comparison.
6. Rewind — restore session and 100% restored loop.
7. Ring Event Verification — motion-triggered verification with manual `Check Again` fallback.
8. Strands + AgentCore — orchestration and conversational continuity.
9. Alexa+ MCP — Streamable HTTP MCP tools after core reliability.
10. Experience Polish.
11. Evaluation and reliability testing.
12. Submission.

## Gate rule

Ring proof before Ring-dependent work. Vision proof before full workflow. SAVE before DIFF. DIFF before REWIND. REWIND before Alexa+. Core reliability before visual polish.
