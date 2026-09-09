import type { RingClient } from "./client.js";
import type { RingWhepSession } from "./contracts.js";

export async function startWhepSession(
  client: RingClient,
  deviceId: string,
  sdpOffer: string,
): Promise<RingWhepSession> {
  if (!deviceId.trim()) throw new Error("WHEP device ID is required");
  if (!sdpOffer.trim()) throw new Error("WHEP SDP offer is required");
  const path = `/v1/devices/${encodeURIComponent(deviceId)}/media/streaming/whep/sessions`;
  const response = await client.requestRaw(path, {
    method: "POST",
    headers: { "Content-Type": "application/sdp", Accept: "application/sdp" },
    body: sdpOffer,
  });
  if (response.status !== 201) {
    throw new Error(`Ring WHEP create expected 201, received ${response.status}`);
  }
  const location = response.headers.get("Location");
  if (!location?.trim()) throw new Error("Ring WHEP create missing Location header");
  const sessionUrl = client.resolveUrl(location, client.resolveUrl(path));
  const sdpAnswer = await response.text();
  return { sdpAnswer, sessionUrl };
}

export async function endWhepSession(client: RingClient, sessionUrl: string): Promise<void> {
  if (!sessionUrl.trim()) throw new Error("WHEP session URL is required");
  const response = await client.requestRaw(sessionUrl, { method: "DELETE" });
  if (!response.ok) throw new Error(`Ring WHEP delete failed: ${response.status}`);
}
