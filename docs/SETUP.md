# REWIND Setup

REWIND has three runnable surfaces:

1. **Public submission adapter** — Vercel-hosted Image + Alexa flow used for the repeatable judge-facing SAVE → DIFF → REWIND → VERIFY demo.
2. **Live Ring preview** — local Ring Developer Playground / WHEP flow used to prove the primary Ring-track integration.
3. **MCP / agent tooling** — local Streamable HTTP MCP and Strands/AgentCore flows used for AWS Builder and future assistant integrations.

## Requirements

- Node.js 22+
- npm
- AWS account with Amazon Bedrock access in us-east-1
- Amazon Nova 2 Lite availability
- DynamoDB permissions for the REWIND checkpoint table
- Ring Developer Playground credentials for the live Ring path
- Optional: AgentCore Memory access
- Optional: Alexa Skills Kit account for the standard custom-skill voice demo

## Install

~~~bash
git clone https://github.com/realxpen/rewind.git
cd rewind
npm install
cp .env.example .env
~~~

Never commit real credentials.

## Core verification

~~~bash
npm run build
npm test
~~~

The suite covers PSP validation, deterministic diffing, restore planning, Nova contracts, Ring boundaries, webhook security, Strands/AgentCore, MCP, Alexa, Vercel runtime contracts, and the two-object tracked-removal regression.

## AWS configuration

~~~bash
aws login --profile rewind-dev
export AWS_PROFILE=rewind-dev
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1
~~~

Set BEDROCK_MODEL_ID to global.amazon.nova-2-lite-v1:0 and DYNAMODB_CHECKPOINTS_TABLE to your REWIND table.

~~~bash
npm run checkpoints:ensure-table
~~~

## Live Ring path

Keep Ring credentials only in local .env, then run:

~~~bash
npm run ring:smoke
npm run ring:preview
~~~

Open the local preview, start the Ring live view, capture a frame, and analyze it with Nova.

The Ring path is the primary-track proof. It uses the real Ring Developer Playground / simulator integration.

## Strands + AgentCore

Optional AgentCore continuity is configured with REWIND_AGENTCORE_MEMORY_ID plus the actor/session variables from .env.example.

~~~bash
npm run agent:fixture -- "Inspect my studio"
npm run agentcore:smoke
~~~

AgentCore stores conversational/session continuity, not canonical physical truth.

## MCP

~~~bash
npm run mcp:fixture
npm run mcp:probe
~~~

For live Ring-backed MCP:

~~~bash
npm run ring:preview
npm run mcp:live -- save "Demo Ready"
npm run mcp:live -- compare
npm run mcp:live -- rewind
npm run mcp:live -- verify
~~~

## Standard Alexa Custom Skill

The hackathon voice demo uses a standard Alexa Custom Skill through AWS Lambda. It is separate from Alexa+.

See docs/ALEXA_CUSTOM_SKILL.md.

## Public submission adapter

Judge-facing URL:

https://rewind-rho-dun.vercel.app

The public adapter accepts an image, sends the JPEG to Nova for interpretation, persists only semantic state, and lets Alexa drive deterministic REWIND.

The public adapter is intentionally not presented as Live Ring evidence. Live Ring proof is shown separately in the demo video.

## Production AWS authentication

Vercel uses OIDC to assume a least-privilege AWS runtime role. Static AWS access keys are not embedded in Vercel.

## Troubleshooting

- Ring 401: refresh the Playground access token.
- Nova failure: verify model access and region.
- Missing checkpoint table: run npm run checkpoints:ensure-table.
- Alexa cannot reach REWIND: verify the Lambda relay URL/secret and skill ID.
- Tracked object omitted: omission remains UNKNOWN unless focused contrastive absence audits produce qualifying negative evidence.

## Security and privacy

See docs/PRIVACY.md.

> **Remember the state. Forget the footage.**
