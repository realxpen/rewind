# REWIND — Amazon Developer Friction Log

This log records meaningful friction encountered while building REWIND for the Amazon Developer Hackathon. It is evidence for product feedback, not a list of complaints. Each item includes the effect on the build and the workaround used.

## 2026-09-15 — Ring Playground cannot produce repeatable physical rearrangements

**Area:** Ring Developer Playground / live-view testing  
**Impact:** Medium — blocks a fully repeatable SAVE → physical change → DIFF → REWIND → VERIFY demonstration using only the Playground video scene.

The Playground successfully provided the real Ring integration path used by REWIND: device discovery, WHEP live video, frame capture, Nova observation, and semantic state. However, the available scene did not provide a developer control to pause/rearrange tracked physical objects into known baseline, changed, partial, and restored configurations. Natural scene variation was primarily transient wildlife, which REWIND intentionally excludes from restoration truth.

**Workaround:** REWIND keeps Live Ring as real integration proof and adds a clearly labeled Controlled Demo using server-owned validated semantic fixtures (`Demo Ready`, `Messy`, `Partial`, `Restored`). Controlled Demo is never presented as live Ring camera truth and passes through the same deterministic checkpoint/diff/restore/verification endpoints.

**Feature request:** A Playground scene-state control or predefined physical-state scenarios would make stateful-computer-vision applications easier to test end-to-end without external hardware.

---

## 2026-09-15 — Alexa+ MCP/Add-on developer tooling restricted to select partners

**Area:** Alexa+ Add-on / MCP onboarding  
**Impact:** High for optional Alexa+ integration; no impact on REWIND's primary Ring-track submission.

REWIND implemented an Alexa-compatible MCP surface, but the documented developer tooling path required access to an AWS role unavailable to the project account. Amazon/Devpost staff later confirmed that the Alexa+ MCP/Add-on tooling is currently limited to select partners and there is no public onboarding path for the hackathon project.

**Workaround:** Alexa+ was removed from the hackathon critical path. REWIND remains a Ring-track project and retains the MCP surface as a future assistant-integration extension. Submission materials must not claim Alexa+ was deployed or tested.

**Feature request:** Provide a hackathon sandbox/onboarding path for Alexa+ MCP or clearly mark partner-only requirements at the beginning of the developer setup flow.

---

## 2026-09-11 to 2026-09-15 — Short-lived local credentials increase restart friction

**Area:** Local development with AWS and Ring Playground credentials  
**Impact:** Low to Medium — recurring setup friction during multi-day testing.

AWS CLI sessions and Ring Playground access tokens can expire between development sessions. A fresh terminal also loses shell-exported configuration, which initially caused REWIND preview startup failures even though the application code was healthy.

**Workaround:** REWIND now loads stable non-secret local configuration from `.env`; AWS authentication is refreshed with `aws login --profile rewind-dev`; Ring access tokens are refreshed separately when expired. Secrets remain outside source control.

**Feature request:** Longer-lived hackathon sandbox sessions or a clearer local token-refresh workflow would reduce repetitive setup during iterative hardware/API testing.
