import type { IncomingMessage, ServerResponse } from "node:http";
import { RingAccountLinkService } from "./account-link.js";

const MAX_ACCOUNT_LINK_BODY_BYTES = 64_000;

class BodyTooLargeError extends Error {}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_ACCOUNT_LINK_BODY_BYTES) throw new BodyTooLargeError();
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function secureHeaders(res: ServerResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
}

function json(res: ServerResponse, status: number, value: unknown): void {
  secureHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

function page(res: ServerResponse, status: number, title: string, body: string): void {
  secureHeaders(res);
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${htmlEscape(title)} · REWIND</title>
<style>
:root{color-scheme:dark}body{font-family:Inter,system-ui,sans-serif;background:#090d10;color:#f7f8f8;margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(560px,100%);background:#12181d;border:1px solid #27323a;border-radius:22px;padding:28px;box-sizing:border-box;box-shadow:0 20px 70px rgba(0,0,0,.35)}h1{margin:0 0 8px;font-size:28px}.muted{color:#aeb9c0;line-height:1.55}label{display:block;margin:18px 0 7px;font-weight:650}input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid #3b4851;background:#0d1216;color:#fff;font:inherit}button{margin-top:20px;border:0;border-radius:12px;padding:12px 16px;background:#eef6f8;color:#0b1115;font:inherit;font-weight:750;cursor:pointer}.ok{font-size:42px;margin:0 0 8px}.small{font-size:13px;color:#86939b}.badge{display:inline-block;border:1px solid #394750;border-radius:999px;padding:5px 9px;font-size:12px;color:#cbd5da}</style>
</head>
<body><main class="card">${body}</main></body>
</html>`);
}

function mediaType(req: IncomingMessage): string {
  const value = typeof req.headers["content-type"] === "string" ? req.headers["content-type"] : "";
  return value.toLowerCase().split(";", 1)[0]?.trim() ?? "";
}

function parseForm(raw: Buffer): URLSearchParams {
  return new URLSearchParams(raw.toString("utf8"));
}

function parseCode(req: IncomingMessage, raw: Buffer): string {
  const type = mediaType(req);
  if (type === "application/x-www-form-urlencoded") {
    const form = parseForm(raw);
    return form.get("code") ?? form.get("authorization_code") ?? "";
  }
  if (type === "application/json") {
    let parsed: unknown;
    try { parsed = JSON.parse(raw.toString("utf8")); }
    catch { throw new Error("Invalid token exchange JSON."); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "";
    const value = parsed as Record<string, unknown>;
    const code = value.code ?? value.authorization_code;
    return typeof code === "string" ? code : "";
  }
  throw new Error("Token exchange requires form or JSON content.");
}

export interface RingAccountLinkHttpOptions {
  service?: RingAccountLinkService;
}

/**
 * Handles the partner-hosted endpoints required by Ring one-way account linking.
 * Returns true when the request path belongs to this surface, even if linking is disabled.
 */
export async function handleRingAccountLinkRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  options: RingAccountLinkHttpOptions,
): Promise<boolean> {
  const isAccountPath = url.pathname === "/ring"
    || url.pathname === "/ring/link"
    || url.pathname === "/ring/oauth/token-exchange";
  if (!isAccountPath) return false;

  const service = options.service;
  if (!service) {
    if (url.pathname === "/ring") {
      page(res, 503, "Ring integration unavailable", `<h1>Ring integration is not configured</h1><p class="muted">The REWIND staging account-link service is offline. Configure the Ring client credentials and REWIND staging sign-in variables, then restart the server.</p>`);
    } else {
      json(res, 503, { error: "Ring account linking is not configured." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/ring") {
    const summary = service.summary();
    page(res, 200, "Ring", `<span class="badge">STAGING</span><h1>REWIND × Ring</h1><p class="muted">Secure Ring account linking is online. ${summary.linked ? "A Ring account has been linked for this running staging session." : "No Ring account has completed linking in this running staging session."}</p><p class="small">Credentials are never rendered in this page.</p>`);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/ring/oauth/token-exchange") {
    try {
      const raw = await readRawBody(req);
      const code = parseCode(req, raw);
      if (!code) {
        json(res, 400, { error: "Authorization code required." });
        return true;
      }
      await service.exchangeAuthorizationCode(code);
      json(res, 200, { status: "accepted" });
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        json(res, 413, { error: "Token exchange request too large." });
      } else {
        json(res, 400, { error: error instanceof Error ? error.message : "Token exchange failed." });
      }
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/ring/link") {
    const nonceValue = url.searchParams.get("nonce");
    const timeValue = url.searchParams.get("time");
    if (nonceValue === null && timeValue === null) {
      page(res, 200, "Link Ring account", `<span class="badge">RING ACCOUNT LINK</span><h1>REWIND account linking is ready</h1><p class="muted">Open this page from the Ring account-linking flow. Ring will add a signed <code>nonce</code> and <code>time</code> to the redirect before REWIND presents the sign-in form.</p><p class="small">No Ring credentials can be claimed from this page without a fresh Ring nonce and REWIND authentication.</p>`);
      return true;
    }
    const nonce = nonceValue ?? "";
    const timeParam = timeValue ?? "";
    try {
      service.validateLinkRequest(nonce, timeParam);
      const binding = `${nonce}:${timeParam}`;
      const csrf = service.issueCsrfToken(binding);
      page(res, 200, "Link Ring account", `<span class="badge">RING ACCOUNT LINK</span><h1>Sign in to REWIND</h1><p class="muted">Ring has redirected you here to associate an approved Ring connection with your REWIND staging identity. Sign-in is required before REWIND will claim the unassigned Ring credentials.</p><form method="post" action="/ring/link"><input type="hidden" name="nonce" value="${htmlEscape(nonce)}"><input type="hidden" name="time" value="${htmlEscape(timeParam)}"><input type="hidden" name="csrf" value="${htmlEscape(csrf)}"><label for="email">REWIND email</label><input id="email" name="email" type="email" autocomplete="username" required maxlength="254"><label for="secret">Staging link passphrase</label><input id="secret" name="secret" type="password" autocomplete="current-password" required maxlength="512"><button type="submit">Confirm Ring connection</button></form><p class="small">This staging sign-in is configured locally through environment variables. Tokens and Ring account IDs are never placed in the browser URL.</p>`);
    } catch (error) {
      page(res, 400, "Invalid Ring link", `<h1>Ring link cannot continue</h1><p class="muted">${htmlEscape(error instanceof Error ? error.message : "Invalid Ring link request.")}</p>`);
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/ring/link") {
    if (mediaType(req) !== "application/x-www-form-urlencoded") {
      json(res, 415, { error: "Form content required." });
      return true;
    }
    try {
      const raw = await readRawBody(req);
      const form = parseForm(raw);
      const nonce = form.get("nonce") ?? "";
      const timeParam = form.get("time") ?? "";
      const csrf = form.get("csrf") ?? "";
      const email = form.get("email") ?? "";
      const authSecret = form.get("secret") ?? "";
      const binding = `${nonce}:${timeParam}`;
      if (!service.verifyCsrfToken(csrf, binding)) {
        json(res, 403, { error: "Invalid link form token." });
        return true;
      }
      await service.completeLink({ nonce, timeParam, email, authSecret });
      page(res, 200, "Ring linked", `<p class="ok">✓</p><h1>Ring account linked</h1><p class="muted">REWIND confirmed the Ring nonce, associated the unclaimed credentials with the authenticated staging identity, and marked the Ring integration completed.</p><p class="small">You can return to Ring and continue testing motion events.</p>`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ring account link failed.";
      const status = message === "REWIND sign-in failed." ? 401 : 400;
      page(res, status, "Ring link failed", `<h1>Ring link failed</h1><p class="muted">${htmlEscape(message)}</p>`);
    }
    return true;
  }

  json(res, 405, { error: "Method not allowed." });
  return true;
}
