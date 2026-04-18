# PRD — ESG OS: MVP to Pilot-Ready

Version: 1.0
Date: 2026-04-17
Author: AI Product-Build Orchestrator

## Product Vision

ESG OS is the first BRSR-native ESG data and reporting platform. It replaces
fragmented spreadsheets and expensive Western tools with an integrated,
auditable workflow: **upload → OCR → map → approve → calculate → comply →
report → freeze → export → audit**.

**Positioning:** "The only ESG platform built for BRSR from day one. From
source document to auditor-ready report in one workflow."

## Target Users

1. **ESG/Sustainability Head** — configures org, manages factor sets, runs reports
2. **Plant/Site Manager** — uploads evidence, validates activity data
3. **Auditor (Internal/External)** — reviews frozen periods, checks lineage
4. **Supplier (Scope 3)** — submits data via tokenized low-friction portal
5. **CXO/Board** — views executive cockpit, monthly briefs

## MVP Stop Condition

ALL of the following must be true:
- [ ] All P0 items checked off
- [ ] `pnpm verify:confidence` passes (API JWT + E2E + lint + build)
- [ ] `pnpm seed:pilot-demo` creates working demo tenant
- [ ] Docker-compose local environment fully reproducible
- [ ] End-to-end demo (upload → freeze → export) works in < 10 minutes
- [ ] No cross-tenant data leaks (RLS tests pass)

## P0 Features (Required for Pilot)

### Critical Gap: Wire AI Service
- [x] Wire `/api/ai/ocr/utility-bill` to FastAPI OCR endpoint (remove hardcoded mock)
- [x] Wire `/api/ai/map/columns` to FastAPI column mapping endpoint (remove naive matching)
- [x] Wire `/api/ai/brief/monthly` to FastAPI narrative endpoint (remove hardcoded bullets)
- [x] Add AI service health check to startup and display status in UI
- [x] Add error handling + fallback UX when AI service is unavailable

### Competitive Differentiator: BRSR Compliance Engine
- [x] Validate BRSR questionnaire covers all 9 NGRBC principles
- [x] Add BRSR Core KPI mappings (9 mandatory KPIs per SEBI circular)
- [x] Add compliance rule explanations with evidence linking for each principle
- [x] Add BRSR section-to-evidence mapping (which evidence satisfies which disclosure)
- [ ] Generate BRSR-formatted export template (matching SEBI prescribed format)

### Competitive Differentiator: Assurance Readiness
- [x] Verify freeze mechanism prevents all mutations on frozen periods
- [x] Verify auditor token generation produces working read-only access
- [x] Add exportable audit pack (lineage + evidence + calculations in one ZIP)
- [x] Add assurance worksheet export (pre-filled for auditor review)

### Data Pipeline Hardening
- [ ] Verify upload → map → approve → recalc pipeline works end-to-end
- [ ] Add validation for duplicate fact detection (same metric/entity/period)
- [ ] Add bulk upload support (multiple files in one session)
- [ ] Verify recalculation determinism (same inputs → same outputs)

### Supplier Portal (Scope 3 Differentiator)
- [ ] Verify tokenized supplier form works without authentication
- [ ] Add bilingual support validation (English + Hindi)
- [ ] Verify supplier response → approval → Scope 3 recalc pipeline
- [ ] Add supplier coverage dashboard (% of Scope 3 categories covered)

### Executive Cockpit
- [ ] Verify KPI grid displays live data correctly
- [ ] Wire monthly brief to AI narrative service (not hardcoded)
- [ ] Add scope breakdown by category (Scope 1 fuel/process, Scope 2 grid, Scope 3 by category)
- [ ] Verify snapshot mode shows frozen report data

### Export & Reporting
- [ ] Verify PDF export generates correctly formatted report
- [ ] Verify Excel export includes all required sheets
- [ ] Verify JSON export is machine-readable and complete
- [ ] Add BRSR-specific export format (per SEBI template structure)

### Testing & Quality
- [ ] All existing E2E tests pass
- [ ] All existing API tests pass
- [ ] All existing AI tests pass
- [ ] Add E2E test: full happy path (upload → approve → recalc → report → freeze → export)
- [ ] Add E2E test: supplier portal submission flow
- [ ] Verify RLS stress tests pass (no cross-tenant data access)

### DevOps & Reproducibility
- [ ] `docker compose up` starts all services (postgres + minio)
- [ ] `pnpm install && pnpm dev` starts web + API without errors
- [ ] Sqitch deploy + verify passes on clean database
- [ ] Add health check endpoints to all services
- [ ] Create one-command seed script for demo data

## P1 Features (Nice-to-Have, Post-Pilot)

### Enhanced AI Capabilities
- [ ] AI-powered anomaly detection on uploaded data (flag outliers with explanation)
- [ ] Auto-suggest remediation actions for compliance gaps
- [ ] Multi-language OCR support (Hindi + English utility bills)
- [ ] AI-generated executive narrative with trend attribution

### Multi-Framework Support (Beyond BRSR)
- [ ] Add GRI framework mapping alongside BRSR
- [ ] Add CDP questionnaire template support
- [ ] Add ISSB (IFRS S1/S2) alignment indicators
- [ ] Framework cross-mapping (show which BRSR disclosures also satisfy GRI/CDP)

### Advanced Scope 3
- [ ] Spend-based estimation for suppliers who don't respond
- [ ] Supplier ESG scoring and risk flagging
- [ ] Category-level emission factor recommendations
- [ ] Value chain BRSR Core collection (per SEBI requirement)

### Platform Maturity
- [ ] Email notifications for pending approvals
- [ ] Scheduled report generation (monthly/quarterly)
- [ ] API rate limiting and abuse protection
- [ ] User activity dashboard for admin
- [ ] Data retention and archival policies
- [ ] SSO/SAML integration for enterprise customers

### Observability & Operations
- [ ] Structured logging across all services
- [ ] Prometheus metrics + Grafana dashboards
- [ ] Error tracking (Sentry or equivalent)
- [ ] Backup/restore automation
- [ ] Performance budget enforcement in CI

## Non-Goals (Explicitly Out of Scope)

- Full global ESG framework coverage (CSRD, EU Taxonomy) — BRSR first
- ERP/utility API integrations — CSV/PDF ingestion only for MVP
- Mobile app — web-responsive is sufficient
- Real-time collaboration — single-user workflows are fine
- AI autonomous decisions — human-in-the-loop always
- On-premise deployment — SaaS only
- Custom report builder — template-based exports only
- Carbon offset marketplace integration

## Architecture Constraints

- SQL-first: stored procedures for core mutations
- Multi-tenant RLS: `SET LOCAL app.tenant_id` via ALS
- Evidence is content-addressed and immutable
- Parameterized SQL only; no `SELECT *`
- AI is assistive; no autonomous PASS/FAIL
- All calculations must be reproducible via factor/version references
