# Monorepo Rules (v1.0.0)

> Authoritative guardrails for the ESG OS monorepo. These rules are **binding**. If something here blocks delivery, propose an ADR (Architecture Decision Record) and get approval before deviating.

## 1) Structure & Ownership

```
apps/
  web/        # Next.js 14 (App Router, TS)
  api/        # NestJS + Kysely + pg + ALS (AsyncLocalStorage)
  ai/         # FastAPI (OCR, mapping, narrative, compliance guidance)
jobs/         # Graphile Worker tasks
libs/
  rules/      # BRSR rules (JSON/YAML) + TS types/validators
  ui/         # (optional) shared components/types
sql/          # Sqitch migrations (deploy/revert/verify)
docker/       # compose.yml, local infra
infra/        # Terraform (post-MVP)
docs/         # This folder (rules, policies)
```

- Each top-level directory MUST have an **owner** (CODEOWNERS) and a **README.md**.
- Every new subsystem requires an **ADR** under `docs/adr/`.

## 2) Versioning & Branching

- **Trunk-based** development:
  - `main` is releasable daily.
  - Feature branches: short-lived (`feat/*`, `fix/*`).
- **Semantic Versioning** for product releases: `MAJOR.MINOR.PATCH`.
- **Conventional Commits** (enforced):
  - `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `chore:`
- Release tags: `vX.Y.Z` on `main`. Changelog auto-generated.

## 3) Build, Test, Quality Gates

- CI must pass before merge:
  - Type-check (TS)
  - Lint (ESLint + Prettier)
  - Unit tests (api, ai)
  - SQL verify (`sqitch verify` + optional pgTAP)
  - E2E (Playwright) smoke for critical flows
- **Performance budgets** (CI checked):
  - Dashboard query p95 < **400ms** (seeded 10k facts)
  - Report export p95 < **60s**
  - Recalc p95 < **30s** for site-quarter

## 4) Database Rules (PostgreSQL)

- **SQL-first**: stored procedures for core mutations; **Kysely** only as a typed query builder and raw SQL gateway.
- **RLS (Row-Level Security)** enabled on all tenant tables.
  - All requests MUST set `SET LOCAL app.tenant_id`, `SET LOCAL app.user_id` via ALS middleware.
- **Partitions**: `facts` partitioned **by quarter** (range on `period_start`).
- **Indexes**: predictable composite indexes (e.g., `(tenant_id, entity_id, metric_code, period_start)`).
- **Migrations**: via **Sqitch** with `deploy/`, `revert/`, `verify/`. No ORM migrations.
- **Locks**:
  - Use `FOR UPDATE SKIP LOCKED` for queues/batches.
  - Use **advisory locks** for cross-table consistency (key = hash of `(tenant, entity, period)`).
- **Long transactions are forbidden**. Keep to < 500ms except exports.
- **Pagination**: keyset (no OFFSET for large sets).
- **No `SELECT *`** in shipped code. Explicit columns only.

## 5) API & Jobs

- **API**: NestJS GraphQL + REST for file ops. Strict RBAC guards on resolvers.
- **Jobs**: Graphile Worker only; payloads MUST be idempotent. Dead-letter queue required.
- **Idempotency**: when exposed to external events (webhooks/email-in), store idempotency keys.
- **Rate limits**: public endpoints behind rate limiting (reverse proxy or middleware).

## 6) Files & Evidence

- S3/MinIO with **presigned URLs**, MIME validation, size caps (default 25 MB).
- Evidence objects must be content-addressed (SHA-256) and immutable. Keep hash in DB.

## 7) AI Integration

- AI calls via `apps/ai` ONLY. No direct LLM calls from `web` or `api`.
- **Human-in-the-loop** for all AI-generated content (narratives, guidance).
- No automated PASS/FAIL decisions from AI.

## 8) Observability & Ops

- **Pino** structured logs with `request_id` & `tenant_id`.
- **Metrics**: request latency, queue depth, job success/fail counts.
- **Alerts** on:
  - p95 export > 60s
  - calc failures > 1%/hour
  - worker lag > 5 min
- **Backups**: nightly db backups; RTO ≤ 4h, RPO ≤ 1h.

## 9) Security

- TLS 1.2+, AES-256 at rest. Secrets in AWS Secrets Manager (or env for dev).
- SSO/SAML support (enterprise), SCIM user provisioning (post-MVP).
- Regular dependency scanning; no secrets in repo (git-secrets enforced).
- Pen-test checklist before pilots.

## 10) Code Review & Ownership

- 1 reviewer minimum; owners for cross-cutting modules (DB, security, AI).
- **Never** merge red PRs.
- Changes to SQL procs or RLS policies require DB owner review.

## 11) Feature Flags & Migrations

- New features behind flags.
- **Zero-downtime migrations**:
  - Add columns nullable → backfill → switch reads → remove legacy.
  - Avoid breaking changes to procs; add new versioned procs when needed.

## 12) Environments

- `dev` (per-PR), `staging` (tagged), `pilot` (locked), `prod`.
- Region default: **ap-south-1**. No cross-region writes for MVP.
