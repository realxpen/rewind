# Submission Screenshot Plan

Do not publish browser screenshots that expose personal tabs, bookmarks, emails, secrets, tokens, AWS identifiers, or developer-console account data.

Capture clean crops or full-window shots with only REWIND/Alexa/Ring content visible.

## Required gallery images

### 1. Hero — REWIND in action

Show the public REWIND UI with Rewind a space selected, Vercel desk baseline, changed desk image, Alexa scene ready, and semantic entity chips.

Caption:

> REWIND turns a visual observation into semantic state that Alexa can use for deterministic restoration guidance.

### 2. Two-object DIFF

Show Alexa reporting:

> “I found 2 important changes from vercel desk baseline.”

Caption:

> Two tracked objects removed, two deterministic restore actions generated.

### 3. VERIFY / RESTORED

Show final Alexa restored result.

Caption:

> Fresh re-observation verifies that the saved semantic state has been restored.

### 4. Live Ring proof

Show the Ring Developer Playground live view together with the REWIND/Nova analysis result.

Add a visible **LIVE RING INTEGRATION PROOF** label.

Caption:

> Ring Playground → WHEP live frame → Nova 2 Lite → validated physical state.

### 5. Architecture

Use the Mermaid architecture in docs/ARCHITECTURE.md or export it as a clean image.

Caption:

> AI interprets state. Deterministic code compares state.

### 6. Physical State Protocol

Show the PSP package, JSON schema, a semantic fixture, and deterministic tests.

Caption:

> PSP v0.1 is the open semantic contract behind SAVE, DIFF, REWIND, and VERIFY.

## Privacy review

- [ ] no AWS access key/secret
- [ ] no Ring access token
- [ ] no Alexa relay secret
- [ ] no private email
- [ ] no personal browser tabs/bookmarks
- [ ] no misleading live-Ring label on photo evidence
