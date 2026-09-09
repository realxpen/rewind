import type { RingConfig } from "./contracts.js";

export type RingFetch = typeof fetch;

export class RingClient {
  constructor(
    private readonly config: RingConfig,
    private readonly fetchImpl: RingFetch = fetch,
  ) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.requestRaw(path, init);

    if (!response.ok) {
      throw new Error(`Ring API ${response.status}`);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  /** Resolve session locations without sending credentials to another origin. */
  resolveUrl(path: string, relativeTo = `${this.config.baseUrl}/`): string {
    let url: URL;
    try {
      url = new URL(path, relativeTo);
    } catch {
      throw new Error("Invalid Ring URL");
    }
    if (url.origin !== new URL(this.config.baseUrl).origin || url.username || url.password || url.hash) {
      throw new Error("Ring URL must use the configured API origin without credentials or fragment");
    }
    return url.href;
  }

  /** Authenticated transport for non-JSON protocols such as WHEP. */
  async requestRaw(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.config.accessToken}`);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    try {
      return await this.fetchImpl(this.resolveUrl(path), {
        ...init,
        headers,
        redirect: "error",
      });
    } catch {
      // Fetch errors can contain URLs; never expose ephemeral session data.
      throw new Error("Ring API request failed");
    }
  }

}
