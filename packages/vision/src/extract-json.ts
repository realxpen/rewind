export function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim();

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const first = withoutFence.indexOf("{");
  const last = withoutFence.lastIndexOf("}");

  if (first < 0 || last < first) {
    throw new Error("Nova response did not contain a JSON object.");
  }

  return withoutFence.slice(first, last + 1);
}
