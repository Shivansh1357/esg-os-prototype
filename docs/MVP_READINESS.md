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

## 2. Fixes applied (shipped)

All changes were verified against the live test suite + web build before merge.
Each merged PR also passed CI `test` (API + Playwright E2E) and `deploy-smoke`.

**PR #3 — API authz/bootstrap hardening + web error boundaries**
- Closed the authz gap on `/exec/*` (relied on RLS alone) — added
  `requireRole('ADMIN','MEMBER','AUDITOR')` + rate limiting.
- Fail-fast env validation at boot (throws in prod on missing `DATABASE_URL`/`JWT_SECRET`;
  warns on optional token secrets so a deploy is never blocked by them).
- Configurable CORS via `CORS_ORIGINS` (was hard-coded to localhost).
- Global error boundaries (`app/error.tsx`, `app/global-error.tsx`).

**PR #4 — wired the three stub admin screens + LLM timeouts**
- New REST controllers (RLS-scoped, parameterized, role-gated): `GET/POST /entities`,
  `GET /users` + `POST /users/invite`, `GET/PUT /settings`; migration `240_tenant_settings`.
- Onboarding/Users/Entities pages now persist via TanStack Query (was local-only state
  that lost data on refresh). Verified end-to-end against a live DB incl. RLS + authz.
- `LLM_TIMEOUT_SECONDS` (default 15s) on the OpenAI + Bedrock clients.

**PR #5 — UX polish + AI tests in CI**
- Functional header search (route/command palette, keyboard + ARIA); table loading
  skeletons on data/suppliers/audit; replaced `window.prompt` for Entity ID with an
  in-modal input (E2E updated accordingly).
- New `ai-test` CI job (Tesseract + `pytest`) — the AI service is now exercised in CI
  for the first time (`apps/ai/pytest.ini` + `conftest.py` make `import app` resolve
  under the bare `pytest` console script).

---

## 3. Prioritized backlog (remaining)

Ordered by value-to-risk. P0 = before a paid customer; P1 = before scale; P2 = polish.

### P0 — the main remaining gap
- **Real authentication & login.** Today tenant/user/role come from a signed JWT
  (which is sound), but there is no login UI or token-issuance flow in the app — the
  web client reads identity from `NEXT_PUBLIC_*` env vars. This is the #1 GTM blocker
  and deserves a dedicated, carefully-tested effort: a credential/SSO login, server-side
  token issuance, session/refresh handling, and removing client-embedded identity.
  Intentionally not rushed in this pass to avoid introducing security regressions.

### P1 — scale & operability
- **Notification idempotency / worker transaction boundaries**
  (`jobs/worker/src/tasks/report.scheduled.ts` + `210_notifications.sql`). A whole-job
  retry can re-call the export endpoint and insert duplicate notifications, and the
  schedule update + notification span two connections. Needs a dedup key + single
  transaction. Deferred here because the worker has no test harness yet — should land
  together with a worker test rather than as an unverified change.
- **Deeper test coverage.** Add a freeze-then-recalc immutability test and an S3/MinIO
  round-trip evidence test; add an AI service container to the smoke compose.
- **`get_report_export_payload`** is (re)defined across migrations 110/150 — confirm the
  final signature is intended and consolidate to avoid drift.

### P2 — polish
- Broader accessibility pass (focus management, contrast audit) beyond the icon-label
  and dialog-title fixes already in place.
- Consistent inline error states across all data tables; reusable pagination.

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
