---
name: e2e-acceptance-validator
description: Use for deterministic acceptance validation across API and web flows with reproducible fixtures and fail-closed stage evidence.
---

# e2e-acceptance-validator

## Scope
- Validate stage readiness using deterministic acceptance suites.
- Ensure reproducible flow checks across API, web, and AI layers.
- Produce gate-ready evidence artifacts.

## Invariants
- Acceptance checks are deterministic and repeatable.
- Gate result is evidence-driven, not subjective.
- Failing mandatory checks block stage transitions.

## Forbidden Patterns
- Flaky-only checks as sole gate evidence.
- Manual pass/fail without command output.
- Ignoring failed mandatory gate checks.

## Required Validation
- Run stage-specific command set from `.codex/multi-agent/stage-gates.yaml`.
- Run `pnpm verify:confidence` before final release gate.

## Expected Artifacts
- Acceptance run report.
- Gate decision packet references.
- Open-risk list when partial exceptions are proposed.
