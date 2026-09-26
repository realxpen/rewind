# AWS Architecture — AWS Builder Mini Challenge

REWIND uses AWS as a real multi-service runtime rather than a single model call.

## Amazon Bedrock + Nova 2 Lite

Nova interprets Ring frames and uploaded submission images into candidate semantic physical state.

Output is parsed, validated, normalized, and only then admitted into REWIND's trusted observation boundary.

For tracked-object absence, omission alone remains UNKNOWN. Focused checkpoint-driven contrastive audits are required before explicit absence is accepted.

## Amazon DynamoDB

DynamoDB stores canonical semantic checkpoints and the production adapter's latest semantic observation / Alexa runtime state.

Raw JPEGs are not checkpoint truth.

## Amazon Bedrock AgentCore Memory

AgentCore stores short-term conversational/session continuity: active space, checkpoint, Rewind session identifiers, turns, and latest deterministic state label.

It does not replace DynamoDB and does not own physical truth.

## Strands Agents SDK

Strands maps natural-language requests onto a restricted REWIND tool surface. It orchestrates; it does not decide restoration truth.

## AWS Lambda

Lambda is the Alexa Skills Kit endpoint and securely relays authorized voice requests into the REWIND runtime.

## Production authentication

The judge-facing web app runs on Vercel, but AWS access remains server-side. Vercel uses OIDC to assume a least-privilege AWS runtime role instead of storing long-lived AWS access keys.

## End-to-end AWS flow

~~~mermaid
flowchart LR
    A[Ring frame or submission image] --> B[Amazon Bedrock]
    B --> C[Nova 2 Lite]
    C --> D[Validated PSP]
    D --> E[Deterministic diff / restore engine]
    E --> F[(DynamoDB checkpoints)]
    G[Strands Agent] --> H[Approved REWIND tools]
    H --> E
    I[AgentCore Memory] <--> G
    J[Alexa] --> K[AWS Lambda relay]
    K --> E
~~~

## Why AWS matters

REWIND needs perception, durable semantic state, and conversational orchestration/continuity. Nova, DynamoDB, Strands, AgentCore, and Lambda each serve a distinct runtime role while deterministic TypeScript keeps restoration truth auditable.
