import type { RingConfig } from "./contracts.js";

export function loadRingConfig(env: NodeJS.ProcessEnv = process.env): RingConfig {
  const baseUrl = env.RING_API_BASE_URL?.trim();
  const accessToken = env.RING_ACCESS_TOKEN?.trim();
  const devicesPath = env.RING_DEVICES_PATH?.trim() || "/devices";
  const eventsPath = env.RING_EVENTS_PATH?.trim();

  if (!baseUrl) throw new Error("RING_API_BASE_URL is required.");
  if (!accessToken) throw new Error("RING_ACCESS_TOKEN is required.");

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    accessToken,
    devicesPath: devicesPath.startsWith("/") ? devicesPath : `/${devicesPath}`,
    ...(eventsPath
      ? { eventsPath: eventsPath.startsWith("/") ? eventsPath : `/${eventsPath}` }
      : {}),
  };
}
