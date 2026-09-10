import {
  RingAccountLinkService,
  computeRingAccountLinkNonce,
  validateRingAccountLinkTimestamp,
} from "../src/account-link.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function assertRejects(fn: () => Promise<unknown>, contains: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(contains), `Expected error containing ${contains}, got ${message}`);
    return;
  }
  throw new Error(`Expected rejection containing ${contains}.`);
}

const now = 1_780_000_000_000;
const hmacSecret = "ring-hmac-secret-for-tests";
const partnerAuthSecret = "rewind-staging-link-secret";
const accountId = "ava1.ring.account.TEST123";
const calls: Array<{ url: string; method: string; body?: string; authorization?: string }> = [];

const fetchImpl: typeof fetch = async (input, init) => {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  const method = init?.method ?? "GET";
  const headers = new Headers(init?.headers);
  const body = typeof init?.body === "string"
    ? init.body
    : init?.body instanceof URLSearchParams
      ? init.body.toString()
      : undefined;
  const authorization = headers.get("authorization");
  calls.push({
    url,
    method,
    ...(body !== undefined ? { body } : {}),
    ...(authorization ? { authorization } : {}),
  });

  if (url === "https://oauth.ring.com/oauth/token") {
    assert(method === "POST", "OAuth exchange must use POST.");
    assert(body?.includes("grant_type=authorization_code"), "OAuth exchange must use authorization_code grant.");
    assert(body?.includes("client_id=test-client"), "OAuth exchange must include client_id.");
    assert(body?.includes("client_secret=test-client-secret"), "OAuth exchange must include client_secret.");
    return new Response(JSON.stringify({
      access_token: "access-token-value",
      refresh_token: "refresh-token-value",
      expires_in: 14_400,
      token_type: "Bearer",
      scope: "devices notifications",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (url === "https://api.amazonvision.com/v1/users/me") {
    assert(headers.get("authorization") === "Bearer access-token-value", "Profile lookup must use access token.");
    return new Response(JSON.stringify({ data: { type: "users", id: accountId } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url === "https://api.amazonvision.com/v1/accounts/me/app-integrations" && method === "POST") {
    assert(headers.get("authorization") === "Bearer access-token-value", "Integration POST must use access token.");
    const parsed = JSON.parse(body ?? "{}") as Record<string, unknown>;
    assert(parsed.account_identifier === "o***r@example.com", "Partner email must be masked before Ring confirmation.");
    assert(typeof parsed.nonce === "string", "Integration POST must send nonce.");
    return new Response(null, { status: 204 });
  }

  if (url === "https://api.amazonvision.com/v1/accounts/me/app-integrations" && method === "PATCH") {
    assert(headers.get("authorization") === "Bearer access-token-value", "Integration PATCH must use access token.");
    const parsed = JSON.parse(body ?? "{}") as Record<string, unknown>;
    assert(parsed.status === "completed", "Integration PATCH must mark completed.");
    return new Response(null, { status: 204 });
  }

  return new Response(null, { status: 404 });
};

const service = new RingAccountLinkService({
  clientId: "test-client",
  clientSecret: "test-client-secret",
  hmacSecret,
  partnerEmail: "owner@example.com",
  partnerAuthSecret,
}, undefined, fetchImpl);

await service.exchangeAuthorizationCode("short-lived-auth-code", now);
assert(service.summary(now).unclaimedCount === 1, "Token exchange should store one unclaimed Ring credential.");
assert(!service.summary(now).linked, "Token must remain unclaimed before partner sign-in.");

const timeParam = String(now - 1_000);
const nonce = computeRingAccountLinkNonce(timeParam, accountId, hmacSecret);
assert(/^[A-Za-z0-9_-]{43}$/.test(nonce), "Nonce must be URL-safe Base64 without padding.");
service.validateLinkRequest(nonce, timeParam, now);
validateRingAccountLinkTimestamp(timeParam, now);

const csrf = service.issueCsrfToken(`${nonce}:${timeParam}`);
assert(service.verifyCsrfToken(csrf, `${nonce}:${timeParam}`), "CSRF token must verify for its binding.");
assert(!service.verifyCsrfToken(csrf, `${nonce}:wrong-time`), "CSRF token must not verify for another binding.");

await assertRejects(() => service.completeLink({
  nonce,
  timeParam,
  email: "owner@example.com",
  authSecret: "wrong-secret",
}, now), "REWIND sign-in failed");
assert(service.summary(now).unclaimedCount === 1, "Failed sign-in must not claim Ring credentials.");

await service.completeLink({
  nonce,
  timeParam,
  email: "owner@example.com",
  authSecret: partnerAuthSecret,
}, now);
assert(service.summary(now).linked, "Successful flow must mark Ring integration linked.");
assert(service.summary(now).unclaimedCount === 0, "Successful flow must remove unclaimed credential.");

await assertRejects(async () => {
  validateRingAccountLinkTimestamp(String(now - 10 * 60 * 1000 - 1), now);
}, "expired");
await assertRejects(async () => {
  validateRingAccountLinkTimestamp(String(now + 1), now);
}, "future");

assert(calls.length === 4, `Expected four Ring network calls, got ${calls.length}.`);
console.log("PASS Phase 7 account linking: code exchange -> trusted Account ID -> signed nonce match -> authenticated claim -> POST/PATCH completed");
