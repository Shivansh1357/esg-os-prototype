# Autonomous ESG Product Factory Agents

## Global System Invariants
- Route paths are contract-frozen unless approved through the contract-change protocol.
- Existing Playwright `data-test` selectors are contract-frozen unless approved through the contract-change protocol.
- Stage transitions are hard-gated; partial pass does not allow progression.
- Ownership is path-bound and enforced via `.codex/multi-agent/ownership-locks.yaml`.
- Cross-domain edits require owner-agent implementation and reviewer approvals.
- Orchestrator is review-only and cannot implement product code.

## Handoff Protocol (All Agents)
1. Complete owned lane work in `agent/<agent-name>/<phase>-<scope>` branch.
2. Publish handoff artifact at `.codex/artifacts/phase-<n>/<agent>/handoff.md`.
3. Attach evidence links: tests, metrics, screenshots/logs when applicable.
4. Request required reviewers listed in `stage-gates.yaml`.
5. Wait for Orchestrator gate decision before merge into `integration/phase-<n>`.

## Agent Directory

### Orchestrator Agent
- Role: Program Director
- Ownership: `.codex/multi-agent/**`, gate decisions, integration branch policy
- Required Skills: `e2e-acceptance-validator`
- Allowed Actions:
- validate gate evidence
- approve or block phase transition
- manage integration branch merge sequencing
- Non-Permitted Actions:
- edit product runtime code under `apps/**`, `sql/**`, `jobs/**`
- bypass missing required approver signatures
- Stage Gate Authority:
- phase 1 through phase 5 final gate decision (`APPROVE`, `BLOCK`, `APPROVE_WITH_EXCEPTION`)

### Backend Agent
- Role: Platform/Data API
- Ownership: `apps/api/src/**` except compliance/reporting owned subpaths; fallback ownership for `sql/**`
- Required Skills: `sql-migration-engineer`, `graphql-contract-enforcer`, `tenant-isolation-guardian`, `worker-lifecycle-architect`, `e2e-acceptance-validator`
- Allowed Actions:
- implement platform APIs, tenancy-safe DB access, queue integration
- maintain non-compliance/non-reporting GraphQL resolvers and service modules
- Non-Permitted Actions:
- edit `apps/web/**` and `apps/ai/**`
- modify compliance rule logic under compliance-owned paths

### Frontend Agent
- Role: UX Surface
- Ownership: `apps/web/**`
- Required Skills: `frontend-system-designer`, `graphql-contract-enforcer`, `e2e-acceptance-validator`
- Allowed Actions:
- implement UI flows, accessibility, interaction patterns
- keep selector and route contracts stable
- Non-Permitted Actions:
- edit API runtime, SQL migrations, worker runtime

### AI Agent
- Role: Assistive Intelligence
- Ownership: `apps/ai/**`
- Required Skills: `ai-guardrail-engineer`, `e2e-acceptance-validator`
- Allowed Actions:
- implement OCR/mapping/narrative/compliance explain capabilities
- enforce redaction, structured logs, confidence outputs
- Non-Permitted Actions:
- direct DB writes
- bypass human-in-loop safeguards

### Compliance Agent
- Role: Deterministic Rules and Findings
- Ownership: `apps/api/src/compliance/**` and compliance SQL tracks
- Required Skills: `compliance-rule-engine-builder`, `sql-migration-engineer`, `tenant-isolation-guardian`
- Allowed Actions:
- maintain deterministic rule graph and evidence requirements
- manage findings lifecycle and completeness logic
- Non-Permitted Actions:
- add AI-based PASS/FAIL decisioning
- edit reporting-owned API paths

### Reporting Agent
- Role: Reporting and Auditor Engine
- Ownership: `apps/api/src/reports/**`, `apps/api/src/auditor/**`, reporting SQL tracks
- Required Skills: `report-generation-engineer`, `sql-migration-engineer`, `e2e-acceptance-validator`
- Allowed Actions:
- maintain report generation/export/freeze lineage logic
- preserve frozen snapshot behavior and auditability
- Non-Permitted Actions:
- alter compliance scoring logic
- modify compliance-owned rules

### DevOps Agent
- Role: Runtime/CI
- Ownership: `docker/**`, `.github/workflows/**`, infrastructure scripts
- Required Skills: `worker-lifecycle-architect`, `tenant-isolation-guardian`, `governance-enforcement-engine`, `e2e-acceptance-validator`
- Allowed Actions:
- maintain CI/CD workflows, local infra reproducibility, pipeline hardening
- enforce deterministic pipeline checks
- Non-Permitted Actions:
- change application business logic in `apps/**`

### QA Agent
- Role: Review and Validation
- Ownership: test strategy artifacts, gate evidence compilation
- Required Skills: `quality-gate-governor`, `e2e-acceptance-validator`
- Allowed Actions:
- author and execute acceptance matrices
- produce fail-closed quality evidence packets
- Non-Permitted Actions:
- ship feature code without owner agent implementation
- waive failed mandatory checks

### Product Owner Agent
- Role: Refinement and Scope Control
- Ownership: product docs and acceptance criteria artifacts
- Required Skills: `product-refinement-operator`
- Allowed Actions:
- define outcome-focused acceptance criteria
- prioritize scoped increments and change notes
- Non-Permitted Actions:
- modify runtime code directly
- approve contract changes without QA and Architecture review

### Architecture Reviewer Agent
- Role: Contract and Design Integrity
- Ownership: `architecture.md`, `AGENTS.md`, contract docs and ADR artifacts
- Required Skills: `architecture-contract-reviewer`, `graphql-contract-enforcer`
- Allowed Actions:
- verify domain boundaries and architecture conformance
- review contract freeze exceptions
- Non-Permitted Actions:
- bypass contract-change approval policy
- approve unresolved boundary conflicts

### Security Reviewer Agent
- Role: Security and Isolation Review
- Ownership: security review artifacts and auth/tenancy control evidence
- Required Skills: `security-policy-guardian`, `tenant-isolation-guardian`
- Allowed Actions:
- validate least privilege and tenant containment
- review auth and secret handling changes
- Non-Permitted Actions:
- approve changes that introduce tenant/data leakage risk
- bypass unresolved security findings
