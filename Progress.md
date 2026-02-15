# Progress

Owner: TBD  
Last updated: 2026-02-14

This is the execution log + near-term plan for shipping the ESG OS prototype into a pilot-ready MVP.

## Current State (from repo)
- Monorepo structure exists: `apps/web` (Next.js), `apps/api` (NestJS), `apps/ai` (FastAPI), `jobs/worker` (Graphile Worker), `sql` (Sqitch).
- ADRs exist under `docs/ADR/` (SQL-first + RLS decision captured).
- AI endpoints in `apps/web/app/api/ai/*` are currently **stub implementations** (placeholders), not wired to `apps/ai` yet.

## Milestones

### M0 — Prototype baseline (now)
- [x] Tenancy foundations (RLS + ALS patterns)
- [x] Basic UI pages + API skeletons
- [x] Sqitch migration scaffold + verify scripts

### M1 — MVP (pilotable)
- [ ] Auth + org/tenant onboarding flow
- [ ] Data intake: uploads, mapping, evidence attach, approval
- [ ] Calculations: scope 1/2/3 pipelines + factor set versioning
- [ ] Compliance: BRSR questionnaire + gaps + remediation
- [ ] Reporting: PDF/Excel exports + freeze + auditor tokens
- [ ] Supplier portal: tokenized submissions + evidence
- [ ] Ops: backups/restore runbook + monitoring basics

### M2 — Pilot hardening
- [ ] Performance budgets met (see `docs/SCALE_RULES.md`)
- [ ] Security review pass (see `docs/SECURITY*.md`)
- [ ] Release checklist automated (see `docs/RELEASE_CHECKLIST.md`)

## Next 7–14 Days (recommended execution order)
1) Wire AI stubs to `apps/ai` (keep strict “human-in-the-loop” policy).
2) Make “upload → map → approve → recalc → report export” a single happy-path flow.
3) Add a minimal seed dataset + smoke E2E for the happy path.
4) Add operational basics: local docker compose, env templates, backup/restore procedure.

## Risks / Watchouts
- Tenancy: any endpoint that accepts `tenantId` from client is a critical bug (see `docs/MONOREPO_RULES.md`).
- Long transactions: calc/export paths must remain bounded; use jobs + advisory locks (see ADR-0001).
- AI scope creep: AI must not be the source of truth; approvals remain human.

## Working Agreement (fast agenting)
- Keep PRs small (1–3 vertical slices).
- For any new subsystem, add an ADR in `docs/ADR/`.
- Update `PRD.md` when scope changes; update this file when milestones move.

