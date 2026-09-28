# Submission Screenshot Plan

Do not publish browser screenshots that expose personal tabs, bookmarks, emails, secrets, tokens, AWS identifiers, or developer-console account data.

Capture clean crops or full-window shots with only REWIND/Ring/Alexa proof visible. Keep photo evidence and Live Ring evidence explicitly labeled as different sources.

## Final gallery set

### 1. Hero — REWIND in action

Show the public REWIND UI with **Rewind a space** selected, an analyzed scene, semantic entity chips, the selected checkpoint, and the built-in **REWIND Voice** card in the same frame.

Caption:

> REWIND converts a visual observation into semantic state, compares it deterministically with a saved checkpoint, and guides restoration through REWIND Voice.

### 2. Cross-scene reliability — kitchen additions

Show the `empty kitchen` checkpoint with the changed kitchen result where REWIND Voice reports **2 important changes** and the first instruction is:

> Remove cup from the restored scene.

Caption:

> An unrelated kitchen scene adds two objects. Candidate-consensus evidence makes both additions actionable without object-specific production rules.

### 3. Final-step navigation

Show the next REWIND Voice instruction:

> Next, Remove kettle from the restored scene.

If space allows, include the following response after another **Next step**:

> That was the last pending step. Analyze another photo and say check again when you want me to verify the restoration.

Caption:

> Ordered guidance advances through the action set and stops after the final pending step instead of repeating it.

### 4. VERIFY / RESTORED

Show a fresh baseline re-analysis with the final REWIND Voice restored result.

Caption:

> Fresh visual evidence is re-compared with the checkpoint before REWIND declares the important visible state restored.

### 5. Live Ring proof

First capture the public REWIND **Live Ring Playground** proof mode so the evidence boundary is visible. For the strongest gallery image, pair or follow it with the secure local REWIND Ring console showing the moving Playground feed and the Nova/PSP result. Keep **LIVE RING INTEGRATION PROOF** visible.

Caption:

> Ring Developer Playground → WHEP live frame → Nova 2 Lite → validated Physical State Protocol.

### 6. Architecture

Export the architecture from `docs/ARCHITECTURE.md` as a clean image.

Caption:

> AI interprets state. Deterministic code compares state.

### 7. Physical State Protocol / Open Source

Show the PSP package, JSON schema, a semantic fixture, deterministic diff/restore tests, and the public contribution PR if the crop remains readable.

Caption:

> PSP v0.1 is the open semantic contract behind SAVE, DIFF, REWIND, and VERIFY.

## Capture rules

- use a clean browser window with unrelated tabs/bookmarks hidden;
- keep the REWIND logo/title and relevant state visible;
- crop away local file paths, account avatars, emails, tokens, request headers, and IDs;
- do not put a **LIVE RING** label on uploaded-photo evidence;
- do not call the web microphone experience Alexa; label it **REWIND Voice**;
- use the separate Alexa screenshot only as **ACTUAL ALEXA INTEGRATION** proof.

## Privacy review

- [ ] no AWS access key/secret
- [ ] no Ring access token
- [ ] no Alexa relay secret
- [ ] no private email
- [ ] no personal browser tabs/bookmarks
- [ ] no private account IDs
- [ ] no misleading Live Ring label on photo evidence
- [ ] REWIND Voice is not mislabeled as Alexa
