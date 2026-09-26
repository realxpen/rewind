# Product Feedback + Feature Requests

This document is the source for the hackathon feedback fields.

## Ring Developer Playground / Ring APIs / WHEP

**Used for:** device discovery, live-view sessions, WHEP/WebRTC video, frame acquisition, account-linking work, and motion/webhook verification.

**Worked well:** The Playground made it possible to prove a real Ring integration without physical hardware. The live-view path exposed enough capability to layer custom computer vision on Ring media.

**Needs work:** The scene is difficult for repeatable state-restoration tests because developers cannot deliberately rearrange known objects into baseline/changed/partial/restored states. Short-lived credentials also add restart friction.

**Onboarding:** Once credential and WHEP behavior were understood, the integration was usable.

**Build again?** Yes.

## Amazon Bedrock + Nova 2 Lite

**Used for:** visual interpretation of Ring frames and submission images into structured physical-state candidates.

**Worked well:** Nova extracted object identities, attributes, and relations and supported semantic rather than pixel-level restoration.

**Needs work:** Negative evidence is harder than positive detection. A general scene pass can omit an object instead of explicitly saying it is absent. REWIND added checkpoint-driven contrastive audits and keeps omission UNKNOWN.

**Onboarding:** Straightforward after AWS credentials/region were stable.

**Build again?** Yes, with validation and deterministic guardrails.

## DynamoDB

**Used for:** canonical semantic checkpoints and production runtime semantic state.

**Worked well:** Durable, simple server-side persistence and a good fit for semantic checkpoint documents.

**Needs work:** No major service friction; the application needed careful key namespaces so runtime records could not collide with checkpoints.

**Build again?** Yes.

## Strands Agents SDK

**Used for:** natural-language orchestration over a restricted set of REWIND operations.

**Worked well:** Tool-oriented orchestration fit REWIND's trust model.

**Needs work:** Critical intents still need explicit guards so stale conversational prose cannot replace a fresh authoritative tool result.

**Build again?** Yes.

## Amazon Bedrock AgentCore Memory

**Used for:** short-term conversation/session continuity.

**Worked well:** A fresh store instance could recover session context remotely.

**Needs work:** Documentation/examples should clearly distinguish conversational memory from canonical application truth.

**Build again?** Yes, for continuity.

## AWS Lambda + Alexa Skills Kit

**Used for:** the standard Alexa Custom Skill endpoint and secure relay into REWIND.

**Worked well:** Lambda cleanly separated Alexa transport from the restoration engine.

**Needs work:** Multi-hop voice debugging would benefit from stronger built-in intent/endpoint traces without temporary application logging.

**Build again?** Yes.

## MCP / Alexa+ developer tooling

**Used for:** a Streamable HTTP MCP surface with eight approved operations.

**Worked well:** MCP maps cleanly onto REWIND's existing tool boundary.

**Needs work:** Live Alexa+ Add-on/MCP onboarding was unavailable because the relevant tooling is restricted to select partners.

**Build again?** Yes when a public developer sandbox exists.

## Feature requests

### Critical — Public Alexa+ hackathon sandbox

Provide a public sandbox/onboarding route for Alexa+ MCP/Agent Skill developers so compliant servers can be tested live.

### Important — Ring Playground state scenarios

Add developer-selectable scene states or deterministic object-rearrangement controls.

### Important — Clear credential refresh workflow

Expose a first-class refresh/status path for Playground development credentials.

### Important — Structured negative-evidence examples for vision

Provide stronger examples for deciding that a tracked object is explicitly absent from a visible support area.

### Nice-to-have — Playground event + scene synchronization

Allow a known visual scene mutation to be triggered together with a motion/event webhook.
