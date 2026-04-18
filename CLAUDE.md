# ESG OS — Project Memory

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query |
| API | NestJS, Kysely (SQL builder), GraphQL + REST, AsyncLocalStorage for tenancy |
| AI Service | FastAPI (Python 3.11+), Tesseract OCR, rapidfuzz, LLM integration |
| Database | PostgreSQL 14+ with RLS, Sqitch migrations, stored procedures |
| Worker | Graphile Worker (Node.js background jobs) |
| Storage | S3/MinIO (content-addressed evidence files) |
| Testing | Playwright (E2E), Jest (API), pytest (AI) |
| Infra | Docker Compose (postgres + minio), pnpm workspaces |

## Monorepo Layout

```
apps/web/     — Next.js frontend (port 5050)
apps/api/     — NestJS API (port 5051)
apps/ai/      — FastAPI AI service (port 8001)
jobs/worker/  — Graphile Worker background tasks
sql/          — Sqitch migrations (RLS, procs, partitions)
docker/       — Docker Compose files
scripts/      — Utility scripts
docs/         — ADRs, policies, guides
```

## Commands

```bash
# Install
pnpm install

# Start local infra (postgres + minio)
pnpm infra:up

# Deploy database schema
pnpm db:deploy && pnpm db:verify

# Dev servers
pnpm dev            # API + Web concurrently
pnpm dev:api        # API only (port 5051)
pnpm dev:web        # Web only (port 5050)

# AI service
cd apps/ai && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8001

# Tests
pnpm test:api       # Jest API tests
pnpm test:web:e2e   # Playwright E2E
cd apps/ai && pytest -q  # Python AI tests

# Full confidence check
pnpm verify:confidence   # API JWT + E2E + lint + build

# Seed demo data
pnpm seed:pilot-demo
```

## Architecture Rules

1. **SQL-first**: Stored procedures for core mutations. Business logic lives in PostgreSQL.
2. **Multi-tenant RLS**: `SET LOCAL app.tenant_id` via AsyncLocalStorage. Never accept tenant ID from client.
3. **Parameterized SQL only**: No `SELECT *`, no string interpolation in queries.
4. **Evidence is immutable**: Content-addressed S3 storage. Presigned URLs. MIME validation.
5. **AI is assistive**: Human-in-the-loop for all AI outputs. No autonomous PASS/FAIL decisions.
6. **Calculations are reproducible**: Factor sets are versioned. Recalcs are idempotent and traceable.
7. **Freeze is final**: Frozen periods are immutable. Auditor tokens are expiring and read-only.

## Conventions

- TypeScript strict mode in API and web
- Zod for runtime validation
- React Hook Form for forms
- `data-test` attributes on all interactive elements (for Playwright)
- Structured JSON logging
- GraphQL for data queries, REST for actions (exports, invites)
- Sqitch for all schema changes (no raw SQL migrations)

## Key Environment Variables

```
DATABASE_URL=postgres://postgres:esg@localhost:5432/esg-os
AUTH_MODE=jwt
JWT_SECRET=<secret>
PORT=5051 (API)
AI_SERVICE_URL=http://localhost:8001
```
