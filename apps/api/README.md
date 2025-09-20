# API (NestJS + Kysely + pg)

Thin orchestration layer over SQL stored procedures with strict tenancy and RBAC.

## Run
```bash
pnpm install
pnpm dev
```

## Env
- `DATABASE_URL`
- `PUBLIC_ORIGIN` (default http://localhost:3001)
- S3 exports/uploads:
  - `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- Tokens:
  - `AUDITOR_TOKEN_SECRET`, `SUPPLIER_TOKEN_SECRET`
- TTLs (optional):
  - `AUDITOR_TTL_HOURS` (default 168), `SUPPLIER_INVITE_TTL_HOURS` (default 168)

## Tests
```bash
pnpm test
```

## Notes
- All DB calls run under ALS with `SET LOCAL app.tenant_id`, `app.user_id`.
- Parameterized SQL only; no `SELECT *`.
