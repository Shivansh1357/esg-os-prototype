# Contributing Guide (v1.0.0)

## Prereqs
- Node 20+, pnpm, Python 3.11+, Docker
- `sqitch` CLI for migrations

## First-time Setup
```bash
git clone <repo>
pnpm i
docker compose -f docker/compose.yml up -d   # pg + minio
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/esg-os
sqitch deploy db:pg://postgres:postgres@localhost:5432/esg-os
pnpm dev   # runs web, api, ai, jobs in parallel
```

## Dev Workflow
1. Create a branch: `feat/<short-desc>`
2. Write/change SQL in `sql/deploy/*`, add `revert/*` and `verify/*`.
3. API resolvers: use **Kysely** with `withTenant()` (ALS) helper.
4. Frontend pages/components: add `data-testid` for Playwright.
5. Add/Update tests:
   - Unit (Jest) for services/procs wrappers.
   - SQL verify (sqitch verify or pgTAP).
   - E2E (Playwright) for core flows.
6. Commit with **Conventional Commits**.
7. Open PR. Ensure CI is **green**.

## Running Tests
```bash
pnpm test         # unit
pnpm test:e2e     # playwright
sqitch verify db:pg://postgres:postgres@localhost:5432/esg-os
```

## Code Style
- ESLint + Prettier; no `any` unless justified.
- Explicit return types on API/DB functions.
- No `SELECT *`. No naked user inputs. Always parameterize.
- GraphQL: limit query depth/complexity.

## Migrations
- Incremental, reversible. Provide `verify` scripts.
- **Never** alter RLS without approval.

## Release
- Merge to `main` via PR → tag `vX.Y.Z` → CI builds and deploys.
- Update `CHANGELOG.md` via conventional-changelog.

## Troubleshooting
- Check `docker logs` for pg/minio.
- `sqitch status` to see migration drift.
- Ensure ALS middleware is applied in Nest `main.ts`.
