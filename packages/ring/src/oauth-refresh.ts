import { GetSecretValueCommand, PutSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
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

interface SecretsClientLike {
  send(command: unknown): Promise<unknown>;
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
  secretId?: string;
  region?: string;
  secretsClient?: SecretsClientLike;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class RingOAuthRefreshManager {
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly configuredRefreshToken: string | undefined;
  private readonly oauthTokenUrl: string;
  private readonly cachePath: string;
  private readonly secretId: string | undefined;
  private readonly secretsClient: SecretsClientLike | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private cacheLoaded = false;
  private cached: CachedRingOAuthCredentials | undefined;
  private refreshInFlight: Promise<CachedRingOAuthCredentials> | undefined;

  constructor(private readonly options: RingOAuthRefreshManagerOptions) {
    this.clientId = options.clientId?.trim() || undefined;
    this.clientSecret = options.clientSecret?.trim() || undefined;
    this.configuredRefreshToken = options.refreshToken?.trim() || undefined;
    this.oauthTokenUrl = options.oauthTokenUrl ?? "https://oauth.ring.com/oauth/token";
    this.cachePath = resolve(options.cachePath ?? ".rewind-secrets/ring-oauth.json");
    this.secretId = options.secretId?.trim() || undefined;
    this.secretsClient = this.secretId
      ? options.secretsClient ?? new SecretsManagerClient({ region: options.region ?? process.env.AWS_REGION ?? "us-east-1" })
      : undefined;
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

  async acceptLinkedCredentials(credentials: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }): Promise<void> {
    const parsed = parseCachedCredentials(credentials);
    if (!parsed || parsed.expiresAt <= this.now()) {
      throw new Error("Ring linked credentials are invalid or already expired.");
    }
    await this.persist(parsed);
    this.cached = parsed;
    this.cacheLoaded = true;
    this.options.accessToken = parsed.accessToken;
  }

  private canRefresh(): boolean {
    return Boolean(this.clientId && this.clientSecret && (this.cached?.refreshToken || this.configuredRefreshToken));
  }

  private async loadCache(): Promise<void> {
    if (this.cacheLoaded) return;
    this.cacheLoaded = true;

    if (this.secretId && this.secretsClient) {
      try {
        const response = await this.secretsClient.send(new GetSecretValueCommand({ SecretId: this.secretId })) as {
          SecretString?: string;
        };
        if (!response.SecretString) return;
        this.cached = parseCachedCredentials(JSON.parse(response.SecretString));
        return;
      } catch {
        throw new Error("Ring OAuth cloud credential cache could not be read.");
      }
    }

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
    if (this.secretId && this.secretsClient) {
      try {
        await this.secretsClient.send(new PutSecretValueCommand({
          SecretId: this.secretId,
          SecretString: JSON.stringify(credentials),
        }));
        return;
      } catch {
        throw new Error("Ring OAuth cloud credential cache could not be updated.");
      }
    }

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
    ...(env.RING_CLIENT_ID ? { clientId: env.RING_CLIENT_ID } : {}),
    ...(env.RING_CLIENT_SECRET ? { clientSecret: env.RING_CLIENT_SECRET } : {}),
    ...(env.RING_REFRESH_TOKEN ? { refreshToken: env.RING_REFRESH_TOKEN } : {}),
    ...(env.REWIND_RING_OAUTH_CACHE_PATH ? { cachePath: env.REWIND_RING_OAUTH_CACHE_PATH } : {}),
    ...(env.REWIND_RING_OAUTH_SECRET_ID ? { secretId: env.REWIND_RING_OAUTH_SECRET_ID } : {}),
    region: env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? "us-east-1",
  });
}
