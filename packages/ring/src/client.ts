import type { RingConfig } from "./contracts.js";

export type RingFetch = typeof fetch;

export class RingClient {
  constructor(
    private readonly config: RingConfig,
    private readonly fetchImpl: RingFetch = fetch,
  ) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ring API ${response.status}: ${body || response.statusText}`);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
