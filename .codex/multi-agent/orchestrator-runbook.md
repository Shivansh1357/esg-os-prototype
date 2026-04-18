# Orchestrator Runbook

## Purpose
Operational checklist for running the autonomous ESG factory with hard phase gates.

## Pre-Phase Checklist
1. Confirm active phase and lane owners from `execution-graph.yaml`.
2. Confirm lock map has no ambiguous ownership overlaps.
3. Confirm contract freeze config is unchanged or approved.

## Per-Lane Intake
1. Verify handoff artifact exists: `.codex/artifacts/phase-<n>/<agent>/handoff.md`.
2. Verify required evidence links are present.
3. Verify no unauthorized cross-domain edits were made.

## Gate Evaluation
1. Execute or verify all gate commands from `stage-gates.yaml`.
2. Evaluate threshold metrics and mark pass/fail.
3. Collect required approver signoffs.
4. Publish `GateDecision` record with:
- phase
- status
- approver list
- timestamp
- evidence references
- exceptions (if any)
5. Persist decision artifact at `.codex/artifacts/gate-decisions/phase-<n>.json`.
  - include `check_results` with each stage check name and `pass|fail` status
6. Update `.codex/multi-agent/stage-gates.yaml` `progress.completed_phases` and `progress.current_phase`.

## Decision Outcomes
- `APPROVE`: merge into `integration/phase-<n>` and unlock next phase.
- `BLOCK`: reject transition, return remediation actions to owning lanes.
- `APPROVE_WITH_EXCEPTION`: allow transition only with explicit rollback plan and expiration.

## Release Readiness (Phase 5 Exit)
1. Confirm all phase gates approved.
2. Confirm `pnpm verify:confidence` passed.
3. Confirm no open high-risk security or architecture findings.
4. Approve integration-to-main merge.

## Weekly Self-Evolution Cadence
1. Intake QA/Product Owner proposals.
2. Route to Architecture and Security review.
3. Promote approved updates into skills, lock map, and stage gates.
4. Publish revision notes in governance docs.
