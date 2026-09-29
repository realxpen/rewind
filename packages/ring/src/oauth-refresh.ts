import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface CachedRingOAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface RingOAuthTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 8;
}

function parseCachedCredentials(value: unknown): CachedRingOAuthCredentials | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (!validToken(row.accessToken) || !validToken(row.refreshToken)) return undefined;
  if (typeof row.expiresAt !== "number" || !Number.isFinite(row.expiresAt)) return undefined;
  return {
    accessToken: row.accessToken.trim(),
    refreshToken: row.refreshToken.trim(),
    expiresAt: row.expiresAt,
  };
}

function parseRefreshResponse(value: unknown, now: number): CachedRingOAuthCredentials {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Ring OAuth refresh returned an invalid response.");
  }
  const row = value as RingOAuthTokenResponse;
  if (!validToken(row.access_token) || !validToken(row.refresh_token)) {
    throw new Error("Ring OAuth refresh returned incomplete credentials.");
  }
  if (typeof row.expires_in !== "number" || !Number.isFinite(row.expires_in) || row.expires_in <= 0) {
    throw new Error("Ring OAuth refresh returned an invalid expiry.");
  }
  return {
    accessToken: row.access_token.trim(),
    refreshToken: row.refresh_token.trim(),
    expiresAt: now + row.expires_in * 1000,
  };
}

export interface RingOAuthRefreshManagerOptions {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accessToken: string;
  oauthTokenUrl?: string;
  cachePath?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class RingOAuthRefreshManager {
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly configuredRefreshToken?: string;
  private readonly oauthTokenUrl: string;
  private readonly cachePath: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private cacheLoaded = false;
  private cached?: CachedRingOAuthCredentials;
  private refreshInFlight?: Promise<CachedRingOAuthCredentials>;

  constructor(private readonly options: RingOAuthRefreshManagerOptions) {
    this.clientId = options.clientId?.trim() || undefined;
    this.clientSecret = options.clientSecret?.trim() || undefined;
    this.configuredRefreshToken = options.refreshToken?.trim() || undefined;
    this.oauthTokenUrl = options.oauthTokenUrl ?? "https://oauth.ring.com/oauth/token";
    this.cachePath = resolve(options.cachePath ?? ".rewind-secrets/ring-oauth.json");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  get refreshConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && (this.configuredRefreshToken || this.cached?.refreshToken));
  }

  async token(): Promise<string> {
    await this.loadCache();
    const now = this.now();
    if (this.cached && this.cached.expiresAt > now + 60_000) {
      return this.cached.accessToken;
    }
    if (this.canRefresh()) {
      try {
        return (await this.refresh()).accessToken;
      } catch {
        // Preserve compatibility with manually supplied Playground tokens. A request
        // can still attempt the configured access token and produce a sanitized 401.
      }
    }
    return this.options.accessToken;
  }

  async retryTokenAfterUnauthorized(previousToken: string): Promise<string | undefined> {
    await this.loadCache();
    if (!this.canRefresh()) return undefined;
    if (this.cached?.accessToken && this.cached.accessToken !== previousToken && this.cached.expiresAt > this.now()) {
      return this.cached.accessToken;
    }
    return (await this.refresh()).accessToken;
  }

  private canRefresh(): boolean {
    return Boolean(this.clientId && this.clientSecret && (this.cached?.refreshToken || this.configuredRefreshToken));
  }

  private async loadCache(): Promise<void> {
    if (this.cacheLoaded) return;
    this.cacheLoaded = true;
    try {
      const raw = await readFile(this.cachePath, "utf8");
      this.cached = parseCachedCredentials(JSON.parse(raw));
    } catch {
      // First run, missing cache, or corrupt local cache: fall back to env.
    }
  }

  private async refresh(): Promise<CachedRingOAuthCredentials> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.performRefresh();
    try {
      return await this.refreshInFlight;
    } finally {
      this.refreshInFlight = undefined;
    }
  }

  private async performRefresh(): Promise<CachedRingOAuthCredentials> {
    const refreshToken = this.cached?.refreshToken ?? this.configuredRefreshToken;
    if (!this.clientId || !this.clientSecret || !refreshToken) {
      throw new Error("Ring OAuth refresh credentials are not configured.");
    }

    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const response = await this.fetchImpl(this.oauthTokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: form,
      redirect: "error",
    });
    if (!response.ok) {
      throw new Error(`Ring OAuth refresh failed (${response.status}).`);
    }

    const next = parseRefreshResponse(await response.json(), this.now());
    await this.persist(next);
    this.cached = next;
    return next;
  }

  private async persist(credentials: CachedRingOAuthCredentials): Promise<void> {
    const directory = dirname(this.cachePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.cachePath}.tmp`;
    await writeFile(temporary, JSON.stringify(credentials), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.cachePath);
  }
}

export function createRingOAuthRefreshManagerFromEnv(
  accessToken: string,
  env: NodeJS.ProcessEnv = process.env,
): RingOAuthRefreshManager {
  return new RingOAuthRefreshManager({
    accessToken,
    clientId: env.RING_CLIENT_ID,
    clientSecret: env.RING_CLIENT_SECRET,
    refreshToken: env.RING_REFRESH_TOKEN,
    cachePath: env.REWIND_RING_OAUTH_CACHE_PATH,
  });
}
