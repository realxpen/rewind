import assert from "node:assert/strict";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { InMemorySessionContinuityStore } from "../../agent-orchestrator/src/index.js";
import {
  assertAlexaAuthorizationServerMetadata,
  protectedResourceMetadataPath,
} from "../src/auth.js";
import { createPhase9FixtureToolService } from "../src/fixture.js";
import { createRewindMcpHttpApp } from "../src/http.js";

const resource = "https://rewind.example.test/mcp";
const authorizationServer = "https://auth.example.test";
const app = createRewindMcpHttpApp({
  toolService: createPhase9FixtureToolService(),
  continuity: new InMemorySessionContinuityStore(),
  defaultSpaceId: "studio",
  auth: {
    resource,
    authorizationServer,
    scopes: ["rewind:control"],
    async validateBearerToken(token) {
      return token === "valid-test-token"
        ? { actorId: "alexa-test-user", sessionId: "alexa-test-session" }
        : null;
    },
  },
});

const http = app.listen(0, "127.0.0.1");
await once(http, "listening");
const address = http.address();
assert(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;

try {
  const unauthenticated = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get("www-authenticate"), null);

  const badToken = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer invalid-test-token",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "initialize", params: {} }),
  });
  assert.equal(badToken.status, 401);
  assert.equal(badToken.headers.get("www-authenticate"), null);

  const prmPath = protectedResourceMetadataPath(resource);
  assert.equal(prmPath, "/.well-known/oauth-protected-resource/mcp");
  const prmResponse = await fetch(`${base}${prmPath}`);
  assert.equal(prmResponse.status, 200);
  const prm = await prmResponse.json() as Record<string, unknown>;
  assert.equal(prm.resource, resource);
  assert.deepEqual(prm.authorization_servers, [authorizationServer]);
  assert.deepEqual(prm.bearer_methods_supported, ["header"]);
  assert.deepEqual(prm.scopes_supported, ["rewind:control"]);

  assertAlexaAuthorizationServerMetadata({
    issuer: authorizationServer,
    authorization_endpoint: `${authorizationServer}/authorize`,
    token_endpoint: `${authorizationServer}/token`,
    code_challenge_methods_supported: ["S256"],
  }, authorizationServer);
  assert.throws(() => assertAlexaAuthorizationServerMetadata({
    issuer: authorizationServer,
    authorization_endpoint: `${authorizationServer}/authorize`,
    token_endpoint: `${authorizationServer}/token`,
    code_challenge_methods_supported: ["plain"],
  }, authorizationServer), /S256/);

  const client = new Client({ name: "rewind-alexa-auth-gate", version: "1.0.0" });
  const transportOptions = {
    requestInit: { headers: { Authorization: "Bearer valid-test-token" } },
  } as unknown as ConstructorParameters<typeof StreamableHTTPClientTransport>[1];
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), transportOptions);
  await client.connect(transport as unknown as Transport);
  const tools = await client.listTools();
  assert(tools.tools.some(tool => tool.name === "save_checkpoint"));
  assert(tools.tools.some(tool => tool.name === "verify_rewind"));
  await client.close();

  console.log("PASS Alexa MCP auth: bare 401 + RFC 9728 PRM + PKCE S256 metadata gate + authenticated MCP discovery.");
} finally {
  http.close();
  http.closeAllConnections();
}
