# ESG OS — MVP Readiness Assessment

Last verified: 2026-06-13 (against a live PostgreSQL 16 instance with the full schema deployed)

This document records the **verified** state of the product (not aspirational claims),
the fixes applied in this pass, and a prioritized backlog to reach a hardened,
sellable MVP. It was produced by running the build/test toolchain end-to-end and by
a parallel domain audit (frontend, backend, database/worker, AI/testing).

---

## 1. Verified Health (ground truth)

Every item below was executed, not assumed.

| Layer | Check | Result |
|-------|-------|--------|
| Web (Next.js) | `tsc --noEmit` | ✅ clean |
| Web | `next lint` | ✅ 0 warnings/errors |
| Web | `next build` (prod) | ✅ 23 routes compile |
| API (NestJS) | `tsc --noEmit` | ✅ clean |
| API | Jest integration suite vs live DB | ✅ **22/22 pass** |
| Database | All 24 Sqitch migrations deploy | ✅ clean |
| AI (FastAPI) | `pytest` (incl. Tesseract OCR) | ✅ **10/10 pass** |

What the API suite actually proves (not stubs):
- **RLS tenant isolation** — basic + stress (concurrent writes across 8 tenants, no bleed).
- **Emissions determinism** — identical inputs → identical Scope 1/2/3 totals; version increments by exactly one; factor-set switch changes results deterministically.
- **Freeze integrity** — frozen reports return immutable snapshots; locked periods block fact mutation.
- **Supplier Scope 3** — invite → response → approve → coverage % lifecycle.
- **Compliance** — BRSR evaluate/resolve with deterministic completeness, no duplicate findings.
- **Performance** — `get_exec_kpis` returns under 400 ms with 100k facts.

**Conclusion:** the core platform is genuinely functional — multi-tenant, SQL-first,
human-in-the-loop AI, with a real (not mocked) data/calc/compliance/report pipeline.
The gaps are in hardening, a few unwired admin screens, and test/CI breadth — not in
the foundational architecture.

---

## 2. Fixes applied in this pass

All changes verified against the green test suite + web build.

1. **Authz gap on executive endpoints** (`apps/api/src/exec/exec.controller.ts`)
   `/exec/summary` and `/exec/:reportId` relied on RLS alone with no role check.
   Added `requireRole('ADMIN','MEMBER','AUDITOR')` (excludes SUPPLIER) + rate limiting,
   matching every other controller.

2. **Fail-fast env validation** (`apps/api/src/main.ts`)
   Bootstrap now validates required secrets (`DATABASE_URL`, `JWT_SECRET` in jwt mode,
   token secrets in production). Throws in production, warns in dev/test — so missing
   config surfaces at startup instead of as an opaque 500 on first use.

3. **Configurable CORS** (`apps/api/src/main.ts`)
   Origin list now reads `CORS_ORIGINS` (comma-separated), defaulting to localhost.
   Previously hard-coded to `http://localhost:5050` — unusable in production.

4. **Global error boundaries** (`apps/web/app/error.tsx`, `global-error.tsx`)
   The app had no error boundary, so any render error blanked the screen. Added an
   on-brand route-level boundary with retry + a root-level fallback.

---

## 3. Prioritized backlog (not yet done)

Ordered by value-to-risk. P0 = before a paid customer; P1 = before scale; P2 = polish.

### P0 — correctness & trust
- **Wire the stub admin screens.** Onboarding (`/onboarding`), Users (`/admin/users`),
  and Entities (`/admin/entities`) show success toasts but don't persist. Either wire
  to real endpoints or clearly mark as "demo" so users don't lose work.
- **Real authentication & login.** Today tenant/user/role come from a signed JWT
  (good) but there's no login UI or token issuance flow in the app itself. Add a
  login page + session handling; stop relying on `NEXT_PUBLIC_*` identity in the client.
- **LLM call timeouts** (`apps/ai/app/utils/llm.py`). OpenAI/Bedrock calls have no
  timeout; a hung provider hangs the request. Add a configurable timeout + fallback.
- **Notification idempotency** (`sql/.../210_notifications.sql` + scheduled worker).
  Scheduled-report retries can insert duplicate notifications — add a uniqueness key.

### P1 — scale & operability
- **Fact hot-path indexes.** Add indexes for outlier detection and compliance eval
  (`facts(tenant_id, metric_code)`, `facts(tenant_id, status, metric_code)`).
- **Worker transaction boundaries** (`jobs/worker/src/tasks/report.scheduled.ts`).
  Uses two connections; a failure between them leaves schedules stale. Make it one
  transaction or idempotent on a schedule key.
- **CI breadth.** Add `pytest` (AI) and an AI service container to CI; the AI service
  is currently untested in the pipeline. Add a freeze-then-recalc immutability test
  and an S3/MinIO round-trip evidence test.
- **`get_report_export_payload` definition** is touched by two migrations (110, 150).
  Confirm the final signature is the intended one and consolidate to avoid drift.

### P2 — UX polish & accessibility
- Accessibility pass: ARIA labels on tables/modals/buttons, focus management, contrast.
- Replace the `window.prompt()` for Entity ID in `UploadBillModal` with an in-dialog field.
- Loading skeletons on data tables; consistent inline error states; either implement or
  remove the non-functional header search box.

---

## 4. Notes on items that are NOT bugs

A domain audit flagged these; on inspection they are intentional or already mitigated:
- **Global reference tables without RLS** (`factor_sets`, `emission_factors`,
  `compliance_rules`, `eeio_factors`, `metrics`) contain no tenant data and are meant
  to be globally readable. RLS would add no isolation value here.
- **Client-supplied role header** is only honored in `hybrid`/`header` (dev) auth mode.
  In `jwt` mode (CI/production) role comes from verified JWT claims and cannot be spoofed.
- **`SET LOCAL app.tenant_id` per transaction** is correctly applied via AsyncLocalStorage
  in `withTenant.ts`; the RLS stress test confirms isolation holds under concurrency.

---

## 5. How to reproduce the verification locally

```bash
pnpm install
# Postgres on :5432 with a db named "esg-os" and role postgres/esg
#   then apply sql/deploy/*.sql in sqitch.plan order (or: pnpm db:deploy via docker)
cd apps/api && DATABASE_URL=postgres://postgres:esg@localhost:5432/esg-os \
  JWT_SECRET=test-jwt-secret AUTH_MODE=jwt npx jest --runInBand
cd apps/web && pnpm lint && pnpm build
cd apps/ai && pip install -r requirements.txt && pytest -q   # needs tesseract-ocr
```
