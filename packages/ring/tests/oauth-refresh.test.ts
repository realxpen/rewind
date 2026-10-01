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

  await manager.acceptLinkedCredentials({
    accessToken: "linked-access-token",
    refreshToken: "linked-refresh-token",
    expiresAt: 1_800_014_400_000,
  });
  const linkedCached = JSON.parse(await readFile(cachePath, "utf8")) as Record<string, unknown>;
  assert.equal(linkedCached.accessToken, "linked-access-token");
  assert.equal(linkedCached.refreshToken, "linked-refresh-token");

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

  assert.equal(await restarted.token(), "linked-access-token");
  assert.equal(unexpectedNetwork, false, "Restart must reuse the rotated local credential cache.");

  let cloudSecret = "{}";
  const cloudClient = {
    async send(command: unknown) {
      const name = (command as { constructor?: { name?: string } }).constructor?.name;
      if (name === "GetSecretValueCommand") return { SecretString: cloudSecret };
      if (name === "PutSecretValueCommand") {
        const input = (command as { input?: { SecretString?: string } }).input;
        assert.equal(typeof input?.SecretString, "string");
        cloudSecret = input!.SecretString!;
        return { VersionId: "cloud-version" };
      }
      throw new Error(`Unexpected Secrets Manager command: ${name ?? "unknown"}`);
    },
  };

  const cloudManager = new RingOAuthRefreshManager({
    accessToken: "pending-account-link",
    clientId: "ring-client",
    clientSecret: "ring-secret",
    secretId: "rewind/ring/oauth",
    secretsClient: cloudClient,
    now: () => 1_800_000_000_000,
  });
  await cloudManager.acceptLinkedCredentials({
    accessToken: "cloud-linked-access",
    refreshToken: "cloud-linked-refresh",
    expiresAt: 1_800_014_400_000,
  });
  const persistedCloud = JSON.parse(cloudSecret) as Record<string, unknown>;
  assert.equal(persistedCloud.accessToken, "cloud-linked-access");
  assert.equal(persistedCloud.refreshToken, "cloud-linked-refresh");

  const cloudRestart = new RingOAuthRefreshManager({
    accessToken: "pending-account-link",
    clientId: "ring-client",
    clientSecret: "ring-secret",
    secretId: "rewind/ring/oauth",
    secretsClient: cloudClient,
    fetchImpl: async () => {
      throw new Error("cloud restart should reuse valid persisted token");
    },
    now: () => 1_800_000_001_000,
  });
  assert.equal(await cloudRestart.token(), "cloud-linked-access");

  console.log("PASS Ring OAuth refresh: proactive refresh + 401 retry + local/cloud rotated credential persistence");
} finally {
  await rm(directory, { recursive: true, force: true });
}
