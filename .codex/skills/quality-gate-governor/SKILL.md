---
name: quality-gate-governor
description: Use for QA governance that enforces hard stage gates, evidence completeness, and fail-closed release quality controls.
---

# quality-gate-governor

## Scope
- Govern quality evidence for each phase gate.
- Validate that all required checks and approvals are present.
- Enforce fail-closed transition behavior.

## Invariants
- No phase exits without complete required evidence.
- QA signoff is based on measurable criteria.
- Exceptions are explicit, time-bound, and reversible.

## Forbidden Patterns
- Waiving mandatory failed checks.
- Approving based on subjective status updates only.
- Missing traceability between checks and gate decisions.

## Required Validation
- Gate matrix review against `stage-gates.yaml`.
- Evidence completeness check for all required approvers.

## Expected Artifacts
- Gate matrix validation report.
- QA signoff note with evidence links.
- Exception ledger entry when applicable.
