# Architecture

Last updated: 2026-02-14

## Summary
ESG OS is a SQL-first, multi-tenant ESG SaaS prototype. The database (PostgreSQL) is the system of record and runs core mutations via stored procedures with Row Level Security (RLS). The API is a thin orchestration layer. The web app is a Next.js App Router UI. AI capabilities live in a separate FastAPI service and must remain human-in-the-loop.

Key decision: see `docs/ADR/0001-sql-first-architecture.md`.

## High-Level Diagram
```mermaid
flowchart LR
  Web[apps/web\nNext.js 14] -->|GraphQL/REST| API[apps/api\nNestJS]
  API -->|SQL (Kysely + pg)\nSET LOCAL app.tenant_id| DB[(Postgres 14+\nRLS + procs)]
  Worker[jobs/worker\nGraphile Worker] -->|SQL + jobs| DB
  Web -->|/api/ai/* (currently stubbed)| WebAI[Next route handlers]
  WebAI -->|future: HTTP| AI[apps/ai\nFastAPI]
  API -->|presign URLs| S3[(S3/MinIO)]
  Web -->|upload/download via presigned URL| S3
```

## Tenancy & Security Model
- Tenant isolation is enforced in PostgreSQL via **RLS**.
- Request-scoped tenancy is set in the API via **AsyncLocalStorage** and applied with `SET LOCAL app.tenant_id` / `app.user_id` inside DB transactions.
- Clients must never be trusted to provide `tenantId` as an input for authorization decisions.

Related docs:
- `docs/MONOREPO_RULES.md` (binding guardrails)
- `docs/SECURITY.md`, `docs/SECURITY_AND_PRIVACY.md`

## Database Architecture (SQL-first)
- Core writes should be implemented as stored procedures (idempotent, locked, auditable).
- Large tables (e.g., facts) are partitioned (quarterly) and indexed for predictable query performance.
- Migrations are managed by Sqitch: `sql/deploy`, `sql/revert`, `sql/verify`.

## Service Responsibilities

### `apps/web` (Next.js)
- UI and user workflows (data intake, compliance, reporting, exec KPIs).
- Hosts Next route handlers under `apps/web/app/api/*`.
- Note: AI routes under `apps/web/app/api/ai/*` are currently placeholders and should be wired to `apps/ai`.

### `apps/api` (NestJS)
- Authentication/RBAC enforcement, orchestration, and DB boundary.
- Runs all DB calls under ALS tenancy context.
- Exposes GraphQL resolvers and REST endpoints for file ops / tokenized public flows.

### `apps/ai` (FastAPI)
- OCR, mapping suggestions, narrative drafting, compliance guidance.
- Must adhere to “no AI-autonomous pass/fail” policy (see `docs/AI_POLICY.md`).

### `jobs/worker` (Graphile Worker)
- Async compute: recalculations, exports, batch validations, ingestion.
- Work is idempotent; retries are safe.

## Observability (target)
- Structured logs with `request_id`, `tenant_id`.
- Metrics: request p95s, worker lag, job failure rate, export durations.
- Alerts per `docs/MONOREPO_RULES.md` (budgets + thresholds).

