# ESG OS Prototype Monorepo

A SQL-first, multi-tenant ESG SaaS prototype (India-first, BRSR).

Monorepo contains:
- apps/web — Next.js 14 (App Router, TS)
- apps/api — NestJS + Kysely + pg (ALS for tenancy)
- apps/ai — FastAPI (OCR, column mapping, narratives, compliance guidance)
- jobs/worker — Graphile Worker tasks
- sql/ — Sqitch migrations (RLS, procs, partitions)

## Scope & Principles
- SQL-first; stored procedures for core mutations
- Multi-tenant with RLS; `SET LOCAL app.tenant_id`/`app.user_id` via ALS
- Files via S3 presigned URLs; evidence is content-addressed
- Parameterized SQL only; no `SELECT *`
- Observability with structured logs

## Getting Started

### Prerequisites
- Node 20+, pnpm
- Python 3.11+
- PostgreSQL 14+

### Install
```bash
pnpm install
```

### Run (dev)
- API
```bash
cd apps/api && pnpm dev
```
- Web
```bash
cd apps/web && pnpm dev
```
- AI
```bash
cd apps/ai
python -m venv .venv && . .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

### Database (Sqitch)
```bash
cd sql
sqitch deploy
sqitch verify
```

## Testing
- API: `cd apps/api && pnpm test`
- Web E2E: `cd apps/web && pnpm test:e2e`
- AI: `cd apps/ai && pytest -q`

## Repository Layout
```
apps/
  web/     Next.js app
  api/     NestJS API
  ai/      FastAPI AI service
jobs/
  worker/  Graphile Worker
sql/       Sqitch migrations
```

## Security & Tenancy
- No tenantId accepted from clients. Use ALS to set GUCs inside transactions.
- Enforce RLS on all tenant tables.

## Docs
See `docs/` for policies, ADRs, security, and contribution guidelines.

Project-wide execution docs:
- `PRD.md`
- `Progress.md`
- `architecture.md`
- `run_book.md`
