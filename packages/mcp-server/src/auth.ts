import type { Request, Response } from "express";

export interface RewindMcpPrincipal {
  actorId: string;
  sessionId?: string;
}

export interface RewindMcpAuthOptions {
  /** Canonical MCP resource URI, for example https://rewind.example.com/mcp. */
  resource: string;
  /** OAuth 2.1 authorization-server issuer URI. */
  authorizationServer: string;
  /** Scopes Alexa+ may request for this protected resource. */
  scopes?: string[];
  /** Validate a bearer token and map it to stable REWIND continuity identifiers. */
  validateBearerToken(token: string): Promise<RewindMcpPrincipal | null>;
}

export interface AuthorizationServerMetadata {
  issuer?: unknown;
  authorization_endpoint?: unknown;
  token_endpoint?: unknown;
  code_challenge_methods_supported?: unknown;
}

function canonicalHttpsUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.hash) {
    throw new Error(`${label} must be an absolute HTTPS URL without a fragment.`);
  }
  return url;
}

export function validateMcpAuthOptions(options: RewindMcpAuthOptions): void {
  canonicalHttpsUrl(options.resource, "MCP resource");
  canonicalHttpsUrl(options.authorizationServer, "Authorization server");
  for (const scope of options.scopes ?? []) {
    if (!/^[A-Za-z0-9._:-]{1,120}$/.test(scope)) throw new Error("MCP OAuth scope is invalid.");
  }
}

/** RFC 9728 well-known path derived from the canonical protected-resource URI. */
export function protectedResourceMetadataPath(resource: string): string {
  const url = canonicalHttpsUrl(resource, "MCP resource");
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  return `/.well-known/oauth-protected-resource${path}`;
}

export function protectedResourceMetadata(options: RewindMcpAuthOptions): Record<string, unknown> {
  validateMcpAuthOptions(options);
  const metadata: Record<string, unknown> = {
    resource: options.resource,
    authorization_servers: [options.authorizationServer],
    bearer_methods_supported: ["header"],
  };
  if (options.scopes?.length) metadata.scopes_supported = [...options.scopes];
  return metadata;
}

function bearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const match = /^Bearer ([A-Za-z0-9._~+\/-]+=*)$/.exec(header.trim());
  return match?.[1];
}

/** Alexa+ discovery currently requires a bare 401 with no WWW-Authenticate header. */
export function sendUnauthorized(res: Response): void {
  res.removeHeader("WWW-Authenticate");
  res.status(401).json({ error: "unauthorized" });
}

export async function authorizeMcpRequest(
  req: Request,
  res: Response,
  options: RewindMcpAuthOptions,
): Promise<RewindMcpPrincipal | undefined> {
  const token = bearer(req);
  if (!token) {
    sendUnauthorized(res);
    return undefined;
  }
  const principal = await options.validateBearerToken(token);
  if (!principal || !/^[A-Za-z0-9._:-]{1,128}$/.test(principal.actorId)) {
    sendUnauthorized(res);
    return undefined;
  }
  if (principal.sessionId !== undefined && !/^[A-Za-z0-9._:-]{1,128}$/.test(principal.sessionId)) {
    sendUnauthorized(res);
    return undefined;
  }
  return principal;
}

/** Validate the Alexa+ PKCE requirement against RFC 8414 authorization-server metadata. */
export function assertAlexaAuthorizationServerMetadata(
  metadata: AuthorizationServerMetadata,
  expectedIssuer: string,
): void {
  const issuer = canonicalHttpsUrl(expectedIssuer, "Authorization server").toString().replace(/\/$/, "");
  if (typeof metadata.issuer !== "string" || metadata.issuer.replace(/\/$/, "") !== issuer) {
    throw new Error("Authorization-server metadata issuer does not match the configured issuer.");
  }
  if (typeof metadata.authorization_endpoint !== "string" || !metadata.authorization_endpoint.startsWith("https://")) {
    throw new Error("Authorization-server metadata must provide an HTTPS authorization_endpoint.");
  }
  if (typeof metadata.token_endpoint !== "string" || !metadata.token_endpoint.startsWith("https://")) {
    throw new Error("Authorization-server metadata must provide an HTTPS token_endpoint.");
  }
  if (!Array.isArray(metadata.code_challenge_methods_supported) || !metadata.code_challenge_methods_supported.includes("S256")) {
    throw new Error("Authorization server must advertise PKCE S256 support.");
  }
}
