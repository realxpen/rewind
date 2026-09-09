import { readFile } from "node:fs/promises";
import {
  RingClient,
  startWhepSession,
  endWhepSession,
  listRingDevices,
  listRingEvents,
  loadRingConfig,
} from "../src/index.js";

async function main(): Promise<void> {
  const config = loadRingConfig();
  const client = new RingClient(config);

  console.log("Ring config/auth: ready");
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(`Devices path: ${config.devicesPath}`);
  console.log(`Events path: ${config.eventsPath ?? "not configured"}`);

  const devices = await listRingDevices(client, config.devicesPath);

  console.log(`Discovered devices: ${devices.length}`);
  for (const device of devices) {
    console.log(
      `- ${device.id} | ${device.name}${device.kind ? ` | ${device.kind}` : ""}${
        device.capabilities?.length ? ` | capabilities=${device.capabilities.join(",")}` : ""
      }`,
    );
  }

  if (config.eventsPath) {
    const events = await listRingEvents(client, config.eventsPath);
    console.log(`Recent events: ${events.length}`);
    for (const event of events.slice(0, 5)) {
      console.log(
        `- ${event.id} | ${event.type} | device=${event.deviceId} | media=${event.media
          .map((item) => item.kind)
          .join(",") || "none"}`,
      );
    }
  } else {
    console.log("Event/media smoke: skipped (set RING_EVENTS_PATH to enable)");
  }


  const offerFile = process.env.RING_WHEP_OFFER_FILE;
  if (offerFile) {
    const deviceId = process.env.RING_WHEP_DEVICE_ID || (devices.length === 1 ? devices[0]?.id : undefined);
    if (!deviceId || !devices.some((device) => device.id === deviceId)) {
      throw new Error("Select a discovered device using RING_WHEP_DEVICE_ID");
    }
    const offer = await readFile(offerFile, "utf8");
    const session = await startWhepSession(client, deviceId, offer);
    try {
      if (!session.sdpAnswer.trim()) throw new Error("Empty WHEP answer");
      console.log("WHEP create: 201, SDP answer and session location received");
    } finally {
      await endWhepSession(client, session.sessionUrl);
      console.log("WHEP delete: success");
    }
  } else {
    console.log("WHEP smoke: skipped (set RING_WHEP_OFFER_FILE to enable)");
  }
  console.log("Ring Playground smoke complete. No credentials were printed.");
}

main().catch(() => {
  console.error("Ring smoke failed. Check configuration, device selection, offer freshness, and API availability. Sensitive details omitted.");
  process.exitCode = 1;
});
