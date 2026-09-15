# Phase 9 Alexa+ Partner Access Decision

_Date: 2026-09-15_

## Evidence

- Devpost/Amazon hackathon staff confirmed in the official Discord thread that Alexa+ Add-on tools are available only to select Amazon partners and there is currently no public application path.
- Amazon's Alexa+ developer docs also state that Category SDK and MCP Toolkit are available to select partners only.
- REWIND's AWS account could not assume `AddOn3PDeveloperToolsRead` despite correct least-privilege local IAM configuration.
- Alexa support case `52846821` remains open, but the access limitation is now understood as an external partner-access restriction rather than a REWIND implementation defect.

## Decision

Alexa+ is removed from REWIND's critical submission path.

REWIND remains a Ring-first project for the Amazon Developer Hackathon. The Alexa+ MCP integration is retained as a future/optional extension and the MCP server remains standards-based so it can be onboarded later if Amazon grants access.

## Phase 9 scope that remains valuable

- Streamable HTTP MCP server.
- Eight approved REWIND tools.
- Deterministic trust boundary shared with Strands.
- Fresh Ring observation requirement for truth-sensitive MCP tools.
- AgentCore continuity where configured.
- Alexa-compatible resource-server/auth groundwork.
- Local MCP client discovery and live Ring/Nova tool execution.

## Submission wording

Do not claim that REWIND was deployed to or tested end-to-end through Alexa+.

It is accurate to say that REWIND exposes an MCP-compatible tool surface designed for future assistant integrations, while the hackathon demo and judged implementation use Ring + Nova + AWS + deterministic REWIND directly.
