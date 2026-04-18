---
name: graphql-contract-enforcer
description: Use for freezing and validating GraphQL schema compatibility, resolver alignment, and non-breaking API evolution.
---

# graphql-contract-enforcer

## Scope
- Review `apps/api/src/graphql/schema.gql.ts` and resolver alignment.
- Detect and block unapproved schema drift.
- Preserve consumer-facing API compatibility.

## Invariants
- Resolvers and schema stay aligned.
- Backward compatibility is default behavior.
- Contract changes require explicit multi-role signoff.

## Forbidden Patterns
- Breaking field removals without approval.
- Silent type changes affecting clients.
- Unreviewed schema evolution merged into integration branches.

## Required Validation
- API test suite for affected resolver paths.
- Schema/resolver conformance review in gate packet.
- Contract checks listed in `.codex/multi-agent/contracts.yaml`.

## Expected Artifacts
- Schema diff report.
- Resolver alignment checklist.
- Contract exception notes when applicable.
