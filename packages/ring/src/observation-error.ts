/** Allowlisted diagnostics only: never expose arbitrary SDK messages or model output. */
export function observationErrorMessage(error: unknown): string {
  const value = error && typeof error === "object" ? error as { name?: unknown; code?: unknown } : {};
  const messages: Record<string, string> = {
    CredentialsProviderError: "AWS credentials were not found or could not be loaded. Load your AWS profile in the terminal running REWIND, then restart the preview.",
    TokenProviderError: "AWS sign-in could not be loaded. Renew your AWS login, then restart the preview.",
    ExpiredTokenException: "AWS credentials have expired. Renew your AWS login, then restart the preview.",
    ExpiredToken: "AWS credentials have expired. Renew your AWS login, then restart the preview.",
    UnrecognizedClientException: "AWS rejected the credentials. Check the AWS profile used by the preview server.",
    InvalidSignatureException: "AWS rejected the request signature. Check your AWS credentials and system clock.",
    AccessDeniedException: "AWS denied this Nova request. Check Bedrock model permissions for the preview server's AWS identity.",
    ValidationException: "Bedrock rejected the request configuration. Check the selected model, region, image, and inference settings.",
    ResourceNotFoundException: "Bedrock could not find the requested model or resource. Check BEDROCK_MODEL_ID and AWS_REGION.",
    ThrottlingException: "Bedrock is throttling requests. Wait briefly and retry Observe.",
    ServiceUnavailableException: "Bedrock is temporarily unavailable. Retry Observe shortly.",
    ModelTimeoutException: "Nova timed out. Retry Observe with the captured frame.",
    TimeoutError: "The Nova request timed out. Check connectivity and retry Observe.",
  };
  const contractCodes = ["INVALID_JSON", "SCHEMA_REJECTED", "SPACE_MISMATCH", "CAPTURE_TIME_MISMATCH", "PSP_REJECTED"];
  if (value.name === "VisionContractError" && typeof value.code === "string" && contractCodes.includes(value.code)) {
    return `Nova responded, but physical-state validation failed (${value.code}). No checkpoint was saved. Share this error code for debugging.`;
  }
  if (typeof value.name === "string" && Object.hasOwn(messages, value.name)) return messages[value.name]!;
  return "Nova observation failed for an unclassified reason. AWS access or response validation may be involved; no checkpoint was saved.";
}
