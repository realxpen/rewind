# Phase 0 — Account and Integration Notes

Source: REWIND project conversations through 2026-09-06.

## AWS

- Initial AWS Core connection resolved to the account root identity.
- Root use was rejected for development.
- A least-privilege IAM user named `rewind-dev` was created and used instead.
- AWS MCP OAuth access required `signin:AuthorizeOAuth2Access` and `signin:CreateOAuth2Token`.
- `rewind-dev` console identity was visibly confirmed from AWS IAM access-denied messages showing the IAM user ARN.
- Amazon Bedrock / Nova 2 Lite was tested successfully with the prompt `Reply with exactly: REWIND DEV READY`.
- The returned response was `REWIND DEV READY`.
- CloudShell and IAM-admin actions were intentionally not granted merely to make the console more convenient.

## Ring

- Amazon account sign-in/recovery caused friction during setup.
- Ring Developer Console access was eventually established.
- Ring Developers Playground opened successfully.
- A temporary Playground OAuth token was generated.
- API Explorer returned synthetic Ring device data.
- Playground exposes Package, Vehicle, and Motion event simulation.
- The temporary OAuth token was visible in a screenshot once; tokens must never be shared or committed and should be regenerated after accidental exposure.

## Devpost

- User registered as `Working solo`.
- Amazon experience answer: `I've published one app / skill / integration`.
- Hackathon discovery answer: `Devpost`.
- Amazon product interest: `Ring`.
- Goals: Learning, Prizes, Exposure, Solving a Problem.
- Rules, terms, and eligibility were explicitly accepted.
- REWIND Devpost project draft was created.

## Phase 0 result

External build blockers were removed sufficiently to advance:

- GitHub repository available;
- Devpost registration complete;
- `rewind-dev` verified;
- Nova 2 Lite inference verified;
- Ring Developer Playground verified.
