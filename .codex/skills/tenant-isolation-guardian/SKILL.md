---
name: tenant-isolation-guardian
description: Use for validating tenant isolation, RLS integrity, and zero cross-tenant data access across API, SQL, and worker paths.
---

# tenant-isolation-guardian

## Scope
- Enforce tenant safety in API, SQL, and worker execution paths.
- Validate use of tenant context and RLS constraints.
- Detect potential cross-tenant reads/writes.

## Invariants
- Tenant context is required on every data path.
- No cross-tenant leakage is tolerated.
- Authorization context and tenancy context remain consistent.

## Forbidden Patterns
- Queries bypassing tenant constraints.
- Global updates against tenant-scoped tables.
- Missing tenant context setup before DB calls.

## Required Validation
- `pnpm --filter @apps/api test -- rls.e2e.spec.ts`
- Additional tenancy-focused tests for changed areas.
- Security reviewer signoff on high-risk paths.

## Expected Artifacts
- Tenant isolation audit report.
- Query/path checklist for changed code.
- Evidence references in gate decision packet.
