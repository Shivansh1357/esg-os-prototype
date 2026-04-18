---
name: compliance-rule-engine-builder
description: Use for deterministic compliance rule graph design, findings lifecycle, and evidence/completeness enforcement without AI verdict logic.
---

# compliance-rule-engine-builder

## Scope
- Build and maintain deterministic compliance rules and evaluations.
- Control findings lifecycle and completeness scoring.
- Enforce evidence requirements.

## Invariants
- PASS/FAIL/RISK outcomes are deterministic for same input state.
- Completeness is computed from explicit rule weights and evidence state.
- Rule behavior is explainable and reproducible.

## Forbidden Patterns
- AI-generated or probabilistic final verdict logic.
- Hidden mutable rule state.
- Evidence bypass for evidence-required findings.

## Required Validation
- `pnpm --filter @apps/api test -- compliance.spec.ts compliance.lifecycle.e2e.spec.ts`
- Rule determinism review on changed rule paths.

## Expected Artifacts
- Rule catalog delta.
- Deterministic evaluation traces.
- Findings lifecycle test evidence.
