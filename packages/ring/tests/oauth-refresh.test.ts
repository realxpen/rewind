import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RingOAuthRefreshManager } from "../src/oauth-refresh.js";

const directory = await mkdtemp(join(tmpdir(), "rewind-ring-oauth-"));
const cachePath = join(directory, "ring-oauth.json");
const bodies: string[] = [];
let generation = 1;

const fakeFetch: typeof fetch = async (_input, init) => {
  const body = typeof init?.body === "string"
    ? init.body
    : init?.body instanceof URLSearchParams
      ? init.body.toString()
      : "";
  bodies.push(body);
  const expectedRefresh = generation === 1 ? "refresh-token-initial" : "refresh-token-2";
  assert(body.includes("grant_type=refresh_token"));
  assert(body.includes(`refresh_token=${expectedRefresh}`));
  assert(body.includes("client_id=ring-client"));
  assert(body.includes("client_secret=ring-secret"));
  generation += 1;
  return new Response(JSON.stringify({
    access_token: `access-token-${generation}`,
    refresh_token: `refresh-token-${generation}`,
    expires_in: 14_400,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

try {
  const manager = new RingOAuthRefreshManager({
    accessToken: "stale-access-token",
    refreshToken: "refresh-token-initial",
    clientId: "ring-client",
    clientSecret: "ring-secret",
    cachePath,
    fetchImpl: fakeFetch,
    now: () => 1_800_000_000_000,
  });

  const first = await manager.token();
  assert.equal(first, "access-token-2");
  assert.equal(bodies.length, 1);

  const rotated = await manager.retryTokenAfterUnauthorized(first);
  assert.equal(rotated, "access-token-3");
  assert.equal(bodies.length, 2, "A 401 should trigger exactly one refresh retry.");

  const cached = JSON.parse(await readFile(cachePath, "utf8")) as Record<string, unknown>;
  assert.equal(cached.accessToken, "access-token-3");
  assert.equal(cached.refreshToken, "refresh-token-3");

  let unexpectedNetwork = false;
  const restarted = new RingOAuthRefreshManager({
    accessToken: "still-stale-env-token",
    refreshToken: "refresh-token-initial",
    clientId: "ring-client",
    clientSecret: "ring-secret",
    cachePath,
    fetchImpl: async () => {
      unexpectedNetwork = true;
      throw new Error("should not refresh while cached access token is valid");
    },
    now: () => 1_800_000_001_000,
  });

  assert.equal(await restarted.token(), "access-token-3");
  assert.equal(unexpectedNetwork, false, "Restart must reuse the rotated local credential cache.");
  console.log("PASS Ring OAuth refresh: proactive refresh + 401 retry + rotated credential persistence");
} finally {
  await rm(directory, { recursive: true, force: true });
}
