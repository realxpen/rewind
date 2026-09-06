# Superseded — Root AWS Development Session

Status: **SUPERSEDED**

Early Phase 0 AWS Core access resolved to the account root identity.

This was rejected as the normal REWIND development path because the project requires least-privilege AWS access.

Replacement:

- `rewind-dev` IAM identity for development/inference access;
- future deployment identity/role with only required deployment permissions.

Do not reintroduce root credentials for routine REWIND development merely to bypass IAM friction.
