import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const LINK_WINDOW_MS = 10 * 60 * 1000;
const UNCLAIMED_TTL_MS = 15 * 60 * 1000;
const MAX_UNCLAIMED = 20;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface RingOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
}

export interface UnclaimedRingCredential extends RingOAuthTokens {
  accountId: string;
  receivedAt: number;
}

export interface RingAccountLinkSummary {
  linked: boolean;
  unclaimedCount: number;
}

export interface RingAccountLinkConfig {
  clientId: string;
  clientSecret: string;
  hmacSecret: string;
  partnerEmail: string;
  partnerAuthSecret: string;
  apiBaseUrl?: string;
  oauthTokenUrl?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}

export class InMemoryRingCredentialStore {
  private readonly unclaimed = new Map<string, UnclaimedRingCredential>();
  private linked = false;

  put(record: UnclaimedRingCredential, now = Date.now()): void {
    this.prune(now);
    this.unclaimed.set(record.accountId, record);
    while (this.unclaimed.size > MAX_UNCLAIMED) {
      const oldest = this.unclaimed.keys().next().value as string | undefined;
      if (!oldest) break;
      this.unclaimed.delete(oldest);
    }
  }

  list(now = Date.now()): UnclaimedRingCredential[] {
    this.prune(now);
    return [...this.unclaimed.values()];
  }

  claim(accountId: string): void {
    this.unclaimed.delete(accountId);
    this.linked = true;
  }

  summary(now = Date.now()): RingAccountLinkSummary {
    this.prune(now);
    return { linked: this.linked, unclaimedCount: this.unclaimed.size };
  }

  private prune(now: number): void {
    for (const [accountId, record] of this.unclaimed) {
      if (now - record.receivedAt > UNCLAIMED_TTL_MS) this.unclaimed.delete(accountId);
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function requiredString(value: unknown, field: string, max = 4096): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new Error(`Invalid ${field}.`);
  }
  return value;
}

function parseTokenResponse(input: unknown): TokenResponse {
  const value = asRecord(input);
  if (!value) throw new Error("Invalid Ring OAuth response.");
  const expiresIn = value.expires_in;
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("Invalid Ring OAuth expires_in.");
  }
  const scope = value.scope;
  return {
    access_token: requiredString(value.access_token, "Ring access_token", 16_384),
    refresh_token: requiredString(value.refresh_token, "Ring refresh_token", 16_384),
    expires_in: expiresIn,
    ...(typeof scope === "string" && scope.length <= 4096 ? { scope } : {}),
  };
}

function parseAccountId(input: unknown): string {
  const root = asRecord(input);
  const data = asRecord(root?.data);
  return requiredString(data?.id, "Ring account id", 512);
}

function constantTimeStringEqual(left: string, right: string): boolean {
  const leftDigest = createHmac("sha256", "rewind-constant-time").update(left).digest();
  const rightDigest = createHmac("sha256", "rewind-constant-time").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) throw new Error("Invalid REWIND link email.");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const maskedLocal = local.length === 1
    ? `${local[0]}***`
    : `${local[0]}***${local[local.length - 1]}`;
  return `${maskedLocal}@${domain}`;
}

export function computeRingAccountLinkNonce(timeParam: string, accountId: string, hmacSecret: string): string {
  return createHmac("sha256", hmacSecret)
    .update(`${timeParam}:${accountId}`, "utf8")
    .digest("base64url");
}

export function validateRingAccountLinkTimestamp(timeParam: string, now = Date.now()): number {
  if (!/^\d{10,20}$/.test(timeParam)) throw new Error("Invalid Ring link timestamp.");
  const timestamp = Number(timeParam);
  if (!Number.isSafeInteger(timestamp)) throw new Error("Invalid Ring link timestamp.");
  const age = now - timestamp;
  if (age < 0) throw new Error("Ring link timestamp cannot be in the future.");
  if (age > LINK_WINDOW_MS) throw new Error("Ring link request expired.");
  return timestamp;
}

export class RingAccountLinkService {
  private readonly apiBaseUrl: string;
  private readonly oauthTokenUrl: string;

  constructor(
    private readonly config: RingAccountLinkConfig,
    private readonly store = new InMemoryRingCredentialStore(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!config.clientId || !config.clientSecret || !config.hmacSecret) {
      throw new Error("Ring account-link credentials are required.");
    }
    if (!config.partnerEmail || !config.partnerAuthSecret || config.partnerAuthSecret.length < 16) {
      throw new Error("REWIND account-link identity and a 16+ character auth secret are required.");
    }
    maskEmail(config.partnerEmail);
    this.apiBaseUrl = (config.apiBaseUrl ?? "https://api.amazonvision.com").replace(/\/+$/, "");
    this.oauthTokenUrl = config.oauthTokenUrl ?? "https://oauth.ring.com/oauth/token";
  }

