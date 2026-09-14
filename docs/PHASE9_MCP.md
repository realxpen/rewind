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

The Phase 9 minimum gate tools are `save_checkpoint`, `compare_checkpoint`, `start_rewind`, and `verify_rewind`.

## Live Ring observation bridge

`npm run ring:preview` starts two coordinated local surfaces:

```text
3002  Ring preview + Nova observation UI + same-origin MCP observation signal
3004  MCP Streamable HTTP endpoint
```

When an MCP tool needs current reality:

```text
MCP tool
→ RingObservationBridge pending request
→ browser polls /api/mcp-observation-request on 3002
→ fresh Ring frame
→ /api/observe
→ Nova validated PhysicalState
→ bridge resolves
→ deterministic MCP tool continues
```

The same-origin signal carries only request metadata. It never carries image bytes, semantic state, checkpoints, restore plans, or restoration truth. The preview keeps `connect-src 'self'` unchanged.

If the preview does not answer within `REWIND_MCP_OBSERVATION_TIMEOUT_MS`, the MCP tool fails instead of using stale state.

## Local verification

```bash
git pull origin main
npm install
npm test
npm run ring:preview
```

Expected startup lines:

```text
MCP fresh-observation signal: http://127.0.0.1:3002/api/mcp-observation-request
REWIND live MCP (Streamable HTTP): http://127.0.0.1:3004/mcp
```

Open `http://127.0.0.1:3002`, start the Ring live view, and keep the tab open.

From a second terminal:

```bash
npm run mcp:probe
npm run mcp:live -- save "Demo Ready"
```

Change the physical scene, then:

```bash
npm run mcp:live -- compare
npm run mcp:live -- rewind
```

Restore part of the scene and run:

```bash
npm run mcp:live -- verify
```

Fully restore it and run verify again. The final result must be deterministic `RESTORED / 100%`.

## Tunnel safety

The MCP SDK's DNS-rebinding protection remains enabled. For a public HTTPS tunnel, set only the public hostname before restarting:

```bash
export REWIND_MCP_PUBLIC_HOST="example.trycloudflare.com"
npm run ring:preview
```

Only port 3004 should be exposed to Alexa. The Ring preview on 3002 stays local.

## Alexa+ authentication boundary

REWIND implements and tests:

- Bearer-only protected MCP requests when auth is enabled.
- bare HTTP `401` without `WWW-Authenticate` for rejected requests.
- RFC 9728 protected-resource metadata.
- configurable authorization-server URI/scopes.
- PKCE `S256` metadata validation.

Authorization-server / Alexa account-linking setup will be finalized after Amazon enables the Alexa+ developer tooling account.

## External Amazon blocker

The cross-account Alexa developer-tools role assumption is still rejected on Amazon's side. Support case **52846821** is open. Do not add broad IAM permissions to work around it.

## Phase 9 gate

Phase 9 completes only when:

```text
Alexa+
→ remote HTTPS Streamable HTTP MCP
→ approved REWIND tool
→ fresh Ring/Nova observation when physical truth is required
→ deterministic REWIND result
```

At minimum the Alexa+ path must exercise save, compare, start Rewind, and verify without bypassing the deterministic state engine.
