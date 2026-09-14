# Phase 9 — Alexa+ developer access blocker (2026-09-14)

Status: external Amazon access blocker; REWIND implementation work continues.

## Verified local AWS setup

AWS account: `707859598737`

IAM user: `alexa-ai-tools`

Attached customer-managed policy permits only:

```json
{
  "Effect": "Allow",
  "Action": "sts:AssumeRole",
  "Resource": "arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead"
}
```

The base profile resolves successfully to:

```text
arn:aws:iam::707859598737:user/alexa-ai-tools
```

No permission boundary is configured on the user.

## Blocking command

```bash
aws sts get-caller-identity --profile alexa-ai
```

Result:

```text
AccessDenied when calling AssumeRole:
User arn:aws:iam::707859598737:user/alexa-ai-tools is not authorized to perform sts:AssumeRole on arn:aws:iam::372468808636:role/AddOn3PDeveloperToolsRead
```

The caller-side `sts:AssumeRole` policy has been visually verified in the AWS console. Do not add broad IAM permissions or `AdministratorAccess` to work around this.

## Interpretation

Amazon's current Alexa+ developer-environment documentation says this flow must use the AWS account previously provided to the Alexa Solutions Architect. The expected successful identity is an assumed role in Amazon account `372468808636`.

Therefore this failure is tracked as an external Alexa+ developer-access / role-trust enrollment blocker unless Amazon provides different onboarding instructions.

## REWIND work that is not blocked

- Phase 9A Streamable HTTP MCP implementation.
- MCP tool discovery and four-tool deterministic gate.
- Alexa-ready resource-server authentication boundary.
- RFC 9728 Protected Resource Metadata.
- bare `401 Unauthorized` behavior with no `WWW-Authenticate` header.
- PKCE `S256` authorization-server metadata validation.

## Still blocked on Amazon access

- Alexa AI CLI private package installation/authentication if it requires the Amazon cross-account role.
- `alexa-ai configure` / `alexa-ai new mcp` / deployment if the CLI cannot be installed or authenticated without that role.
- live Alexa+ introspection and simulator proof.

Next external action: ask the assigned Alexa+ Solutions Architect or Amazon Developer DevAssistant/support to enable AWS account `707859598737` for the Alexa+ add-on developer tooling / `AddOn3PDeveloperToolsRead` role, or provide the correct enrolled AWS account.
