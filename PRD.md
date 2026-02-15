# Product Requirements Document (PRD) — ESG OS (Prototype → MVP)

Version: 0.1  
Last updated: 2026-02-14

## 1) Product Summary
ESG OS is a multi-tenant ESG data and reporting system (India-first, BRSR) that helps companies ingest evidence-backed activity data, calculate Scope 1/2/3 emissions with versioned factors, track compliance gaps, and generate exportable reports with auditability (lineage + freeze).

## 2) Goals (MVP)
- Reduce time to produce a BRSR-aligned reporting pack (data → calc → compliance → export).
- Maintain strong tenant isolation and auditability from day one (RLS + lineage + freeze).
- Make the “happy path” smooth: upload → map → approve → recalc → report export.

## 3) Non-Goals (MVP)
- Full “global ESG” compliance coverage (focus on BRSR-first).
- Fully autonomous AI decisions (AI is assistive only; human approval required).
- Complex integrations (ERP/utility APIs) beyond simple CSV/PDF ingestion.

## 4) Primary Users
- ESG/Admin: configures org/entities, manages factor sets, runs reports, closes compliance gaps.
- Plant/Site Manager: uploads evidence and validates activity data.
- Auditor: reviews frozen periods, checks lineage/evidence, exports audit pack.
- Supplier (Scope 3): submits data via tokenized portal.

## 5) Core Workflows (MVP)
1) Onboard tenant, entities, sites, users (RBAC).
2) Ingest data:
   - Upload CSV/XLSX (activity data) and PDFs (utility bills/evidence).
   - Map columns to canonical schema; validate; approve.
3) Calculate:
   - Scope 1/2/3 rollups by entity/site/period.
   - Recalc jobs are idempotent; results are reproducible via factor/version references.
4) Compliance (BRSR):
   - Questionnaire + rule checks.
   - Gap list with remediation checklist and evidence links.
5) Reporting:
   - Generate PDF/Excel exports.
   - Freeze a period for audit; generate auditor tokens for read-only access.
6) Supplier portal:
   - Tokenized form to submit activity data + evidence.
7) Executive KPIs:
   - Dashboard and monthly brief (assistive narrative).

## 6) Functional Requirements (MVP)
- Tenancy: RLS enforced on all tenant tables; no client-supplied tenant auth.
- Evidence: content-addressed, immutable; presigned S3 URLs; MIME validation.
- Calc: deterministic outputs; factor sets are versioned; recalcs are traceable.
- Compliance: rule outputs are explainable and link to evidence.
- Exports: reproducible; include metadata (period, factor versions, lineage pointers).
- Audit: freeze mechanism; auditor access uses expiring tokens; read-only.

## 7) Quality Attributes / Constraints
- SQL-first architecture (stored procedures for core mutations). See `docs/ADR/0001-sql-first-architecture.md`.
- Performance budgets and CI gates per `docs/SCALE_RULES.md` / `docs/MONOREPO_RULES.md`.
- Security and privacy requirements per `docs/SECURITY*.md`.

## 8) Success Metrics
- Time-to-report for a seeded tenant: < 30 minutes end-to-end (guided).
- Export success rate: > 99% on seeded datasets.
- No cross-tenant data access regressions (RLS tests must pass).

## 9) Open Questions
- Exact BRSR rule coverage for MVP (which sections + required evidence types).
- Factor set sources and update cadence for pilot customers.
- Freeze semantics: per site vs per entity vs tenant-wide reporting period.

## 10) Delivery Notes (how to execute fast)
- Keep work vertical-slice oriented (one workflow end-to-end).
- Update `Progress.md` weekly and when milestones change.
- Add an ADR for any cross-cutting architectural change.

