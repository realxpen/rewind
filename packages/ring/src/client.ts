import type { RingConfig } from "./contracts.js";
import { createRingOAuthRefreshManagerFromEnv, RingOAuthRefreshManager } from "./oauth-refresh.js";

export type RingFetch = typeof fetch;

export class RingClient {
  private readonly oauth: RingOAuthRefreshManager;

  constructor(
    private readonly config: RingConfig,
    private readonly fetchImpl: RingFetch = fetch,
    oauth?: RingOAuthRefreshManager,
  ) {
    this.oauth = oauth ?? createRingOAuthRefreshManagerFromEnv(config.accessToken);
  }

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
    const request = async (accessToken: string) => {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${accessToken}`);
      if (!headers.has("Accept")) headers.set("Accept", "application/json");
      if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      return this.fetchImpl(this.resolveUrl(path), {
        ...init,
        headers,
        redirect: "error",
      });
    };

    try {
      const token = await this.oauth.token();
      this.config.accessToken = token;
      let response = await request(token);
      if (response.status === 401) {
        const refreshed = await this.oauth.retryTokenAfterUnauthorized(token);
        if (refreshed) {
          this.config.accessToken = refreshed;
          response = await request(refreshed);
        }
      }
      return response;
    } catch (error) {
      if (error instanceof Error && /^Ring OAuth refresh failed/.test(error.message)) throw error;
      // Fetch errors can contain URLs; never expose ephemeral session data.
      throw new Error("Ring API request failed");
    }
  }

  /** Authenticated Ring request that exposes a media 303 without following credentials cross-origin. */
  async requestMediaRedirect(path: string, init: RequestInit = {}): Promise<Response> {
    const request = async (accessToken: string) => {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${accessToken}`);
      if (!headers.has("Accept")) headers.set("Accept", "image/jpeg");
      if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      return this.fetchImpl(this.resolveUrl(path), {
        ...init,
        headers,
        redirect: "manual",
      });
    };

    try {
      const token = await this.oauth.token();
      this.config.accessToken = token;
      let response = await request(token);
      if (response.status === 401) {
        const refreshed = await this.oauth.retryTokenAfterUnauthorized(token);
        if (refreshed) {
          this.config.accessToken = refreshed;
          response = await request(refreshed);
        }
      }
      return response;
    } catch (error) {
      if (error instanceof Error && /^Ring OAuth refresh failed/.test(error.message)) throw error;
      throw new Error("Ring media request failed");
    }
  }

}
