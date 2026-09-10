import assert from "node:assert/strict";
import { once } from "node:events";
import { RingAccountLinkService, computeRingAccountLinkNonce } from "../src/account-link.js";
import { createRingWebhookServer } from "../src/webhook-server.js";

const hmacSecret = "test-ring-hmac-secret-for-link-http";
const accountId = "ava1.ring.account.HTTPTEST";

const fetchImpl: typeof fetch = async (input, init) => {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  const method = init?.method ?? "GET";
  const headers = new Headers(init?.headers);

  if (url === "https://oauth.ring.com/oauth/token" && method === "POST") {
    return new Response(JSON.stringify({
      access_token: "http-access-token",
      refresh_token: "http-refresh-token",
      expires_in: 14_400,
      token_type: "Bearer",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (url === "https://api.amazonvision.com/v1/users/me" && method === "GET") {
    assert.equal(headers.get("authorization"), "Bearer http-access-token");
    return new Response(JSON.stringify({ data: { type: "users", id: accountId } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (url === "https://api.amazonvision.com/v1/accounts/me/app-integrations" && (method === "POST" || method === "PATCH")) {
    assert.equal(headers.get("authorization"), "Bearer http-access-token");
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 404 });
};

const service = new RingAccountLinkService({
  clientId: "http-client",
  clientSecret: "http-client-secret",
  hmacSecret,
  partnerEmail: "owner@example.com",
  partnerAuthSecret: "http-staging-auth-secret",
}, undefined, fetchImpl);

const integration = createRingWebhookServer({
  signingKey: hmacSecret,
  accountLink: service,
});
integration.server.listen(0, "127.0.0.1");
await once(integration.server, "listening");
const address = integration.server.address();
assert(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;

try {
  const homepage = await fetch(`${base}/ring`);
  assert.equal(homepage.status, 200);
  assert.equal(homepage.headers.get("cache-control"), "no-store");
  assert.equal(homepage.headers.get("x-frame-options"), "DENY");
  assert.match(await homepage.text(), /REWIND × Ring/);

  const portalProbe = await fetch(`${base}/ring/link`);
  assert.equal(portalProbe.status, 200);
  assert.match(await portalProbe.text(), /account linking is ready/i);

  const tokenExchange = await fetch(`${base}/ring/oauth/token-exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: "ring-short-lived-code" }),
  });
  assert.equal(tokenExchange.status, 200);
  assert.deepEqual(await tokenExchange.json(), { status: "accepted" });

  const timeParam = String(Date.now());
  const nonce = computeRingAccountLinkNonce(timeParam, accountId, hmacSecret);
  const linkPage = await fetch(`${base}/ring/link?nonce=${encodeURIComponent(nonce)}&time=${encodeURIComponent(timeParam)}`);
  assert.equal(linkPage.status, 200);
  const linkHtml = await linkPage.text();
  assert.match(linkHtml, /Sign in to REWIND/);
  const csrfMatch = /name="csrf" value="([^"]+)"/.exec(linkHtml);
  assert(csrfMatch?.[1], "Expected account-link page to include CSRF token.");
  const csrf = csrfMatch[1];

  const wrongSignIn = await fetch(`${base}/ring/link`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      nonce,
      time: timeParam,
      csrf,
      email: "owner@example.com",
      secret: "definitely-wrong-secret",
    }),
  });
  assert.equal(wrongSignIn.status, 401);
  assert.equal(service.summary().unclaimedCount, 1);

  const complete = await fetch(`${base}/ring/link`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      nonce,
      time: timeParam,
      csrf,
      email: "owner@example.com",
      secret: "http-staging-auth-secret",
    }),
  });
  assert.equal(complete.status, 200);
  assert.match(await complete.text(), /Ring account linked/);
  assert.equal(service.summary().linked, true);
  assert.equal(service.summary().unclaimedCount, 0);

  console.log("PASS Phase 7 account-link HTTP: homepage + portal probe + token exchange + authenticated nonce claim");
} finally {
  integration.server.close();
  integration.server.closeAllConnections();
}
