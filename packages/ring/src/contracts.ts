export interface RingDevice {
  id: string;
  name: string;
  kind?: string;
  description?: string;
  capabilities?: string[];
}

export type RingMediaKind = "snapshot" | "recording" | "stream" | "unknown";

export interface RingMediaReference {
  kind: RingMediaKind;
  url: string;
  deviceId?: string;
  eventId?: string;
  expiresAt?: string;
}

export interface RingEvent {
  id: string;
  deviceId: string;
  type: string;
  occurredAt: string;
  media: RingMediaReference[];
  raw?: unknown;
}

export interface RingConfig {
  baseUrl: string;
  accessToken: string;
  devicesPath: string;
  eventsPath?: string;
}
