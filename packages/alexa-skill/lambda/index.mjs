/**
 * Alexa Lambda transport for REWIND.
 *
 * Alexa invokes this Lambda directly. The Lambda forwards only the ASK request
 * envelope to the local REWIND relay, authenticated with a shared secret.
 * Ring media and physical-state truth never enter Lambda.
 */
function applicationId(event) {
  return event?.context?.System?.application?.applicationId
    ?? event?.session?.application?.applicationId;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export const handler = async (event) => {
  const relayUrl = requiredEnv("REWIND_RELAY_URL");
  const relaySecret = requiredEnv("REWIND_RELAY_SECRET");
  const expectedSkillId = requiredEnv("REWIND_ALEXA_SKILL_ID");

  if (applicationId(event) !== expectedSkillId) {
    return {
      version: "1.0",
      response: {
        outputSpeech: { type: "PlainText", text: "This request was not intended for this REWIND skill." },
        shouldEndSession: true,
      },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch(relayUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rewind-relay-secret": relaySecret,
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`REWIND relay returned HTTP ${response.status}.`);
    }

    return await response.json();
  } catch {
    return {
      version: "1.0",
      response: {
        outputSpeech: {
          type: "PlainText",
          text: "REWIND could not reach the room service right now. Please try again in a moment.",
        },
        shouldEndSession: true,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
};
