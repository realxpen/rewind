# Phase 9 — Alexa+ MCP

Status: **IN PROGRESS**

External blocker: Alexa+ developer tooling role access is pending Amazon support case **52846821**. Do not broaden IAM permissions while that case is open.

## Locked rule

Alexa/MCP may choose an approved REWIND tool. It may not submit physical state, match percentages, restoration plans, or a `RESTORED` decision.

The authoritative path remains:

```text
Ring frame
→ Nova semantic observation
→ REWIND deterministic compare/restore code
→ MCP result
```

## MCP transport

REWIND exposes Streamable HTTP MCP at:

```text
http://127.0.0.1:3004/mcp
```

Approved tools:

```text
inspect_space
save_checkpoint
list_checkpoints
compare_checkpoint
start_rewind
verify_rewind
get_rewind_status
cancel_rewind
```

The Phase 9 minimum gate tools are:

```text
save_checkpoint
compare_checkpoint
start_rewind
verify_rewind
```

## Live Ring observation bridge

`npm run ring:preview` now starts three coordinated local surfaces:

```text
3002  Ring preview + Nova observation UI
3004  MCP Streamable HTTP endpoint
3005  loopback observation-request signal
```

The bridge exists so a remote Alexa/MCP tool call does not reuse cached physical state.

```text
MCP tool needs current reality
→ RingObservationBridge creates one pending request
→ preview browser sees request ID on loopback control channel
→ browser captures one fresh Ring frame
→ existing /api/observe sends image to Nova
→ Nova returns validated PhysicalState
→ server publishes semantic observation into bridge
→ waiting deterministic MCP tool continues
```

The control channel carries only a request ID and timestamp. It never carries image bytes, checkpoint contents, semantic physical state, or restoration truth.

If the open Ring preview does not answer within `REWIND_MCP_OBSERVATION_TIMEOUT_MS`, the tool fails instead of using stale state.

## Local verification

Pull/install/test:

```bash
git pull origin main
npm install
npm test
```

The automated Phase 9 live bridge gate requires:

```text
Demo Ready
→ fresh Messy comparison
→ fresh Messy Rewind plan
→ fresh Partial verification
→ fresh Restored verification
→ RESTORED / 100%
```

Start the real local stack:

```bash
npm run ring:preview
```

Expected additional startup lines:

```text
REWIND live MCP (Streamable HTTP): http://127.0.0.1:3004/mcp
MCP observation bridge (local): http://127.0.0.1:3005/observation-request
```

With the Ring preview running, verify MCP discovery from a second terminal:

```bash
npm run mcp:probe
```

Expected:

```text
PASS live MCP discovery: http://127.0.0.1:3004/mcp
```

## Tunnel safety

The MCP SDK's DNS-rebinding protection remains enabled.

For a public HTTPS tunnel, set only the tunnel hostname before restarting the preview:

```bash
export REWIND_MCP_PUBLIC_HOST="example.trycloudflare.com"
npm run ring:preview
```

`REWIND_MCP_PUBLIC_HOST` must be a hostname only — no `https://` and no path. REWIND then allowlists localhost plus that public host rather than disabling Host validation.

Do not expose port `3005`. The observation-request control channel must remain loopback-only.

## Alexa+ authentication boundary

REWIND already implements and tests the resource-server side needed for Alexa onboarding:

- Bearer-only protected MCP requests when auth is enabled.
- bare HTTP `401` without `WWW-Authenticate` for rejected requests.
- RFC 9728 protected-resource metadata.
- configurable authorization-server URI/scopes.
- PKCE `S256` metadata validation.

The authorization server / Alexa account-linking configuration remains external to deterministic REWIND truth and will be finalized after Amazon enables the Alexa+ developer tooling account.

## External Amazon blocker

Local IAM is intentionally least-privilege and already grants only:

```text
sts:AssumeRole
→ arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead
```

The cross-account assume-role request is still rejected by Amazon's side. Support case **52846821** is open. Do not add `AdministratorAccess` or unrelated IAM actions to work around this.

## Phase 9 gate

Phase 9 is complete only when:

```text
Alexa+
→ remote HTTPS Streamable HTTP MCP
→ approved REWIND tool
→ fresh Ring/Nova observation when physical truth is required
→ deterministic REWIND result
```

At minimum the Alexa+ path must exercise `save_checkpoint`, `compare_checkpoint`, `start_rewind`, and `verify_rewind` without bypassing the deterministic state engine.
