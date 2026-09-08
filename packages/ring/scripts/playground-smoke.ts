import {
  RingClient,
  listRingDevices,
  listRingEvents,
  loadRingConfig,
} from "../src/index.js";

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

console.log("Ring Playground smoke complete. No credentials were printed.");
