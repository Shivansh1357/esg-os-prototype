# Multi-Agent Coordination Policy

## 1. Branching Model
- Agent branch format: `agent/<agent-name>/<phase>-<scope>`.
- Integration branch format: `integration/phase-<n>`.
- `main` accepts merges only from integration branches after gate approval.

## 2. Artifact-First Handshake
- Every lane completion requires `.codex/artifacts/phase-<n>/<agent>/handoff.md`.
- Handoff must include:
- summary of changes
- risks and known limits
- command outputs and evidence references
- gate-affecting contract changes (if any)

## 3. Ownership and Cross-Domain Rules
- Agent may edit only owned paths defined in `ownership-locks.yaml`.
- Cross-domain change requires:
1. change request artifact from requesting agent
2. owner agent implementation
3. reviewer signoff per lock entry
- Unauthorized cross-domain edits are rejected.

## 3.1 Institutional Invariants (Non-Negotiable)
- Tenant isolation and RLS integrity are mandatory and fail-closed.
- Deterministic core flows (`recalc`, compliance evaluation, completeness, freeze, lineage) cannot include AI decision logic.
- Worker lifecycle invariants (advisory locking, idempotency, safe retries) are mandatory.
- Contract freeze integrity remains strict and cannot be bypassed by phase-local velocity.

## 4. Contract Freeze Enforcement
- Frozen contracts are defined in `contracts.yaml`.
- Contract drift is blocked unless all required signoffs are attached.
- Protected contract files (`apps/api/src/graphql/schema.gql.ts`, `sql/**`, `.codex/multi-agent/contracts.yaml`) require:
- `orchestrator-approved` PR label
- semantic version bump in `.codex/multi-agent/contract-version.txt`
- Required signoffs for contract changes:
- Product Owner
- Architecture Reviewer
- QA
- Orchestrator

## 5. Parallel Execution Boundaries
- Lanes inside the same phase may run in parallel when dependencies are satisfied.
- No phase transition before all lanes in that phase are complete and gate is approved.

## 5.1 Phase Bleed Prevention
- Active phase in `stage-gates.yaml` is authoritative for permitted mutation scope.
- In Phase 2, compliance/reporting SQL tracks are blocked to prevent phase bleeding.
- Any blocked-path modification is rejected even when ownership would otherwise permit it.

## 6. Gate Decision Protocol
- Gate decision record type: `GateDecision`.
- Allowed statuses: `APPROVE`, `BLOCK`, `APPROVE_WITH_EXCEPTION`.
- `APPROVE_WITH_EXCEPTION` requires documented exception scope, rollback plan, and expiration date.

## 6.1 Required PR Labels
- `agent:<id>` optional fallback when branch name is not `agent/<id>/...`.
- `orchestrator-approved` required for protected contract and stage-gate state changes.
- `architecture-approved` allowed approval label for `AGENTS.md` edits.
- `security-approved` required for governance self-protection and high-risk escalations.

## 6.2 Change Type Label Contract
- Every governed PR must include exactly one `change_type:<value>` label.
- Allowed values:
- `change_type:ui-only`
- `change_type:ai-tuning`
- `change_type:additive-backend`
- `change_type:contract-breaking`
- `change_type:stage-transition`
- `ui-only` is limited to `apps/web/**` (plus docs/artifacts) and cannot touch protected contracts or stage state.
- `ai-tuning` is limited to `apps/ai/**` (plus docs/artifacts) and cannot touch SQL or governance control-plane files.
- `additive-backend` supports additive backend evolution; SQL deltas require explicit sqitch verify evidence label.
- `contract-breaking` requires contract version bump and orchestrator approval.
- `stage-transition` requires orchestrator approval and decision artifact updates.

## 6.3 Risk Budget Escalation
- If a PR exceeds the active phase risk budget envelope, escalation is mandatory.
- Required escalation labels:
- `orchestrator-approved`
- `architecture-approved`
- `security-approved`
- Governance self-protection files (`scripts/governance-check.ts`, `.github/workflows/governance.yml`) always require escalation labels.

## 7. Merge Policy
- No direct merge from agent branches to `main`.
- No gate bypass for emergency unless Security + Architecture + Orchestrator sign the exception.

## 8. Self-Evolution Loop
- Weekly cadence:
1. QA and Product Owner submit improvement proposal artifacts.
2. Architecture and Security review proposals.
3. Orchestrator updates skills/gates only after approvals.
