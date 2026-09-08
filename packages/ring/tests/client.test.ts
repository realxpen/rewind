import assert from "node:assert/strict";
import { RingClient } from "../src/client.js";

const calls: Array<{ url: string; init?: RequestInit }> = [];

const fakeFetch: typeof fetch = async (input, init) => {
  calls.push({ url: String(input), ...(init ? { init } : {}) });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

const client = new RingClient(
  {
    baseUrl: "https://ring.example.test",
    accessToken: "secret-test-token",
    devicesPath: "/devices",
  },
  fakeFetch,
);

const result = await client.request<{ ok: boolean }>("/devices");
assert.equal(result.ok, true);
assert.equal(calls.length, 1);
assert.equal(calls[0]?.url, "https://ring.example.test/devices");

const headers = new Headers(calls[0]?.init?.headers);
assert.equal(headers.get("Authorization"), "Bearer secret-test-token");
assert.equal(headers.get("Accept"), "application/json");

const failingFetch: typeof fetch = async () => new Response("nope", { status: 401 });
const failingClient = new RingClient(
  {
    baseUrl: "https://ring.example.test",
    accessToken: "bad-token",
    devicesPath: "/devices",
  },
  failingFetch,
);

await assert.rejects(() => failingClient.request("/devices"), /Ring API 401/);

console.log("PASS ring client: auth headers + JSON + error handling");