  validateLinkRequest(nonce: string, timeParam: string, now = Date.now()): void {
    if (!NONCE_PATTERN.test(nonce)) throw new Error("Invalid Ring link nonce.");
    validateRingAccountLinkTimestamp(timeParam, now);
  }

  authenticatePartner(email: string, authSecret: string): boolean {
    return constantTimeStringEqual(email.trim().toLowerCase(), this.config.partnerEmail.trim().toLowerCase())
      && constantTimeStringEqual(authSecret, this.config.partnerAuthSecret);
  }

  async exchangeAuthorizationCode(code: string, now = Date.now()): Promise<void> {
    if (code.length < 1 || code.length > 4096) throw new Error("Invalid Ring authorization code.");
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.config.clientId,
      code,
      client_secret: this.config.clientSecret,
    });
    const tokenResponse = await this.fetchImpl(this.oauthTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: form,
      redirect: "error",
    });
    if (!tokenResponse.ok) throw new Error(`Ring OAuth token exchange failed (${tokenResponse.status}).`);
    const tokens = parseTokenResponse(await tokenResponse.json());

    const profileResponse = await this.fetchImpl(`${this.apiBaseUrl}/v1/users/me`, {
      headers: { "Authorization": `Bearer ${tokens.access_token}`, "Accept": "application/json" },
      redirect: "error",
    });
    if (!profileResponse.ok) throw new Error(`Ring profile lookup failed (${profileResponse.status}).`);
    const accountId = parseAccountId(await profileResponse.json());

    this.store.put({
      accountId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: now + tokens.expires_in * 1000,
      receivedAt: now,
      ...(tokens.scope ? { scope: tokens.scope } : {}),
    }, now);
  }

  async completeLink(input: {
    nonce: string;
    timeParam: string;
    email: string;
    authSecret: string;
  }, now = Date.now()): Promise<void> {
    this.validateLinkRequest(input.nonce, input.timeParam, now);
    if (!this.authenticatePartner(input.email, input.authSecret)) {
      throw new Error("REWIND sign-in failed.");
    }

    const candidate = this.store.list(now).find(record => {
      const expected = computeRingAccountLinkNonce(input.timeParam, record.accountId, this.config.hmacSecret);
      return constantTimeStringEqual(expected, input.nonce);
    });
    if (!candidate) throw new Error("Ring link could not be matched to an unclaimed account.");
    if (candidate.expiresAt <= now) throw new Error("Ring access token expired before account linking completed.");

    const headers = {
      "Authorization": `Bearer ${candidate.accessToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    const confirmResponse = await this.fetchImpl(`${this.apiBaseUrl}/v1/accounts/me/app-integrations`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        account_identifier: maskEmail(this.config.partnerEmail),
        nonce: input.nonce,
      }),
      redirect: "error",
    });
    if (!confirmResponse.ok) throw new Error(`Ring integration confirmation failed (${confirmResponse.status}).`);

    const completeResponse = await this.fetchImpl(`${this.apiBaseUrl}/v1/accounts/me/app-integrations`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "completed" }),
      redirect: "error",
    });
    if (!completeResponse.ok) throw new Error(`Ring integration completion failed (${completeResponse.status}).`);

    this.store.claim(candidate.accountId);
  }

  summary(now = Date.now()): RingAccountLinkSummary {
    return this.store.summary(now);
  }

  issueCsrfToken(binding: string): string {
    const random = randomBytes(32).toString("base64url");
    return `${random}.${createHmac("sha256", this.config.partnerAuthSecret).update(`${binding}:${random}`).digest("base64url")}`;
  }

  verifyCsrfToken(token: string, binding: string): boolean {
    const dot = token.indexOf(".");
    if (dot <= 0 || dot === token.length - 1) return false;
    const random = token.slice(0, dot);
    const expected = this.issueDeterministicCsrf(binding, random);
    return constantTimeStringEqual(expected, token);
  }

  private issueDeterministicCsrf(binding: string, random: string): string {
    return `${random}.${createHmac("sha256", this.config.partnerAuthSecret).update(`${binding}:${random}`).digest("base64url")}`;
  }
}
