---
name: governance-enforcement-engine
description: Use for deterministic CI enforcement of ownership locks, contract freeze controls, and phase-gate progression in the multi-agent control plane.
---

# governance-enforcement-engine

## Scope
- Enforce multi-agent governance invariants in CI.
- Validate PR diffs against ownership and contract policies.
- Validate stage progression and orchestrator gate authority.

## Invariants
- Ownership lock violations always fail closed.
- Protected contracts cannot drift silently.
- Phase progression cannot skip required gate completion.
- Governance-critical docs require explicit approval labels.

## Forbidden Patterns
- Best-effort governance checks that only warn.
- Merge paths that bypass orchestrator approvals for protected changes.
- Non-deterministic diff evaluation or environment-coupled behavior.

## Required Validation
- Execute governance checker on every pull request.
- Validate labels, branch identity, lock ownership, and contract version bumps.
- Validate stage-gate state consistency and phase monotonicity.

## Expected Artifacts
- Machine-readable governance result JSON.
- Violations list with file-level context.
- Gate progression audit summary.
