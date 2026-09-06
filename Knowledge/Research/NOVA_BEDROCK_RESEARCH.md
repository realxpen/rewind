# Nova + Bedrock Research

## Model

REWIND uses **Amazon Nova 2 Lite** as the preferred perception model for the MVP.

## Verified Phase 0 result

Nova inference through Amazon Bedrock succeeded under the REWIND AWS setup with the response:

`REWIND DEV READY`

## Intended role

Nova interprets observations and produces **candidate** Physical State Protocol documents.

Use Nova for:

- object extraction;
- semantic spatial relationships;
- visible attributes/state;
- structured candidate output;
- confidence signals.

Do not use Nova as the canonical diff engine or final restored-state authority.

## Observation contract principles

- one stable frame/snapshot;
- known space context;
- optional expected entity vocabulary;
- strict PSP-shaped output;
- visually supported facts only;
- no invisible-object inference;
- no invented identities;
- semantic relations over raw coordinates;
- explicit `UNKNOWN` for insufficient confidence;
- low temperature;
- schema validation before persistence.

## Bedrock role

Bedrock is the production gateway for Nova inference, retries, standardized model invocation, metrics, and AWS-native integration.
